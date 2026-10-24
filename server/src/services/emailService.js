import { EmailMessage } from '../models/EmailMessage.js';
import { EmailOutbox } from '../models/EmailOutbox.js';
import { ResourceRequest } from '../models/ResourceRequest.js';
import { User } from '../models/User.js';
import { config } from '../config.js';
import { createRequest, respondToClarification } from './resourceRequestService.js';
import { processResourceRequest } from './resourceAutomationService.js';
import { getRequestDetail } from './resourceRequestService.js';
import * as gmail from './gmailClient.js';
import { logger } from '../logger.js';
import { requestReceivedTemplate, manualReviewTemplate, assignmentConfirmedTemplate, adminManualReviewTemplate } from './emailTemplates.js';

const ADMIN_ESCALATION = 'admin';

function normaliseBody(value) {
  return value
    .replace(/^>.*$/gm, '')
    .replace(/(^|\n)--\s*\n[\s\S]*$/m, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractPurpose(body, subject = '') {
  const requirementLabel = /^(cpu|processor|ram|memory|storage|disk|gpu|gpu memory|vram|operating system|os|quantity|needed by|network|software)\b\s*[:=-]/i;
  const lines = String(body || '')
    .split(/\n+/)
    .map(line => line.replace(/^[\s>*\-•|]+/, '').replace(/\|+$/, '').replace(/\s*\|\s*/g, ': ').trim())
    .filter(Boolean)
    .filter(line => !requirementLabel.test(line))
    .filter(line => !/^(\|?\s*:?-{2,}:?\s*\|?)+$/.test(line));
  const purpose = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (purpose) return purpose.slice(0, 500);
  const cleanSubject = String(subject || '').replace(/^(request|need|please)\s*[:\-]\s*/i, '').trim();
  return cleanSubject ? `Request for ${cleanSubject}`.slice(0, 500) : 'IT resource request';
}

function requestBody(message) {
  const content = normaliseBody(message.body);
  return {
    title: message.subject || 'Email resource request',
    category: 'other',
    purpose: extractPurpose(content, message.subject),
    description: content.slice(0, 5000) || 'No readable message body was provided.',
    specifications: {},
    quantity: 1,
    urgency: 'normal',
    neededBy: null
  };
}

async function enqueue({ request, to, subject, body, htmlBody, kind, eventKey, threadId, inReplyTo }) {
  return EmailOutbox.findOneAndUpdate(
    { request: request._id, eventKey },
    { $setOnInsert: { request: request._id, eventKey, to, subject, body, htmlBody: htmlBody || null, kind, threadId: threadId || null, inReplyTo: inReplyTo || null } },
    { upsert: true, new: true }
  );
}

export async function sendPendingEmail(outbox) {
  const locked = await EmailOutbox.findOneAndUpdate(
    { _id: outbox._id, status: { $in: ['pending', 'failed'] } },
    { $set: { status: 'sending' }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (!locked) return false;
  try {
    const sent = await gmail.sendMessage(locked);
    await EmailOutbox.updateOne({ _id: locked._id }, { $set: { status: 'sent', sentAt: new Date() } });
    await EmailMessage.create({
      gmailMessageId: sent.id || `outbox-${locked._id}`,
      threadId: sent.threadId || locked.threadId || 'unknown',
      sender: config.gmail.userEmail,
      subject: locked.subject,
      request: locked.request,
      direction: 'outbound',
      status: 'completed'
    });
    return true;
  } catch (error) {
    await EmailOutbox.updateOne({ _id: locked._id }, { $set: { status: 'failed', lastError: error.message } });
    logger.error({ outboxId: String(locked._id), error: error.message }, 'Gmail delivery failed');
    return false;
  }
}

export async function flushEmailOutbox() {
  if (!config.gmail.enabled) return;
  const pending = await EmailOutbox.find({ status: { $in: ['pending', 'failed'] }, attempts: { $lt: 5 } }).limit(20);
  for (const item of pending) await sendPendingEmail(item);
}

async function processInbound(message) {
  const existing = await EmailMessage.findOne({ gmailMessageId: message.id });
  if (existing && ['completed', 'ignored'].includes(existing.status)) return existing.request;
  let record = existing;
  if (record?.status === 'processing') return record.request;
  if (record?.status === 'failed') {
    await EmailMessage.updateOne({ _id: record._id }, { $set: { status: 'processing', error: null } });
  } else if (!record) {
    try {
      record = await EmailMessage.create({
        gmailMessageId: message.id,
        threadId: message.threadId,
        sender: message.sender,
        subject: message.subject,
        direction: 'inbound',
        status: 'processing',
        receivedAt: message.receivedAt
      });
    } catch (error) {
      if (error.code === 11000) return (await EmailMessage.findOne({ gmailMessageId: message.id }))?.request;
      throw error;
    }
  }
  try {
    const user = await User.findOne({ email: message.sender }).lean();
    if (!user) {
      await EmailMessage.updateOne({ _id: record._id }, { $set: { status: 'ignored', error: 'Sender is not registered' } });
      return null;
    }
    const prior = await EmailMessage.findOne({ threadId: message.threadId, request: { $ne: null } }).sort({ receivedAt: -1 });
    let request;
    if (prior) {
      request = await ResourceRequest.findById(prior.request);
      if (request && request.status === 'CLARIFICATION_REQUIRED') {
        const updates = requestBody(message);
        request = await respondToClarification(prior.request, user, {
          message: message.body,
          updates: { purpose: updates.purpose, description: updates.description }
        });
        await processResourceRequest(request._id);
      }
    } else {
      request = await createRequest(user, requestBody(message), {
        triggerAutomation: false,
        inboundEmail: { messageId: message.id, threadId: message.threadId, sender: message.sender, subject: message.subject, receivedAt: message.receivedAt }
      });
      await processResourceRequest(request._id);
    }
    if (request) {
      const detail = await getRequestDetail(request._id, user);
      await EmailMessage.updateOne({ _id: record._id }, { $set: { request: request._id, status: 'completed', processedAt: new Date() } });
      const received = requestReceivedTemplate(detail);
      await enqueue({ request: detail, to: user.email, ...received, kind: 'acknowledgement', eventKey: 'request_received', threadId: message.threadId, inReplyTo: message.messageId });
      const assignment = detail.assignments?.find(item => item.status === 'active');
      const resultTemplate = detail.automation?.status === 'allocated' && assignment
        ? assignmentConfirmedTemplate(detail, assignment.asset)
        : manualReviewTemplate(detail);
      await enqueue({ request: detail, to: user.email, ...resultTemplate, kind: detail.automation?.status === 'allocated' ? 'assignment' : 'manual_review', eventKey: detail.automation?.status === 'allocated' ? `assignment:${assignment._id}` : 'manual_review', threadId: message.threadId, inReplyTo: message.messageId });
      if (detail.automation?.status !== 'allocated' && config.gmail.adminEmail) {
        const adminTemplate = adminManualReviewTemplate(detail, process.env.APP_URL);
        await enqueue({ request: detail, to: config.gmail.adminEmail, ...adminTemplate, kind: ADMIN_ESCALATION, eventKey: 'admin_manual_review', threadId: message.threadId });
      }
    }
    return request;
  } catch (error) {
    await EmailMessage.updateOne({ _id: record._id }, { $set: { status: 'failed', error: error.message } });
    throw error;
  }
}

let pollInFlight = null;

async function pollGmailOnceInternal() {
  if (!config.gmail.enabled) return { processed: 0 };
  const messages = await gmail.listUnreadMessages();
  let processed = 0;
  for (const summary of messages) {
    try {
      const message = gmail.parseMessage(await gmail.getMessage(summary.id));
      if (!message?.id || !message.threadId || !message.sender) {
        logger.warn({ code: 'invalid_gmail_message', gmailMessageId: summary.id }, 'Skipping malformed Gmail message');
        continue;
      }
      await processInbound(message);
      try {
        await gmail.markRead(message.id);
      } catch (error) {
        logger.warn({ gmailMessageId: message.id, error: error.message }, 'Gmail message processed but could not be marked read');
      }
      processed += 1;
    } catch (error) {
      logger.warn({
        code: error.code || 'gmail_message_processing_failed',
        status: error.status,
        gmailMessageId: summary.id
      }, 'Gmail message processing failed');
    }
  }
  await flushEmailOutbox();
  return { processed };
}

export function pollGmailOnce() {
  if (!pollInFlight) {
    pollInFlight = pollGmailOnceInternal().finally(() => {
      pollInFlight = null;
    });
  }
  return pollInFlight;
}

export function startGmailPolling() {
  if (!config.gmail.enabled) return () => {};
  let stopped = false;
  let timer;
  const run = () => {
    if (stopped) return Promise.resolve();
    return pollGmailOnce().catch(error => {
      logger.error({ error: error.message }, 'Gmail polling failed');
    });
  };
  timer = setInterval(run, config.gmail.pollIntervalMs);
  timer.unref?.();
  run();
  return async () => {
    stopped = true;
    clearInterval(timer);
    if (pollInFlight) await pollInFlight;
  };
}
