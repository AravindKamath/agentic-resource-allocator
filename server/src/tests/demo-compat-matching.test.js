import { request } from './setup.js';
import { Asset } from '../models/Asset.js';
import { Assignment } from '../models/Assignment.js';
import { ResourceRequest } from '../models/ResourceRequest.js';
import { auth, tokens, createRequest, createAsset, transition } from './helpers/resources.js';

let t;
beforeAll(async () => {
  t = await tokens();
});

describe('DEMO-WS-COMPAT-001 Deterministic Matching and Allocation Test', () => {
  test('end-to-end evaluation, approval gate, matching, allocation and second assignment attempt', async () => {
    // 2. Create isolated test asset matching fixture specifications
    const assetPayload = {
      assetTag: 'DEMO-WS-COMPAT-001',
      name: 'Demo ML Workstation Compatible',
      category: 'workstation',
      manufacturer: 'Lenovo',
      model: 'ThinkStation P620',
      specs: {
        cpuCores: 16,
        memoryGb: 64,
        storageGb: 2000,
        storageType: 'nvme',
        gpuModel: 'NVIDIA RTX 4090',
        gpuMemoryGb: 24
      },
      operatingSystem: 'Ubuntu 22.04',
      location: 'Research Lab',
      department: 'Computer Science',
      status: 'available'
    };

    // If already exists in test DB, remove it first to ensure clean state
    await Asset.deleteMany({ assetTag: 'DEMO-WS-COMPAT-001' });

    const createdAsset = await createAsset(t.admin, assetPayload);
    expect(createdAsset.assetTag).toBe('DEMO-WS-COMPAT-001');
    expect(createdAsset.category).toBe('workstation');
    expect(createdAsset.status).toBe('available');
    expect(createdAsset.currentAssignment).toBeNull();
    expect(createdAsset.specs).toEqual(assetPayload.specs);
    expect(createdAsset.operatingSystem).toBe('Ubuntu 22.04');

    // 3. Create a resource request with category workstation and exact minimum requirements
    const requestPayload = {
      title: 'High-performance workstation for ML research',
      category: 'workstation',
      purpose: 'Model training and inference testing',
      description: 'Require workstation with 16 cores, 64GB RAM, NVMe storage and 24GB RTX 4090 GPU.',
      specifications: {
        cpuCores: 16,
        memoryGb: 64,
        storageGb: 2000,
        storageType: 'nvme',
        gpuCount: 1,
        gpuMemoryGb: 24,
        operatingSystem: 'Ubuntu 22.04'
      },
      quantity: 1,
      urgency: 'normal'
    };

    const createdReq = await createRequest(t.user, requestPayload);
    expect(createdReq.category).toBe('workstation');
    expect(createdReq.status).toBe('RECEIVED');
    expect(createdReq.quantity).toBe(1);
    expect(createdReq.specifications).toEqual(requestPayload.specifications);

    // 4. Verify matching before allocation (at preview stage while RECEIVED)
    const previewMatchRes = await request.get(`/api/requests/${createdReq._id}/matches`).set(auth(t.admin));
    expect(previewMatchRes.status).toBe(200);

    console.log('--- PREVIEW MATCH RESPONSE (RECEIVED stage) ---');
    console.log(JSON.stringify(previewMatchRes.body, null, 2));

    const previewEligibleTags = previewMatchRes.body.candidates.eligible.map(c => c.asset.assetTag);
    expect(previewEligibleTags).toContain('DEMO-WS-COMPAT-001');

    // 5. Verify the approval gate:
    // Attempt assignment before approval and confirm expected conflict
    const unapprovedAssignRes = await request.post(`/api/requests/${createdReq._id}/assignments`)
      .set(auth(t.admin))
      .send({ assetId: createdAsset._id });

    expect(unapprovedAssignRes.status).toBe(409);
    expect(unapprovedAssignRes.body.message).toMatch(/cannot be assigned while the request is RECEIVED/);
    console.log('--- UNAPPROVED ASSIGNMENT ATTEMPT RESULT (HTTP 409) ---');
    console.log(JSON.stringify(unapprovedAssignRes.body, null, 2));

    // Transition request through valid review/approval lifecycle
    const reviewRes = await transition(t.admin, createdReq._id, 'UNDER_REVIEW');
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.request.status).toBe('UNDER_REVIEW');

    // Also verify assignment blocked while UNDER_REVIEW
    const underReviewAssignRes = await request.post(`/api/requests/${createdReq._id}/assignments`)
      .set(auth(t.admin))
      .send({ assetId: createdAsset._id });
    expect(underReviewAssignRes.status).toBe(409);
    expect(underReviewAssignRes.body.message).toMatch(/cannot be assigned while the request is UNDER_REVIEW/);

    const approveRes = await transition(t.admin, createdReq._id, 'APPROVED');
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.request.status).toBe('APPROVED');

    // Verify matching after approval (now allocatable: true)
    const approvedMatchRes = await request.get(`/api/requests/${createdReq._id}/matches`).set(auth(t.admin));
    expect(approvedMatchRes.status).toBe(200);

    console.log('--- FULL MATCH RESPONSE (APPROVED stage) ---');
    console.log(JSON.stringify(approvedMatchRes.body, null, 2));

    const { candidates, request: reqInfo } = approvedMatchRes.body;
    expect(reqInfo.allocatable).toBe(true);
    expect(reqInfo.remaining).toBe(1);

    const targetCandidate = candidates.eligible.find(c => c.asset.assetTag === 'DEMO-WS-COMPAT-001');
    expect(targetCandidate).toBeDefined();
    expect(targetCandidate.eligibility).toBe('compatible');
    expect(targetCandidate.availability.available).toBe(true);
    expect(targetCandidate.availability.status).toBe('available');

    // Confirm it is not in unavailable, incompatible, or needsVerification
    const unavailTags = candidates.unavailable.map(c => c.asset.assetTag);
    const incompTags = candidates.incompatible.map(c => c.asset.assetTag);
    const unverifiedTags = candidates.needsVerification.map(c => c.asset.assetTag);

    expect(unavailTags).not.toContain('DEMO-WS-COMPAT-001');
    expect(incompTags).not.toContain('DEMO-WS-COMPAT-001');
    expect(unverifiedTags).not.toContain('DEMO-WS-COMPAT-001');

    // State BEFORE assignment
    const stateBefore = {
      asset: await Asset.findById(createdAsset._id).lean(),
      request: await ResourceRequest.findById(createdReq._id).lean(),
      assignments: await Assignment.find({ asset: createdAsset._id }).lean()
    };
    console.log('--- DB STATE BEFORE ASSIGNMENT ---');
    console.log(JSON.stringify({
      asset: {
        assetTag: stateBefore.asset.assetTag,
        status: stateBefore.asset.status,
        currentAssignment: stateBefore.asset.currentAssignment
      },
      request: {
        id: stateBefore.request._id,
        status: stateBefore.request.status,
        allocation: stateBefore.request.allocation
      },
      assignmentCount: stateBefore.assignments.length
    }, null, 2));

    expect(stateBefore.asset.status).toBe('available');
    expect(stateBefore.asset.currentAssignment).toBeNull();
    expect(stateBefore.request.status).toBe('APPROVED');
    expect(stateBefore.request.allocation).toEqual({ active: 0, proposed: 0 });
    expect(stateBefore.assignments).toHaveLength(0);

    // 6. Assign the target asset using existing assignment API
    const assignRes = await request.post(`/api/requests/${createdReq._id}/assignments`)
      .set(auth(t.admin))
      .send({ assetId: createdAsset._id });

    expect(assignRes.status).toBe(201);
    console.log('--- ASSIGNMENT RESPONSE (HTTP 201) ---');
    console.log(JSON.stringify(assignRes.body, null, 2));

    const stateAfter = {
      asset: await Asset.findById(createdAsset._id).lean(),
      request: await ResourceRequest.findById(createdReq._id).lean(),
      assignments: await Assignment.find({ asset: createdAsset._id }).lean(),
      currentAssignments: await Assignment.find({ asset: createdAsset._id, isCurrent: true }).lean()
    };
    console.log('--- DB STATE AFTER ASSIGNMENT ---');
    console.log(JSON.stringify({
      asset: {
        assetTag: stateAfter.asset.assetTag,
        status: stateAfter.asset.status,
        currentAssignment: stateAfter.asset.currentAssignment
      },
      request: {
        id: stateAfter.request._id,
        status: stateAfter.request.status,
        allocation: stateAfter.request.allocation
      },
      totalAssignments: stateAfter.assignments.length,
      currentAssignments: stateAfter.currentAssignments.length,
      currentAssignmentDoc: stateAfter.currentAssignments[0]
    }, null, 2));

    expect(assignRes.body.request.status).toBe('ALLOCATED');
    expect(assignRes.body.request.allocation.active).toBe(1);
    expect(assignRes.body.assignment.status).toBe('active');

    expect(stateAfter.request.status).toBe('ALLOCATED');
    expect(stateAfter.request.allocation.active).toBe(1);
    expect(stateAfter.asset.status).toBe('allocated');
    expect(String(stateAfter.asset.currentAssignment)).toBe(String(assignRes.body.assignment._id));
    expect(stateAfter.currentAssignments).toHaveLength(1);
    expect(stateAfter.assignments).toHaveLength(1);
    expect(String(stateAfter.currentAssignments[0]._id)).toBe(String(assignRes.body.assignment._id));

    // 7. Attempt to assign the same asset again. Confirm safe failure and no second active assignment.
    const secondAssignRes = await request.post(`/api/requests/${createdReq._id}/assignments`)
      .set(auth(t.admin))
      .send({ assetId: createdAsset._id });

    expect(secondAssignRes.status).toBe(409);
    console.log('--- SECOND ASSIGNMENT ATTEMPT RESULT (HTTP 409) ---');
    console.log(JSON.stringify(secondAssignRes.body, null, 2));

    // Verify DB state remains unchanged after failed second attempt
    const stateAfterSecondAttempt = {
      asset: await Asset.findById(createdAsset._id).lean(),
      request: await ResourceRequest.findById(createdReq._id).lean(),
      assignments: await Assignment.find({ asset: createdAsset._id }).lean(),
      currentAssignments: await Assignment.find({ asset: createdAsset._id, isCurrent: true }).lean()
    };

    expect(stateAfterSecondAttempt.asset.status).toBe('allocated');
    expect(String(stateAfterSecondAttempt.asset.currentAssignment)).toBe(String(assignRes.body.assignment._id));
    expect(stateAfterSecondAttempt.currentAssignments).toHaveLength(1);
    expect(stateAfterSecondAttempt.assignments).toHaveLength(1);
    expect(stateAfterSecondAttempt.request.status).toBe('ALLOCATED');
    expect(stateAfterSecondAttempt.request.allocation.active).toBe(1);
  });
});

