import { jest } from '@jest/globals';
import { request } from './setup.js';
import { Asset } from '../models/Asset.js';
import { Assignment } from '../models/Assignment.js';
import { ResourceRequest } from '../models/ResourceRequest.js';
import {
  auth, tokens, createRequest, createApprovedRequest, createAsset, transition
} from './helpers/resources.js';

let t;
beforeAll(async () => { t = await tokens(); });

const assign = (token, requestId, assetId, mode) =>
  request.post(`/api/requests/${requestId}/assignments`).set(auth(token)).send({ assetId, ...(mode ? { mode } : {}) });

async function dbState(requestId, assetId) {
  const [req, asset, assignments] = await Promise.all([
    ResourceRequest.findById(requestId).lean(),
    Asset.findById(assetId).lean(),
    Assignment.find({ asset: assetId }).lean()
  ]);
  return { req, asset, assignments };
}

test('an available asset can be assigned; asset, assignment, request and history are updated together', async () => {
  const req = await createApprovedRequest(t.user, t.admin);
  const asset = await createAsset(t.admin);

  const r = await assign(t.admin, req._id, asset._id);
  expect(r.status).toBe(201);
  expect(r.body.assignment.status).toBe('active');
  expect(r.body.request.status).toBe('ALLOCATED');
  expect(r.body.request.assignments).toHaveLength(1);
  expect(r.body.request.assignments[0].asset.assetTag).toBe(asset.assetTag);
  const last = r.body.request.history.at(-1);
  expect(last).toMatchObject({ type: 'assignment', from: 'APPROVED', to: 'ALLOCATED' });
  expect(last.actor.name).toBe('Admin');

  const s = await dbState(req._id, asset._id);
  expect(s.asset.status).toBe('allocated');
  expect(String(s.asset.currentAssignment)).toBe(String(r.body.assignment._id));
  expect(s.req.allocation).toEqual({ active: 1, proposed: 0 });

  // requester sees the assigned resource
  const mine = await request.get(`/api/requests/${req._id}`).set(auth(t.user));
  expect(mine.body.request.assignments[0].asset.assetTag).toBe(asset.assetTag);

  // assignments list (admin) shows it
  const list = await request.get(`/api/assignments?request=${req._id}`).set(auth(t.admin));
  expect(list.body.items).toHaveLength(1);
});

test('only administrators can assign', async () => {
  const req = await createApprovedRequest(t.user, t.admin);
  const asset = await createAsset(t.admin);
  expect((await assign(t.user, req._id, asset._id)).status).toBe(403);
  expect((await assign(t.agent, req._id, asset._id)).status).toBe(403);
  expect((await request.get('/api/assignments').set(auth(t.user))).status).toBe(403);
});

test('an unavailable asset cannot be assigned and nothing changes', async () => {
  const req = await createApprovedRequest(t.user, t.admin);
  const asset = await createAsset(t.admin, { status: 'maintenance' });

  const r = await assign(t.admin, req._id, asset._id);
  expect(r.status).toBe(409);
  expect(r.body.message).toMatch(/not available/);

  const s = await dbState(req._id, asset._id);
  expect(s.asset.status).toBe('maintenance');
  expect(s.assignments).toHaveLength(0);
  expect(s.req.status).toBe('APPROVED');
  expect(s.req.allocation).toEqual({ active: 0, proposed: 0 });
});

test('assets cannot be assigned before the request is approved', async () => {
  const req = await createRequest(t.user);
  const asset = await createAsset(t.admin);
  const r = await assign(t.admin, req._id, asset._id);
  expect(r.status).toBe(409);
  expect((await Asset.findById(asset._id).lean()).status).toBe('available');
});

test('the same asset cannot be assigned to two concurrent requests', async () => {
  const reqA = await createApprovedRequest(t.user, t.admin);
  const reqB = await createApprovedRequest(t.other, t.admin);
  const asset = await createAsset(t.admin);

  const results = await Promise.all([assign(t.admin, reqA._id, asset._id), assign(t.admin, reqB._id, asset._id)]);
  const statuses = results.map(r => r.status).sort();
  expect(statuses).toEqual([201, 409]);

  const current = await Assignment.find({ asset: asset._id, isCurrent: true }).lean();
  expect(current).toHaveLength(1);
  const fresh = await Asset.findById(asset._id).lean();
  expect(String(fresh.currentAssignment)).toBe(String(current[0]._id));

  const [a, b] = await Promise.all([ResourceRequest.findById(reqA._id).lean(), ResourceRequest.findById(reqB._id).lean()]);
  expect(a.allocation.active + b.allocation.active).toBe(1);
  expect([a.status, b.status].sort()).toEqual(['ALLOCATED', 'APPROVED']);
});

test('a request for one asset cannot be over-allocated by concurrent assignments', async () => {
  const req = await createApprovedRequest(t.user, t.admin);
  const [x, y] = [await createAsset(t.admin), await createAsset(t.admin)];

  const results = await Promise.all([assign(t.admin, req._id, x._id), assign(t.admin, req._id, y._id)]);
  expect(results.map(r => r.status).sort()).toEqual([201, 409]);

  const fresh = await ResourceRequest.findById(req._id).lean();
  expect(fresh.allocation.active).toBe(1);
  const assets = await Asset.find({ _id: { $in: [x._id, y._id] } }).lean();
  expect(assets.map(a => a.status).sort()).toEqual(['allocated', 'available']);
  expect(assets.find(a => a.status === 'available').currentAssignment).toBeNull();
});

test('multi-asset requests move through PARTIALLY_ALLOCATED to ALLOCATED', async () => {
  const req = await createApprovedRequest(t.user, t.admin, { quantity: 2, category: 'standard_computer', specifications: {} });
  const [x, y] = [await createAsset(t.admin, { category: 'standard_computer' }), await createAsset(t.admin, { category: 'standard_computer' })];

  const first = await assign(t.admin, req._id, x._id);
  expect(first.body.request.status).toBe('PARTIALLY_ALLOCATED');
  const second = await assign(t.admin, req._id, y._id);
  expect(second.body.request.status).toBe('ALLOCATED');
  expect(second.body.request.assignments).toHaveLength(2);
});

test('proposed allocations reserve the asset and can be approved or rejected', async () => {
  const req = await createApprovedRequest(t.user, t.admin, { quantity: 2, category: 'standard_computer', specifications: {} });
  const [x, y] = [await createAsset(t.admin), await createAsset(t.admin)];

  const px = await assign(t.admin, req._id, x._id, 'propose');
  expect(px.status).toBe(201);
  expect(px.body.assignment.status).toBe('proposed');
  expect(px.body.request.status).toBe('ALLOCATION_PENDING');
  expect((await Asset.findById(x._id).lean()).status).toBe('reserved');

  // a reserved asset cannot be assigned elsewhere
  const other = await createApprovedRequest(t.other, t.admin);
  expect((await assign(t.admin, other._id, x._id)).status).toBe(409);

  // cannot close while a proposal is pending
  const pendingClose = await transition(t.admin, req._id, 'CLOSED', { reason: 'x' });
  expect(pendingClose.status).toBe(409);

  const approve = await request.post(`/api/assignments/${px.body.assignment._id}/approve`).set(auth(t.admin)).send({});
  expect(approve.status).toBe(200);
  expect(approve.body.assignment.status).toBe('active');
  expect(approve.body.request.status).toBe('PARTIALLY_ALLOCATED');
  expect((await Asset.findById(x._id).lean()).status).toBe('allocated');

  // approving twice fails cleanly
  expect((await request.post(`/api/assignments/${px.body.assignment._id}/approve`).set(auth(t.admin)).send({})).status).toBe(409);

  const py = await assign(t.admin, req._id, y._id, 'propose');
  const reject = await request.post(`/api/assignments/${py.body.assignment._id}/reject`).set(auth(t.admin)).send({ reason: 'Wrong spec' });
  expect(reject.status).toBe(200);
  expect(reject.body.assignment).toMatchObject({ status: 'rejected', isCurrent: false, endReason: 'Wrong spec' });
  expect(reject.body.request.status).toBe('PARTIALLY_ALLOCATED');
  const freeY = await Asset.findById(y._id).lean();
  expect(freeY.status).toBe('available');
  expect(freeY.currentAssignment).toBeNull();
});

test('releasing an assignment returns the asset and keeps the record', async () => {
  const req = await createApprovedRequest(t.user, t.admin);
  const asset = await createAsset(t.admin);
  const a = await assign(t.admin, req._id, asset._id);

  // asset status cannot be changed while allocated
  expect((await request.patch(`/api/assets/${asset._id}`).set(auth(t.admin)).send({ status: 'maintenance' })).status).toBe(409);

  const rel = await request.post(`/api/assignments/${a.body.assignment._id}/release`).set(auth(t.admin)).send({ reason: 'Returned' });
  expect(rel.status).toBe(200);
  expect(rel.body.request.status).toBe('APPROVED');

  const s = await dbState(req._id, asset._id);
  expect(s.asset.status).toBe('available');
  expect(s.assignments).toHaveLength(1);
  expect(s.assignments[0]).toMatchObject({ status: 'released', isCurrent: false, endReason: 'Returned' });
  expect(s.req.history.filter(h => h.type === 'assignment')).toHaveLength(2);

  // the asset can now go to another request
  const next = await createApprovedRequest(t.other, t.admin);
  expect((await assign(t.admin, next._id, asset._id)).status).toBe(201);
});

test('closing an allocated request keeps its assignment records', async () => {
  const req = await createApprovedRequest(t.user, t.admin);
  const asset = await createAsset(t.admin);
  await assign(t.admin, req._id, asset._id);

  const closed = await transition(t.admin, req._id, 'CLOSED');
  expect(closed.status).toBe(200);
  expect(closed.body.request.status).toBe('CLOSED');
  expect(closed.body.request.assignments).toHaveLength(1);
  expect(closed.body.request.assignments[0].status).toBe('active');
  expect((await transition(t.admin, req._id, 'UNDER_REVIEW')).status).toBe(409);
});

test('allocation to a fully-allocated request rolls back the asset claim', async () => {
  // quantity 2 with one active + one proposed: still PARTIALLY_ALLOCATED (an
  // allocatable status) but at capacity, so the status pre-check passes.
  const req = await createApprovedRequest(t.user, t.admin, { quantity: 2 });
  const [x, y, z] = [await createAsset(t.admin), await createAsset(t.admin), await createAsset(t.admin)];
  await assign(t.admin, req._id, x._id);
  await assign(t.admin, req._id, y._id, 'propose');
  expect((await ResourceRequest.findById(req._id).lean()).status).toBe('PARTIALLY_ALLOCATED');

  // The asset is claimed first inside the transaction; the request capacity
  // check then fails, so the claim must be rolled back.
  const r = await assign(t.admin, req._id, z._id);
  expect(r.status).toBe(409);
  const freeZ = await Asset.findById(z._id).lean();
  expect(freeZ.status).toBe('available');
  expect(freeZ.currentAssignment).toBeNull();
  expect(await Assignment.countDocuments({ asset: z._id })).toBe(0);
  expect((await ResourceRequest.findById(req._id).lean()).allocation).toEqual({ active: 1, proposed: 1 });
});

test('a failure while recording the assignment leaves no partial state', async () => {
  const req = await createApprovedRequest(t.user, t.admin);
  const asset = await createAsset(t.admin);

  const spy = jest.spyOn(Assignment, 'create').mockRejectedValueOnce(new Error('simulated write failure'));
  const r = await assign(t.admin, req._id, asset._id);
  spy.mockRestore();

  expect(r.status).toBe(500);
  const s = await dbState(req._id, asset._id);
  expect(s.asset.status).toBe('available');
  expect(s.asset.currentAssignment).toBeNull();
  expect(s.assignments).toHaveLength(0);
  expect(s.req.status).toBe('APPROVED');
  expect(s.req.allocation).toEqual({ active: 0, proposed: 0 });
  expect(s.req.history.some(h => h.type === 'assignment')).toBe(false);
});
