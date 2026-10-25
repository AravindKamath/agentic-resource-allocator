import mongoose from 'mongoose';
import { Asset } from '../models/Asset.js';
import { ResourceRequest } from '../models/ResourceRequest.js';
import { ASSET_STATUS, ALLOCATABLE_STATUSES } from '../domain/resourceCatalog.js';
import {
  ELIGIBILITY,
  MATCHING_VERSION,
  SCORING,
  compareCandidates,
  describeRequirements,
  evaluateAsset
} from '../domain/matching.js';
import { httpError } from '../utils/httpError.js';

const ASSET_FIELDS = 'assetTag name category manufacturer model specs operatingSystem software location department status currentAssignment';

function toCandidate(asset, evaluation) {
  return {
    asset: {
      _id: asset._id,
      assetTag: asset.assetTag,
      name: asset.name,
      category: asset.category,
      manufacturer: asset.manufacturer,
      model: asset.model,
      specs: asset.specs || {},
      operatingSystem: asset.operatingSystem,
      location: asset.location,
      department: asset.department
    },
    availability: {
      status: asset.status,
      available: asset.status === ASSET_STATUS.AVAILABLE && !asset.currentAssignment
    },
    ...evaluation
  };
}

/**
 * Advisory matching for one request. Read-only: never creates assignments,
 * reserves assets or changes the request. The allocation service re-checks
 * compatibility and availability inside its transaction, so a stale result
 * cannot be used to assign an ineligible asset.
 */
export async function getMatches(requestId) {
  if (!mongoose.isValidObjectId(requestId)) throw httpError(404, 'Request not found');
  const request = await ResourceRequest.findById(requestId)
    .select('title category specifications quantity allocation status department')
    .lean();
  if (!request) throw httpError(404, 'Request not found');

  const { requirements, warnings } = describeRequirements(request);
  const remaining = Math.max(0, request.quantity - request.allocation.active - request.allocation.proposed);
  const allocatable = ALLOCATABLE_STATUSES.includes(request.status) && remaining > 0;

  if (!ALLOCATABLE_STATUSES.includes(request.status)) {
    warnings.push({ code: 'NOT_ALLOCATABLE', severity: 'info',
      message: `Request is ${request.status}; this is a preview. Assets can be assigned once the request is approved.` });
  } else if (remaining === 0) {
    warnings.push({ code: 'NO_REMAINING_QUANTITY', severity: 'info',
      message: 'All requested assets are already assigned or reserved.' });
  }

  const categoryRestricted = request.category && request.category !== 'other';
  const [assets, otherCategoryAvailable] = await Promise.all([
    Asset.find({
      ...(categoryRestricted ? { category: request.category } : {}),
      status: { $ne: ASSET_STATUS.RETIRED }
    }).select(ASSET_FIELDS).lean(),
    categoryRestricted ? Asset.countDocuments({ category: { $ne: request.category }, status: ASSET_STATUS.AVAILABLE }) : 0
  ]);

  const groups = { eligible: [], needsVerification: [], incompatible: [], unavailable: [] };
  for (const asset of assets) {
    const candidate = toCandidate(asset, evaluateAsset(request, asset));
    if (candidate.eligibility === ELIGIBILITY.INCOMPATIBLE) groups.incompatible.push(candidate);
    else if (!candidate.availability.available) groups.unavailable.push(candidate);
    else if (candidate.eligibility === ELIGIBILITY.COMPATIBLE) groups.eligible.push(candidate);
    else groups.needsVerification.push(candidate);
  }
  groups.eligible.sort(compareCandidates);
  for (const key of ['needsVerification', 'incompatible', 'unavailable']) {
    groups[key].sort((x, y) => x.asset.assetTag.localeCompare(y.asset.assetTag));
  }

  const summary = {
    evaluated: assets.length,
    eligible: groups.eligible.length,
    needsVerification: groups.needsVerification.length,
    incompatible: groups.incompatible.length,
    unavailable: groups.unavailable.length,
    unavailableCompatible: groups.unavailable.filter(c => c.eligibility === ELIGIBILITY.COMPATIBLE).length,
    otherCategoryAvailable
  };

  return {
    requestId: String(request._id),
    generatedAt: new Date().toISOString(),
    advisory: true,
    method: { version: MATCHING_VERSION, scoring: SCORING },
    request: { status: request.status, category: request.category, quantity: request.quantity, remaining, allocatable },
    requirements,
    warnings,
    candidates: groups,
    summary,
    explanation: groups.eligible.length ? null : explainNoMatch(summary, request.category, categoryRestricted)
  };
}

function explainNoMatch(s, category, categoryRestricted) {
  const parts = ['No available asset satisfies every stated requirement.'];
  if (s.unavailableCompatible) parts.push(`${s.unavailableCompatible} compatible asset(s) exist but are currently allocated, reserved, under maintenance or unavailable.`);
  if (s.needsVerification) parts.push(`${s.needsVerification} available asset(s) might qualify but are missing specification data; complete their records to verify them.`);
  if (s.incompatible) parts.push(`${s.incompatible} evaluated asset(s) fail at least one requirement.`);
  if (!s.evaluated) {
    parts.push(categoryRestricted
      ? `No non-retired assets are recorded in the requested category (${category}).`
      : 'No non-retired assets are recorded for this request.');
  }
  return parts.join(' ');
}
