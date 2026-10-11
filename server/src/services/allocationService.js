import mongoose from 'mongoose';
import { Asset } from '../models/Asset.js';
import { Assignment } from '../models/Assignment.js';
import { ResourceRequest } from '../models/ResourceRequest.js';
import {
  ALLOCATABLE_STATUSES,
  ALLOCATION_STATUSES,
  ASSET_STATUS,
  ASSIGNMENT_STATUS,
  deriveAllocationStatus
} from '../domain/resourceCatalog.js';
import { runInTransaction } from '../utils/transactions.js';
import { evaluateAsset, ELIGIBILITY } from '../domain/matching.js';
import { httpError } from '../utils/httpError.js';
import { notifyRequester } from './resourceRequestService.js';
import { logger } from '../logger.js';

/*
 * Consistency strategy
 * --------------------
 * Every allocation change touches three documents (Asset, Assignment,
 * ResourceRequest) and runs in one MongoDB transaction. Inside it, each write
 * is a conditional update whose filter encodes the precondition (asset is
 * available, request has spare capacity, assignment is still proposed, ...).
 * If any precondition fails we throw, which aborts the transaction and rolls
 * back the earlier writes. Concurrent attempts on the same asset collide on the
 * asset document (write conflict); the driver retries the loser, whose
 * precondition then fails, so exactly one succeeds. A partial unique index on
 * Assignment {asset} where isCurrent=true is a second, database-level guard.
 */

/**
 * Authoritative compatibility check, run inside the transaction against the
 * asset document as just claimed/updated and the request as read in the same
 * session. Throwing here aborts the transaction (rolling back the claim).
 */
function assertCompatible(request, asset) {
  const result = evaluateAsset(request, asset);
  if (result.eligibility === ELIGIBILITY.INCOMPATIBLE) {
    throw httpError(409, `Asset ${asset.assetTag} does not meet the request's requirements: ${result.failures.join('; ')}`, { code: 'ASSET_INCOMPATIBLE' });
  }
  if (result.eligibility === ELIGIBILITY.UNVERIFIED) {
    throw httpError(409, `Asset ${asset.assetTag} cannot be verified against the request's requirements: ${result.unverified.join('; ')}. Complete the asset record first.`, { code: 'ASSET_UNVERIFIED' });
  }
}

function assertId(id, what) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, `${what} not found`);
}

/** Applies counter deltas to the request, re-derives its status and records history. */
async function applyRequestAllocationChange(session, requestId, { inc, filterExtra = {}, actor, message, meta }) {
  const counted = await ResourceRequest.findOneAndUpdate(
    { _id: requestId, ...filterExtra },
    { $inc: inc },
    { new: true, session }
  );
  if (!counted) return null;

  const from = counted.status;
  const to = ALLOCATION_STATUSES.includes(from)
    ? deriveAllocationStatus({ active: counted.allocation.active, proposed: counted.allocation.proposed, quantity: counted.quantity })
    : from; // e.g. CLOSED: counts change, status does not.

  return ResourceRequest.findOneAndUpdate(
    { _id: requestId },
    {
      $set: { status: to },
      $push: { history: { type: 'assignment', from, to, actor: actor._id, actorRole: actor.role, message, meta, at: new Date() } }
    },
    { new: true, session, runValidators: true }
  );
}

/**
 * Assign (mode 'assign') or reserve pending approval (mode 'propose') an asset
 * for a request.
 */
export async function assignAsset({ requestId, assetId, actor, mode = 'assign', notes }) {
  assertId(requestId, 'Request');
  assertId(assetId, 'Asset');
  const proposing = mode === 'propose';

  const result = await runInTransaction(async (session) => {
    const request = await ResourceRequest.findById(requestId).session(session)
      .select('status quantity allocation title requester category specifications department').lean();
    if (!request) throw httpError(404, 'Request not found');
    if (!ALLOCATABLE_STATUSES.includes(request.status)) {
      throw httpError(409, `Assets cannot be assigned while the request is ${request.status}`);
    }

    const assignmentId = new mongoose.Types.ObjectId();

    // 1. Claim the asset only if it is available and unassigned.
    const asset = await Asset.findOneAndUpdate(
      { _id: assetId, status: ASSET_STATUS.AVAILABLE, currentAssignment: null },
      { $set: { status: proposing ? ASSET_STATUS.RESERVED : ASSET_STATUS.ALLOCATED, currentAssignment: assignmentId } },
      { new: true, session }
    );
    if (!asset) {
      const existing = await Asset.findById(assetId).session(session).select('assetTag status').lean();
      if (!existing) throw httpError(404, 'Asset not found');
      throw httpError(409, `Asset ${existing.assetTag} is not available (status: ${existing.status})`);
    }

    // 1b. Re-check compatibility on the claimed asset; never trust an earlier
    //     (possibly stale) matching result supplied by the client.
    assertCompatible(request, asset);

    // 2. Reserve capacity on the request; fails if it is full or changed status.
    const updatedRequest = await applyRequestAllocationChange(session, requestId, {
      inc: proposing ? { 'allocation.proposed': 1 } : { 'allocation.active': 1 },
      filterExtra: {
        status: { $in: ALLOCATABLE_STATUSES },
        $expr: { $lt: [{ $add: ['$allocation.active', '$allocation.proposed'] }, '$quantity'] }
      },
      actor,
      message: proposing
        ? `Asset ${asset.assetTag} reserved, pending approval`
        : `Asset ${asset.assetTag} assigned`,
      meta: { assignmentId: String(assignmentId), assetId: String(asset._id), assetTag: asset.assetTag }
    });
    if (!updatedRequest) throw httpError(409, 'Request already has all requested assets assigned or reserved');

    // 3. Record the assignment.
    const [assignment] = await Assignment.create([{
      _id: assignmentId,
      request: requestId,
      asset: asset._id,
      status: proposing ? ASSIGNMENT_STATUS.PROPOSED : ASSIGNMENT_STATUS.ACTIVE,
      assignedBy: actor._id,
      approvedBy: proposing ? null : actor._id,
      approvedAt: proposing ? null : new Date(),
      notes
    }], { session });

    return { assignment: assignment.toObject(), asset: asset.toObject(), request: updatedRequest.toObject() };
  });

  logger.info({ requestId, assetId, assignmentId: String(result.assignment._id), mode, actor: String(actor._id) }, 'Asset assignment recorded');
  notifyRequester(result.request, proposing
    ? `An asset has been reserved for your request "${result.request.title}".`
    : `Asset ${result.asset.assetTag} has been assigned to your request "${result.request.title}".`, actor);
  return result;
}

async function loadAssignmentForUpdate(session, assignmentId, expectedStatus) {
  const assignment = await Assignment.findById(assignmentId).session(session).lean();
  if (!assignment) throw httpError(404, 'Assignment not found');
  if (assignment.status !== expectedStatus) {
    throw httpError(409, `Assignment is ${assignment.status}, expected ${expectedStatus}`);
  }
  return assignment;
}

export async function approveAssignment({ assignmentId, actor }) {
  assertId(assignmentId, 'Assignment');
  const result = await runInTransaction(async (session) => {
    const current = await loadAssignmentForUpdate(session, assignmentId, ASSIGNMENT_STATUS.PROPOSED);

    const assignment = await Assignment.findOneAndUpdate(
      { _id: assignmentId, status: ASSIGNMENT_STATUS.PROPOSED },
      { $set: { status: ASSIGNMENT_STATUS.ACTIVE, isCurrent: true, approvedBy: actor._id, approvedAt: new Date() } },
      { new: true, session }
    );
    if (!assignment) throw httpError(409, 'Assignment changed concurrently');

    const asset = await Asset.findOneAndUpdate(
      { _id: current.asset, status: ASSET_STATUS.RESERVED, currentAssignment: current._id },
      { $set: { status: ASSET_STATUS.ALLOCATED } },
      { new: true, session }
    );
    if (!asset) throw httpError(409, 'Asset is no longer reserved for this assignment');

    // The asset record or request may have changed while reserved.
    const requirementsOf = await ResourceRequest.findById(current.request).session(session)
      .select('category specifications department').lean();
    assertCompatible(requirementsOf, asset);

    const request = await applyRequestAllocationChange(session, current.request, {
      inc: { 'allocation.proposed': -1, 'allocation.active': 1 },
      filterExtra: { 'allocation.proposed': { $gte: 1 } },
      actor,
      message: `Reservation of asset ${asset.assetTag} approved`,
      meta: { assignmentId: String(assignmentId), assetTag: asset.assetTag }
    });
    if (!request) throw httpError(409, 'Request allocation state is inconsistent');

    return { assignment: assignment.toObject(), asset: asset.toObject(), request: request.toObject() };
  });
  notifyRequester(result.request, `Asset ${result.asset.assetTag} has been assigned to your request "${result.request.title}".`, actor);
  return result;
}

/** Ends a current assignment: rejects a proposal or releases an active allocation. */
async function endAssignment({ assignmentId, actor, reason, expectedStatus, endStatus, verb }) {
  assertId(assignmentId, 'Assignment');
  return runInTransaction(async (session) => {
    const current = await loadAssignmentForUpdate(session, assignmentId, expectedStatus);

    const assignment = await Assignment.findOneAndUpdate(
      { _id: assignmentId, status: expectedStatus },
      { $set: { status: endStatus, isCurrent: false, endedBy: actor._id, endedAt: new Date(), endReason: reason } },
      { new: true, session }
    );
    if (!assignment) throw httpError(409, 'Assignment changed concurrently');

    const asset = await Asset.findOneAndUpdate(
      { _id: current.asset, currentAssignment: current._id },
      { $set: { status: ASSET_STATUS.AVAILABLE, currentAssignment: null } },
      { new: true, session }
    );
    if (!asset) throw httpError(409, 'Asset is not held by this assignment');

    const counter = expectedStatus === ASSIGNMENT_STATUS.PROPOSED ? 'allocation.proposed' : 'allocation.active';
    const request = await applyRequestAllocationChange(session, current.request, {
      inc: { [counter]: -1 },
      filterExtra: { [counter]: { $gte: 1 } },
      actor,
      message: `Asset ${asset.assetTag} ${verb}${reason ? `: ${reason}` : ''}`,
      meta: { assignmentId: String(assignmentId), assetTag: asset.assetTag }
    });
    if (!request) throw httpError(409, 'Request allocation state is inconsistent');

    return { assignment: assignment.toObject(), asset: asset.toObject(), request: request.toObject() };
  });
}

export function rejectAssignment({ assignmentId, actor, reason }) {
  return endAssignment({
    assignmentId, actor, reason,
    expectedStatus: ASSIGNMENT_STATUS.PROPOSED,
    endStatus: ASSIGNMENT_STATUS.REJECTED,
    verb: 'reservation rejected'
  });
}

export function releaseAssignment({ assignmentId, actor, reason }) {
  return endAssignment({
    assignmentId, actor, reason,
    expectedStatus: ASSIGNMENT_STATUS.ACTIVE,
    endStatus: ASSIGNMENT_STATUS.RELEASED,
    verb: 'released'
  });
}

export async function listAssignments(query) {
  const filter = {};
  if (query.status?.length) filter.status = { $in: query.status };
  if (query.request) filter.request = query.request;
  if (query.asset) filter.asset = query.asset;
  const { page, limit } = query;

  const [items, total] = await Promise.all([
    Assignment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('asset', 'assetTag name category model status')
      .populate({ path: 'request', select: 'title status requester quantity', populate: { path: 'requester', select: 'name email department' } })
      .populate('assignedBy approvedBy endedBy', 'name')
      .lean(),
    Assignment.countDocuments(filter)
  ]);
  return { items, total, page, limit };
}
