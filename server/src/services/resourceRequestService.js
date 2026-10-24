import mongoose from 'mongoose';
import { ResourceRequest } from '../models/ResourceRequest.js';
import { Assignment } from '../models/Assignment.js';
import { Asset } from '../models/Asset.js';
import { User } from '../models/User.js';
import {
  REQUEST_STATUS,
  REQUESTER_EDITABLE_STATUSES,
  TERMINAL_STATUSES,
  ASSIGNMENT_STATUS,
  ASSET_STATUS_VALUES,
  findManualTransition,
  allowedTransitionsFor
} from '../domain/resourceCatalog.js';
import { compactSpecs } from '../domain/specValidation.js';
import { httpError } from '../utils/httpError.js';
import { emitNotification } from './notificationService.js';
import { logger } from '../logger.js';
import { processResourceRequest } from './resourceAutomationService.js';
import { queueLifecycleEmail } from './emailNotificationService.js';

const S = REQUEST_STATUS;

export const isAdmin = (user) => user?.role === 'admin';
const isOwner = (request, user) => String(request.requester?._id ?? request.requester) === String(user._id);

function historyEntry(user, fields) {
  return { actor: user ? user._id : null, actorRole: user ? user.role : 'system', at: new Date(), ...fields };
}

function notFound() {
  return httpError(404, 'Request not found');
}

/** Loads a request the user may view; non-owners get 404 so IDs cannot be probed. */
async function loadVisible(id, user) {
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const request = await ResourceRequest.findById(id).lean();
  if (!request || (!isAdmin(user) && !isOwner(request, user))) throw notFound();
  return request;
}

export async function createRequest(user, body, { triggerAutomation = true, inboundEmail } = {}) {
  const requirements = {
    title: body.title,
    category: body.category,
    purpose: body.purpose,
    description: body.description,
    specifications: compactSpecs(body.specifications),
    quantity: body.quantity,
    urgency: body.urgency,
    neededBy: body.neededBy || null
  };
  const request = await ResourceRequest.create({
    requester: user._id,
    department: body.department || user.department || undefined,
    ...requirements,
    original: requirements,
    status: S.RECEIVED,
    ...(inboundEmail ? { inboundEmail } : {}),
    history: [historyEntry(user, { type: 'created', to: S.RECEIVED, message: 'Request submitted' })]
  });
  logger.info({ requestId: String(request._id), requester: String(user._id) }, 'Resource request created');
  if (triggerAutomation && process.env.NODE_ENV !== 'test') {
    processResourceRequest(String(request._id)).catch(error => {
      logger.error({ requestId: String(request._id), error: error.message }, 'Resource request automation failed');
    });
  }
  return getRequestDetail(request._id, user);
}

export async function listRequests(user, query) {
  const filter = {};
  if (!isAdmin(user) || query.mine) filter.requester = user._id;
  if (query.status?.length) filter.status = { $in: query.status };
  if (query.category) filter.category = query.category;
  if (query.urgency) filter.urgency = query.urgency;
  if (query.q) {
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.title = { $regex: escaped, $options: 'i' };
  }

  const { page, limit } = query;
  const sort = query.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };
  const [items, total] = await Promise.all([
    ResourceRequest.find(filter)
      .select('-history -original')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('requester', 'name email department')
      .lean(),
    ResourceRequest.countDocuments(filter)
  ]);
  return { items, total, page, limit };
}

export async function getRequestDetail(id, user) {
  const request = await loadVisible(id, user);
  const owner = isOwner(request, user);

  const [requester, assignments] = await Promise.all([
    User.findById(request.requester).select('name email department role').lean(),
    Assignment.find({ request: request._id })
      .sort({ createdAt: 1 })
      .populate('asset', 'assetTag name category manufacturer model specs operatingSystem location department status')
      .populate('assignedBy approvedBy endedBy', 'name')
      .lean()
  ]);

  const actorIds = [...new Set(request.history.map(h => h.actor).filter(Boolean).map(String))];
  const actors = await User.find({ _id: { $in: actorIds } }).select('name role').lean();
  const actorMap = new Map(actors.map(a => [String(a._id), { _id: a._id, name: a.name, role: a.role }]));

  return {
    ...request,
    requester,
    history: request.history.map(h => ({ ...h, actor: h.actor ? actorMap.get(String(h.actor)) || null : null })),
    assignments,
    allowedTransitions: allowedTransitionsFor(request.status, { isAdmin: isAdmin(user), isOwner: owner }),
    canEdit: owner && REQUESTER_EDITABLE_STATUSES.includes(request.status),
    canRespondToClarification: owner && request.status === S.CLARIFICATION_REQUIRED
  };
}

function diffFields(current, updates) {
  return Object.keys(updates).filter(k => JSON.stringify(current[k] ?? null) !== JSON.stringify(updates[k] ?? null));
}

function normaliseUpdates(updates) {
  const out = { ...updates };
  if ('specifications' in out) out.specifications = compactSpecs(out.specifications);
  if ('neededBy' in out && !out.neededBy) out.neededBy = null;
  return out;
}

/** Requester edits their submission while it is RECEIVED or awaiting clarification. */
export async function updateRequestByRequester(id, user, rawUpdates) {
  const current = await loadVisible(id, user);
  if (!isOwner(current, user)) throw httpError(403, 'Only the requester can edit this request');
  if (!REQUESTER_EDITABLE_STATUSES.includes(current.status)) {
    throw httpError(409, `Request cannot be edited while ${current.status}`);
  }
  const updates = normaliseUpdates(rawUpdates);
  const changed = diffFields(current, updates);
  if (!changed.length) return getRequestDetail(id, user);

  const doc = await ResourceRequest.findOneAndUpdate(
    { _id: id, requester: user._id, status: current.status },
    {
      $set: updates,
      $push: { history: historyEntry(user, { type: 'updated', from: current.status, to: current.status, message: `Updated: ${changed.join(', ')}` }) }
    },
    { new: true, runValidators: true }
  );
  if (!doc) throw httpError(409, 'Request changed while you were editing it; reload and try again');
  if (process.env.NODE_ENV !== 'test') {
    processResourceRequest(id).catch(error => {
      logger.error({ requestId: id, error: error.message }, 'Resource request reprocessing failed');
    });
  }
  return getRequestDetail(id, user);
}

export async function respondToClarification(id, user, { message, updates: rawUpdates = {} }) {
  const current = await loadVisible(id, user);
  if (!isOwner(current, user)) throw httpError(403, 'Only the requester can respond to a clarification');
  if (current.status !== S.CLARIFICATION_REQUIRED) throw httpError(409, 'This request is not awaiting clarification');

  const updates = normaliseUpdates(rawUpdates);
  const changed = diffFields(current, updates);
  const doc = await ResourceRequest.findOneAndUpdate(
    { _id: id, requester: user._id, status: S.CLARIFICATION_REQUIRED },
    {
      $set: { ...updates, status: S.UNDER_REVIEW },
      $unset: { pendingClarification: 1 },
      $push: {
        history: historyEntry(user, {
          type: 'clarification_response',
          from: S.CLARIFICATION_REQUIRED,
          to: S.UNDER_REVIEW,
          message,
          meta: changed.length ? { updatedFields: changed } : undefined
        })
      }
    },
    { new: true, runValidators: true }
  );
  if (!doc) throw httpError(409, 'Request changed concurrently; reload and try again');
  logger.info({ requestId: id }, 'Clarification response recorded');
  if (process.env.NODE_ENV !== 'test') {
    processResourceRequest(id).catch(error => {
      logger.error({ requestId: id, error: error.message }, 'Resource request reprocessing failed');
    });
  }
  return getRequestDetail(id, user);
}

/**
 * Manual status transition. The status precondition is part of the update
 * filter, so two concurrent transitions cannot both succeed.
 */
export async function transitionRequest(id, user, { to, reason, message }) {
  const current = await loadVisible(id, user);
  const from = current.status;
  const owner = isOwner(current, user);

  if (TERMINAL_STATUSES.includes(from)) throw httpError(409, `Request is ${from} and can no longer change status`);
  const rule = findManualTransition(from, to);
  if (!rule) throw httpError(409, `Transition ${from} → ${to} is not allowed`);
  const permitted = (isAdmin(user) && rule.roles.includes('admin')) || (owner && rule.roles.includes('requester'));
  if (!permitted) throw httpError(403, 'You are not allowed to perform this transition');

  const text = (rule.requires === 'message' ? message : reason)?.trim();
  if (rule.requires && !text) throw httpError(400, `A ${rule.requires} is required for this action`);

  const now = new Date();
  const set = { status: to };
  const unset = {};
  if (to === S.REJECTED) set.rejection = { reason: text, rejectedBy: user._id, rejectedAt: now };
  if (to === S.CLARIFICATION_REQUIRED) set.pendingClarification = { message: text, requestedBy: user._id, requestedAt: now };
  else if (from === S.CLARIFICATION_REQUIRED) unset.pendingClarification = 1;
  if (to === S.CLOSED) set.closure = { reason: text || reason || undefined, closedBy: user._id, closedAt: now };

  // Rejecting requires nothing allocated; closing requires no pending reservations
  // (active assignments stay in place and remain on record).
  const filter = { _id: id, status: from, 'allocation.proposed': 0 };
  if (to === S.REJECTED) filter['allocation.active'] = 0;

  const update = {
    $set: set,
    $push: { history: historyEntry(user, { type: 'status_change', from, to, message: text || reason || message || undefined }) }
  };
  if (Object.keys(unset).length) update.$unset = unset;

  const doc = await ResourceRequest.findOneAndUpdate(filter, update, { new: true, runValidators: true });
  if (!doc) {
    const fresh = await ResourceRequest.findById(id).select('status allocation').lean();
    if (fresh?.allocation?.proposed > 0) throw httpError(409, 'Resolve pending allocation proposals first');
    if (to === S.REJECTED && fresh?.allocation?.active > 0) throw httpError(409, 'Release allocated assets before rejecting');
    throw httpError(409, `Request status changed to ${fresh?.status}; reload and try again`);
  }

  logger.info({ requestId: id, from, to, actor: String(user._id) }, 'Request status changed');
  notifyRequester(doc, `Your request "${doc.title}" is now ${to.replace(/_/g, ' ').toLowerCase()}.`, user);
  if (to === S.REJECTED) {
    queueLifecycleEmail({ request: doc, kind: 'rejection', eventKey: 'rejection' });
  } else if (to === S.CLARIFICATION_REQUIRED) {
    queueLifecycleEmail({ request: doc, kind: 'manual_review', eventKey: 'clarification' });
  }
  return getRequestDetail(id, user);
}

export function notifyRequester(request, message, actor) {
  if (actor && String(actor._id) === String(request.requester)) return;
  emitNotification({
    userId: String(request.requester),
    type: 'request_update',
    message,
    metadata: { requestId: String(request._id), status: request.status }
  });
}

const ATTENTION_STATUSES = [S.RECEIVED, S.UNDER_REVIEW, S.APPROVED, S.ALLOCATION_PENDING, S.PARTIALLY_ALLOCATED];

/** Operational summary for administrators, computed from persisted data. */
export async function getAdminOverview() {
  const [byStatus, urgent, attention, assetsByStatus, proposedCount, activeCount] = await Promise.all([
    ResourceRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ResourceRequest.countDocuments({ urgency: { $in: ['high', 'critical'] }, status: { $nin: TERMINAL_STATUSES } }),
    ResourceRequest.find({ status: { $in: ATTENTION_STATUSES } })
      .select('title category status urgency quantity allocation createdAt requester')
      .sort({ createdAt: 1 })
      .limit(10)
      .populate('requester', 'name email department')
      .lean(),
    Asset.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Assignment.countDocuments({ status: ASSIGNMENT_STATUS.PROPOSED }),
    Assignment.countDocuments({ status: ASSIGNMENT_STATUS.ACTIVE })
  ]);

  const toMap = (rows, keys) => Object.fromEntries(keys.map(k => [k, rows.find(r => r._id === k)?.count || 0]));
  return {
    requestsByStatus: toMap(byStatus, Object.values(S)),
    urgentOpenRequests: urgent,
    needsAttention: attention,
    assetsByStatus: toMap(assetsByStatus, ASSET_STATUS_VALUES),
    assignments: { proposed: proposedCount, active: activeCount }
  };
}
