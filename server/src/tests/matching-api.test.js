import { request } from './setup.js';
import { Asset } from '../models/Asset.js';
import { Assignment } from '../models/Assignment.js';
import { ResourceRequest } from '../models/ResourceRequest.js';
import { auth, tokens, createRequest, createApprovedRequest, createAsset, transition } from './helpers/resources.js';

let t;
beforeAll(async () => { t = await tokens(); });

// Each test uses its own category-specific asset tags so assertions are not
// affected by assets created in other tests.
const matches = (token, id) => request.get(`/api/requests/${id}/matches`).set(auth(token));
const assign = (token, requestId, assetId, mode) =>
  request.post(`/api/requests/${requestId}/assignments`).set(auth(token)).send({ assetId, ...(mode ? { mode } : {}) });
const tags = (list) => list.map(c => c.asset.assetTag);

const SERVER_REQ = { category: 'server', title: 'DB server', specifications: { memoryGb: 64, cpuCores: 16, operatingSystem: 'Rocky Linux 9' } };
const serverAsset = (tag, specs = {}, extra = {}) => ({
  assetTag: tag, category: 'server', specs: { memoryGb: 64, cpuCores: 16, ...specs }, operatingSystem: 'Rocky Linux 9', ...extra
});

describe('authorization and validation', () => {
  test('only administrators can request matches', async () => {
    const req = await createRequest(t.user);
    expect((await matches(t.user, req._id)).status).toBe(403);   // even the owner
    expect((await matches(t.agent, req._id)).status).toBe(403);
    expect((await request.get(`/api/requests/${req._id}/matches`)).status).toBe(401);
    expect((await matches(t.admin, 'not-an-id')).status).toBe(400);
    expect((await matches(t.admin, '0123456789abcdef01234567')).status).toBe(404);
  });
});

describe('results', () => {
  test('ranks eligible assets and separates incompatible, unverified and unavailable ones', async () => {
    const req = await createApprovedRequest(t.user, t.admin, SERVER_REQ);
    await createAsset(t.admin, serverAsset('SRV-EXACT'));
    await createAsset(t.admin, serverAsset('SRV-BIG', { memoryGb: 256, cpuCores: 64 }));
    await createAsset(t.admin, serverAsset('SRV-SMALL', { memoryGb: 32 }));
    await createAsset(t.admin, serverAsset('SRV-NO-CPU', { cpuCores: undefined }));
    await createAsset(t.admin, serverAsset('SRV-WIN', {}, { operatingSystem: 'Windows Server 2022' }));
    await createAsset(t.admin, serverAsset('SRV-MAINT', {}, { status: 'maintenance' }));
    await createAsset(t.admin, { ...serverAsset('WS-NOT-SERVER'), category: 'workstation' });

    const r = await matches(t.admin, req._id);
    expect(r.status).toBe(200);
    const { candidates, summary, request: info, advisory, method } = r.body;
    expect(advisory).toBe(true);
    expect(method.version).toBe('fit-v1');
    expect(info).toMatchObject({ status: 'APPROVED', remaining: 1, allocatable: true });

    expect(tags(candidates.eligible)).toEqual(['SRV-EXACT', 'SRV-BIG']); // closer fit first
    expect(candidates.eligible[0].score).toBeGreaterThan(candidates.eligible[1].score);
    expect(candidates.eligible.every(c => c.eligibility === 'compatible' && c.availability.available)).toBe(true);
    expect(candidates.eligible[1].comparisons.find(c => c.field === 'memoryGb').result).toBe('exceeds');

    expect(tags(candidates.incompatible)).toEqual(['SRV-SMALL', 'SRV-WIN']);
    expect(candidates.incompatible.every(c => c.score === null && c.failures.length > 0)).toBe(true);

    expect(tags(candidates.needsVerification)).toEqual(['SRV-NO-CPU']);
    expect(candidates.needsVerification[0].unverified).toEqual(['CPU cores not recorded on the asset']);

    expect(tags(candidates.unavailable)).toEqual(['SRV-MAINT']);
    expect(candidates.unavailable[0].availability).toEqual({ status: 'maintenance', available: false });

    // wrong category is not evaluated in detail, only counted
    const all = [...candidates.eligible, ...candidates.incompatible, ...candidates.needsVerification, ...candidates.unavailable];
    expect(tags(all)).not.toContain('WS-NOT-SERVER');
    expect(summary.otherCategoryAvailable).toBeGreaterThan(0);
  });

  test('no eligible candidates yields an explanation', async () => {
    const req = await createApprovedRequest(t.user, t.admin, {
      category: 'networking', title: 'Core switch', specifications: { networkPorts: 48, networkSpeedGbps: 10 }
    });
    await createAsset(t.admin, { assetTag: 'NET-SMALL', category: 'networking', specs: { networkPorts: 24, networkSpeedGbps: 1 } });
    await createAsset(t.admin, { assetTag: 'NET-BUSY', category: 'networking', specs: { networkPorts: 48, networkSpeedGbps: 10 }, status: 'unavailable' });

    const r = await matches(t.admin, req._id);
    expect(r.body.candidates.eligible).toEqual([]);
    expect(r.body.explanation).toMatch(/No available asset satisfies/);
    expect(r.body.explanation).toMatch(/1 compatible asset\(s\) exist but are currently/);
    expect(r.body.explanation).toMatch(/1 asset\(s\) in this category fail/);
  });

  test('a request without structured specs gets a warning; review-stage requests get a preview', async () => {
    const req = await createRequest(t.user, { category: 'storage', title: 'Backup disk', specifications: {} });
    await transition(t.admin, req._id, 'UNDER_REVIEW');
    await createAsset(t.admin, { assetTag: 'STO-ANY', category: 'storage', specs: {} });

    const r = await matches(t.admin, req._id);
    const codes = r.body.warnings.map(w => w.code);
    expect(codes).toEqual(expect.arrayContaining(['NO_STRUCTURED_REQUIREMENTS', 'NOT_ALLOCATABLE']));
    expect(r.body.request.allocatable).toBe(false);
    expect(tags(r.body.candidates.eligible)).toContain('STO-ANY');
  });

  test('Other requests evaluate compatible assets across categories', async () => {
    const req = await createApprovedRequest(t.user, t.admin, {
      category: 'other',
      title: 'Compute box from email',
      specifications: { memoryGb: 32, cpuCores: 8 }
    });
    await createAsset(t.admin, { assetTag: 'OTHER-COMPAT', category: 'workstation', specs: { memoryGb: 64, cpuCores: 16 } });
    await createAsset(t.admin, { assetTag: 'OTHER-SMALL', category: 'standard_computer', specs: { memoryGb: 8, cpuCores: 4 } });

    const r = await matches(t.admin, req._id);
    expect(tags(r.body.candidates.eligible)).toContain('OTHER-COMPAT');
    expect(tags(r.body.candidates.incompatible)).toContain('OTHER-SMALL');
    expect(r.body.requirements.map(item => item.field)).not.toContain('category');
  });

  test('matching never creates assignments, reserves assets or changes the request', async () => {
    const req = await createApprovedRequest(t.user, t.admin, { ...SERVER_REQ, title: 'Side-effect check' });
    const a = await createAsset(t.admin, serverAsset('SRV-SIDE'));
    const before = {
      req: await ResourceRequest.findById(req._id).lean(),
      asset: await Asset.findById(a._id).lean(),
      assignments: await Assignment.countDocuments()
    };
    await matches(t.admin, req._id);
    await matches(t.admin, req._id);
    expect(await ResourceRequest.findById(req._id).lean()).toEqual(before.req);
    expect(await Asset.findById(a._id).lean()).toEqual(before.asset);
    expect(await Assignment.countDocuments()).toBe(before.assignments);
  });
});

describe('allocation revalidates instead of trusting matches', () => {
  test('incompatible or unverifiable assets cannot be assigned through the API', async () => {
    const req = await createApprovedRequest(t.user, t.admin, { ...SERVER_REQ, title: 'Direct incompatible' });
    const small = await createAsset(t.admin, serverAsset('SRV-DIRECT-SMALL', { memoryGb: 8 }));
    const unknown = await createAsset(t.admin, serverAsset('SRV-DIRECT-UNKNOWN', { cpuCores: undefined }));
    const wrongCat = await createAsset(t.admin, { ...serverAsset('WS-DIRECT'), category: 'workstation' });

    for (const [asset, code] of [[small, /does not meet/], [unknown, /cannot be verified/], [wrongCat, /does not meet/]]) {
      for (const mode of ['assign', 'propose']) {
        const r = await assign(t.admin, req._id, asset._id, mode);
        expect(r.status).toBe(409);
        expect(r.body.message).toMatch(code);
        const fresh = await Asset.findById(asset._id).lean();
        expect(fresh.status).toBe('available');          // claim rolled back
        expect(fresh.currentAssignment).toBeNull();
      }
    }
    const state = await ResourceRequest.findById(req._id).lean();
    expect(state.status).toBe('APPROVED');
    expect(state.allocation).toEqual({ active: 0, proposed: 0 });
    expect(await Assignment.countDocuments({ request: req._id })).toBe(0);
  });

  test('inventory changing after matching is caught at assignment time', async () => {
    const req = await createApprovedRequest(t.user, t.admin, { ...SERVER_REQ, title: 'Stale match' });
    const other = await createApprovedRequest(t.other, t.admin, { ...SERVER_REQ, title: 'Competing request' });
    const a = await createAsset(t.admin, serverAsset('SRV-STALE-A'));
    const b = await createAsset(t.admin, serverAsset('SRV-STALE-B'));

    const m = await matches(t.admin, req._id);
    expect(tags(m.body.candidates.eligible)).toEqual(expect.arrayContaining(['SRV-STALE-A', 'SRV-STALE-B']));

    // A's record is corrected after matching: now too little memory.
    await request.patch(`/api/assets/${a._id}`).set(auth(t.admin)).send({ specs: { memoryGb: 16, cpuCores: 16 } });
    const r1 = await assign(t.admin, req._id, a._id);
    expect(r1.status).toBe(409);
    expect(r1.body.message).toMatch(/does not meet/);

    // B is taken by another request after matching.
    expect((await assign(t.admin, other._id, b._id)).status).toBe(201);
    const r2 = await assign(t.admin, req._id, b._id);
    expect(r2.status).toBe(409);
    expect(r2.body.message).toMatch(/not available/);

    const fresh = await ResourceRequest.findById(req._id).lean();
    expect(fresh.allocation).toEqual({ active: 0, proposed: 0 });
    const rematch = (await matches(t.admin, req._id)).body.candidates;
    expect(tags(rematch.eligible)).not.toContain('SRV-STALE-A');
    expect(tags(rematch.eligible)).not.toContain('SRV-STALE-B');
    expect(tags(rematch.incompatible)).toContain('SRV-STALE-A');
    expect(tags(rematch.unavailable)).toContain('SRV-STALE-B');
  });

  test('approving a reservation re-checks compatibility', async () => {
    const req = await createApprovedRequest(t.user, t.admin, { ...SERVER_REQ, title: 'Reserved then changed' });
    const a = await createAsset(t.admin, serverAsset('SRV-RESERVED'));
    const p = await assign(t.admin, req._id, a._id, 'propose');
    expect(p.status).toBe(201);

    // Spec edits are allowed while reserved (only status changes are blocked).
    await request.patch(`/api/assets/${a._id}`).set(auth(t.admin)).send({ specs: { memoryGb: 32, cpuCores: 16 } });
    const approve = await request.post(`/api/assignments/${p.body.assignment._id}/approve`).set(auth(t.admin)).send({});
    expect(approve.status).toBe(409);
    expect(approve.body.message).toMatch(/does not meet/);

    const assignment = await Assignment.findById(p.body.assignment._id).lean();
    expect(assignment.status).toBe('proposed');
    expect((await Asset.findById(a._id).lean()).status).toBe('reserved');
    expect((await ResourceRequest.findById(req._id).lean()).allocation).toEqual({ active: 0, proposed: 1 });

    // The admin can still reject the reservation, freeing the asset.
    const reject = await request.post(`/api/assignments/${p.body.assignment._id}/reject`).set(auth(t.admin)).send({ reason: 'No longer meets spec' });
    expect(reject.status).toBe(200);
  });

  test('a compatible match can be assigned and drops out of the eligible list', async () => {
    const req = await createApprovedRequest(t.user, t.admin, { ...SERVER_REQ, title: 'Happy path', quantity: 2 });
    const a = await createAsset(t.admin, serverAsset('SRV-HAPPY'));
    const m = await matches(t.admin, req._id);
    const chosen = m.body.candidates.eligible.find(c => c.asset.assetTag === 'SRV-HAPPY');
    expect(chosen).toBeDefined();

    const r = await assign(t.admin, req._id, chosen.asset._id);
    expect(r.status).toBe(201);
    expect(r.body.request.status).toBe('PARTIALLY_ALLOCATED');
    const after = await matches(t.admin, req._id);
    expect(tags(after.body.candidates.eligible)).not.toContain('SRV-HAPPY');
    expect(tags(after.body.candidates.unavailable)).toContain('SRV-HAPPY');
    expect(after.body.request.remaining).toBe(1);
    expect(a._id).toBe(chosen.asset._id);
  });
});
