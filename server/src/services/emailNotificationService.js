import { EmailOutbox } from '../models/EmailOutbox.js';
import { User } from '../models/User.js';
import { config } from '../config.js';
import { assignmentConfirmedTemplate, adminManualReviewTemplate, manualReviewTemplate, requestRejectedTemplate } from './emailTemplates.js';
import { logger } from '../logger.js';

export async function queueLifecycleEmail({ request, kind, eventKey, asset = null, admin = false }) {
  if (!config.gmail.enabled) return null;
  const requester = await User.findById(request.requester).select('email').lean();
  const to = admin ? config.gmail.adminEmail : requester?.email;
  if (!to) return null;
  const template = kind === 'assignment'
    ? assignmentConfirmedTemplate(request, asset)
    : kind === 'rejection'
      ? requestRejectedTemplate(request)
      : kind === 'manual_review'
        ? manualReviewTemplate(request)
        : adminManualReviewTemplate(request, process.env.APP_URL);
  try {
    return await EmailOutbox.findOneAndUpdate(
      { request: request._id, eventKey },
      { $setOnInsert: { request: request._id, eventKey, to, subject: template.subject, body: template.text, htmlBody: template.html, kind } },
      { upsert: true, new: true }
    );
  } catch (error) {
    logger.error({ requestId: String(request._id), eventKey, error: error.message }, 'Lifecycle email could not be queued');
    return null;
  }
}
