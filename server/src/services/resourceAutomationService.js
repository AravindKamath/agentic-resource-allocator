import crypto from 'node:crypto';
import { config } from '../config.js';
import { ResourceRequest } from '../models/ResourceRequest.js';
import { User } from '../models/User.js';
import { getMatches } from './matchingService.js';
import { assignAsset } from './allocationService.js';
import { transitionRequest } from './resourceRequestService.js';
import { httpPostJson } from '../utils/httpClient.js';
import { specsSchema } from '../domain/specValidation.js';
import { CATEGORY_KEYS } from '../domain/resourceCatalog.js';
import { logger } from '../logger.js';

const SYSTEM_TRACE = 'resource-automation';

function sourceText(request) {
  return [request.title, request.purpose, request.description].join(' ').trim();
}

function sourceHash(request) {
  return crypto.createHash('sha256').update(sourceText(request)).digest('hex');
}

function validateExtraction(result) {
  if (!result || !['EXTRACTED', 'NEEDS_CLARIFICATION', 'UNSUPPORTED'].includes(result.extractionStatus)) {
    throw new Error('Invalid resource extraction status');
  }
  if (result.category && !CATEGORY_KEYS.includes(result.category)) {
    throw new Error('Invalid extracted category');
  }
  const { error } = specsSchema.validate(result.specifications || {});
  if (error) throw new Error(`Invalid extracted specifications: ${error.message}`);
  return result;
}

async function mark(requestId, update) {
  await ResourceRequest.updateOne({ _id: requestId }, {
    $set: { ...update, 'automation.processedAt': new Date() }
  });
}

export async function processResourceRequest(requestId) {
  if (!config.resourceAutomation.enabled) return { status: 'disabled' };
  const current = await ResourceRequest.findById(requestId).lean();
  if (!current) return { status: 'not_found' };
  const currentHash = sourceHash(current);
  if (current.automation?.sourceHash === currentHash &&
      ['allocated', 'escalated'].includes(current.automation?.status)) {
    return { status: 'already_processing_or_complete' };
  }
  const request = await ResourceRequest.findOneAndUpdate(
    { _id: requestId, 'automation.status': { $ne: 'processing' } },
    { $set: { 'automation.status': 'processing' } },
    { new: true }
  ).lean();
  if (!request) return { status: 'already_processing_or_complete' };

  try {
    const result = validateExtraction(await httpPostJson(
      `${config.agent.baseUrl}/resource-extract`,
      {
        traceId: `${SYSTEM_TRACE}-${requestId}`,
        title: request.title,
        purpose: request.purpose,
        description: request.description,
        category: request.category,
        specifications: request.specifications,
        quantity: request.quantity
      },
      { timeoutMs: config.agent.timeoutMs, headers: { 'x-trace-id': requestId } }
    ));

    if (result.sourceHash && result.sourceHash !== currentHash) {
      throw new Error('Extraction source hash does not match request text');
    }

    await ResourceRequest.updateOne({ _id: requestId }, {
      $set: {
        category: result.category || request.category,
        purpose: result.purpose || request.purpose,
        specifications: result.specifications || request.specifications,
        quantity: result.quantity || request.quantity,
        'automation.sourceHash': result.sourceHash || currentHash,
        'automation.extraction': result,
        'automation.outcomeCode': result.extractionStatus === 'EXTRACTED' ? 'NONE' : 'MISSING_REQUIREMENTS'
      }
    });

    const admin = await User.findOne(
      config.gmail.adminEmail ? { email: config.gmail.adminEmail, role: 'admin' } : { role: 'admin' }
    ).lean();
    if (!admin) {
      await mark(requestId, { 'automation.status': 'escalated', 'automation.outcomeCode': 'EXTRACTION_UNAVAILABLE', 'automation.reason': 'No administrator account is available for automation.' });
      return { status: 'escalated' };
    }

    if (result.extractionStatus !== 'EXTRACTED') {
      await transitionRequest(requestId, admin, {
        to: 'CLARIFICATION_REQUIRED',
        message: result.reason || `Please clarify: ${(result.missingFields || []).join(', ') || 'the resource requirements'}.`
      });
      await mark(requestId, { 'automation.status': 'escalated', 'automation.outcomeCode': 'MISSING_REQUIREMENTS', 'automation.reason': result.reason });
      return { status: 'escalated' };
    }

    const matches = await getMatches(requestId);
    if (matches.summary.eligible < request.quantity) {
      const code = matches.summary.eligible ? 'INSUFFICIENT_QUANTITY' : 'NO_COMPATIBLE_ASSET';
      await transitionRequest(requestId, admin, { to: 'UNDER_REVIEW' });
      await mark(requestId, {
        'automation.status': 'escalated',
        'automation.outcomeCode': code,
        'automation.reason': matches.explanation || 'Available compatible inventory cannot satisfy the requested quantity.'
      });
      return { status: 'escalated', code };
    }

    await transitionRequest(requestId, admin, { to: 'UNDER_REVIEW' });
    await transitionRequest(requestId, admin, { to: 'APPROVED' });
    let assigned = 0;
    for (const candidate of matches.candidates.eligible) {
      if (assigned >= request.quantity) break;
      try {
        await assignAsset({ requestId, assetId: candidate.asset._id, actor: admin, mode: 'assign' });
        assigned += 1;
      } catch (error) {
        if (error.status === 409) continue;
        throw error;
      }
    }
    if (assigned < request.quantity) {
      await mark(requestId, { 'automation.status': 'escalated', 'automation.outcomeCode': 'INSUFFICIENT_QUANTITY', 'automation.reason': 'The available compatible inventory could not satisfy the requested quantity.' });
      return { status: 'escalated' };
    }
    await mark(requestId, { 'automation.status': 'allocated', 'automation.outcomeCode': 'NONE', 'automation.reason': 'Automatically allocated through the transactional allocation service.' });
    return { status: 'allocated', assigned };
  } catch (error) {
    const code = error.status === 409 ? 'ALLOCATION_CONFLICT' : 'EXTRACTION_UNAVAILABLE';
    await mark(requestId, { 'automation.status': 'failed', 'automation.outcomeCode': code, 'automation.reason': error.message, 'automation.sourceHash': currentHash });
    logger.warn({ requestId, code }, 'Resource automation escalated');
    return { status: 'failed', code };
  }
}
