import { jest } from '@jest/globals';
import { request } from './setup.js';
import { auth, tokens, requestBody, createRequest, transition } from './helpers/resources.js';
import { EmailOutbox } from '../models/EmailOutbox.js';
import { config } from '../config.js';

let t;
beforeAll(async () => { t = await tokens(); });

describe('submitting requests', () => {
  test('requester submits a request; it is persisted as RECEIVED with history and an original snapshot', async () => {
    const r = await request.post('/api/requests').set(auth(t.user)).send(requestBody({ quantity: 2 }));
    expect(r.status).toBe(201);
    const req = r.body.request;
    expect(req.status).toBe('RECEIVED');
    expect(req.quantity).toBe(2);
    expect(req.department).toBe('Physics'); // defaulted from the user's profile
    expect(req.requester.email).toBe('u@u.com');
    expect(req.original.description).toBe(req.description);
    expect(req.history).toHaveLength(1);
    expect(req.history[0]).toMatchObject({ type: 'created', to: 'RECEIVED' });
    expect(req.allocation).toEqual({ active: 0, proposed: 0 });
  });

  test('blank specification values are dropped, unknown keys and bad values are rejected', async () => {
    const ok = await request.post('/api/requests').set(auth(t.user))
      .send(requestBody({ specifications: { memoryGb: 16, gpuModel: '' } }));
    expect(ok.status).toBe(201);
    expect(ok.body.request.specifications).toEqual({ memoryGb: 16 });

    const unknownKey = await request.post('/api/requests').set(auth(t.user))
      .send(requestBody({ specifications: { flux: 'capacitor' } }));
    expect(unknownKey.status).toBe(400);

    const badCategory = await request.post('/api/requests').set(auth(t.user)).send(requestBody({ category: 'spaceship' }));
    expect(badCategory.status).toBe(400);

    const badQty = await request.post('/api/requests').set(auth(t.user)).send(requestBody({ quantity: 0 }));
    expect(badQty.status).toBe(400);
  });

  test('client cannot set status, requester or allocation on create', async () => {
    const r = await request.post('/api/requests').set(auth(t.user))
      .send({ ...requestBody(), status: 'ALLOCATED', requester: '000000000000000000000000', allocation: { active: 5 } });
    expect(r.status).toBe(201);
    expect(r.body.request.status).toBe('RECEIVED');
    expect(r.body.request.requester.email).toBe('u@u.com');
    expect(r.body.request.allocation.active).toBe(0);
  });
});

describe('visibility', () => {
  test('requester cannot read another user\'s request; admin can', async () => {
    const mine = await createRequest(t.user);
    const theirs = await request.get(`/api/requests/${mine._id}`).set(auth(t.other));
    expect(theirs.status).toBe(404);

    const history = await request.get(`/api/requests/${mine._id}/history`).set(auth(t.other));
    expect(history.status).toBe(404);

    const asAdmin = await request.get(`/api/requests/${mine._id}`).set(auth(t.admin));
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.request.requester.department).toBe('Physics');
  });

  test('list is scoped to the requester; admins see all and can filter', async () => {
    await createRequest(t.other, { title: 'Other user laptop', category: 'standard_computer', specifications: {} });

    const otherList = await request.get('/api/requests').set(auth(t.other));
    expect(otherList.status).toBe(200);
    expect(otherList.body.items.every(r => r.requester.email === 'o@o.com')).toBe(true);

    const adminList = await request.get('/api/requests?limit=100').set(auth(t.admin));
    const emails = new Set(adminList.body.items.map(r => r.requester.email));
    expect(emails.has('u@u.com') && emails.has('o@o.com')).toBe(true);

    const filtered = await request.get('/api/requests?status=RECEIVED&category=standard_computer').set(auth(t.admin));
    expect(filtered.body.items.length).toBeGreaterThan(0);
    expect(filtered.body.items.every(r => r.category === 'standard_computer' && r.status === 'RECEIVED')).toBe(true);

    const badFilter = await request.get('/api/requests?status=NOPE').set(auth(t.admin));
    expect(badFilter.status).toBe(400);
    const badPage = await request.get('/api/requests?limit=1000').set(auth(t.admin));
    expect(badPage.status).toBe(400);
  });

  test('overview is admin-only', async () => {
    expect((await request.get('/api/requests/overview').set(auth(t.user))).status).toBe(403);
    const r = await request.get('/api/requests/overview').set(auth(t.admin));
    expect(r.status).toBe(200);
    expect(r.body.requestsByStatus.RECEIVED).toBeGreaterThan(0);
  });
});

describe('lifecycle', () => {
  test('invalid transitions are rejected', async () => {
    const req = await createRequest(t.user);

    // requester cannot approve their own request
    expect((await transition(t.user, req._id, 'UNDER_REVIEW')).status).toBe(403);
    // review is required before approval
    expect((await transition(t.admin, req._id, 'APPROVED')).status).toBe(409);
    // allocation statuses cannot be set manually
    expect((await transition(t.admin, req._id, 'ALLOCATED')).status).toBe(409);
    // unknown status value
    expect((await transition(t.admin, req._id, 'DONE')).status).toBe(400);

    const fresh = await request.get(`/api/requests/${req._id}`).set(auth(t.user));
    expect(fresh.body.request.status).toBe('RECEIVED');
    expect(fresh.body.request.history).toHaveLength(1);
  });

  test('approved request cannot be manually marked allocated', async () => {
    const req = await createRequest(t.user);
    await transition(t.admin, req._id, 'UNDER_REVIEW');
    await transition(t.admin, req._id, 'APPROVED');
    const r = await transition(t.admin, req._id, 'ALLOCATED');
    expect(r.status).toBe(409);
  });

  test('rejection requires a reason, preserves it, and is terminal', async () => {
    const req = await createRequest(t.user);
    expect((await transition(t.admin, req._id, 'REJECTED')).status).toBe(400);

    const r = await transition(t.admin, req._id, 'REJECTED', { reason: 'Budget not approved this term' });
    expect(r.status).toBe(200);
    expect(r.body.request.status).toBe('REJECTED');
    expect(r.body.request.rejection.reason).toBe('Budget not approved this term');

    const asRequester = await request.get(`/api/requests/${req._id}`).set(auth(t.user));
    expect(asRequester.body.request.rejection.reason).toBe('Budget not approved this term');
    expect(asRequester.body.request.allowedTransitions).toEqual([]);

    expect((await transition(t.admin, req._id, 'UNDER_REVIEW')).status).toBe(409);
    expect((await transition(t.admin, req._id, 'CLOSED', { reason: 'x' })).status).toBe(409);
  });

  test('manual review state persists when notification queueing fails', async () => {
    const req = await createRequest(t.user);
    const previousEnabled = config.gmail.enabled;
    config.gmail.enabled = true;
    const queueFailure = jest.spyOn(EmailOutbox, 'findOneAndUpdate').mockRejectedValue(new Error('outbox unavailable'));
    try {
      const response = await transition(t.admin, req._id, 'CLARIFICATION_REQUIRED', { message: 'Please confirm the required GPU memory.' });
      expect(response.status).toBe(200);
      const persisted = await request.get(`/api/requests/${req._id}`).set(auth(t.user));
      expect(persisted.body.request.status).toBe('CLARIFICATION_REQUIRED');
      expect(persisted.body.request.pendingClarification.message).toContain('GPU memory');
    } finally {
      queueFailure.mockRestore();
      config.gmail.enabled = previousEnabled;
    }
  });

  test('clarification keeps existing information; requester response returns it to review', async () => {
    const req = await createRequest(t.user);
    expect((await transition(t.admin, req._id, 'CLARIFICATION_REQUIRED')).status).toBe(400); // message required

    const c = await transition(t.admin, req._id, 'CLARIFICATION_REQUIRED', { message: 'How much GPU memory does your model need?' });
    expect(c.status).toBe(200);
    expect(c.body.request.pendingClarification.message).toMatch(/GPU memory/);
    expect(c.body.request.description).toBe(req.description);
    expect(c.body.request.specifications).toEqual(req.specifications);

    // another user cannot respond
    const intruder = await request.post(`/api/requests/${req._id}/clarification-response`).set(auth(t.other)).send({ message: 'hi' });
    expect(intruder.status).toBe(404);

    const resp = await request.post(`/api/requests/${req._id}/clarification-response`).set(auth(t.user))
      .send({ message: 'At least 40 GB', updates: { specifications: { ...req.specifications, gpuMemoryGb: 40 } } });
    expect(resp.status).toBe(200);
    const after = resp.body.request;
    expect(after.status).toBe('UNDER_REVIEW');
    expect(after.specifications.gpuMemoryGb).toBe(40);
    expect(after.original.specifications.gpuMemoryGb).toBe(24); // original preserved
    expect(after.pendingClarification).toBeUndefined();
    expect(after.history.map(h => h.type)).toEqual(['created', 'status_change', 'clarification_response']);
  });

  test('requester can edit only while RECEIVED/CLARIFICATION_REQUIRED, and only their own request', async () => {
    const req = await createRequest(t.user);
    const edit = await request.patch(`/api/requests/${req._id}`).set(auth(t.user)).send({ quantity: 3 });
    expect(edit.status).toBe(200);
    expect(edit.body.request.quantity).toBe(3);
    expect(edit.body.request.original.quantity).toBe(1);

    expect((await request.patch(`/api/requests/${req._id}`).set(auth(t.other)).send({ quantity: 2 })).status).toBe(404);
    expect((await request.patch(`/api/requests/${req._id}`).set(auth(t.user)).send({ status: 'APPROVED' })).status).toBe(400);

    await transition(t.admin, req._id, 'UNDER_REVIEW');
    expect((await request.patch(`/api/requests/${req._id}`).set(auth(t.user)).send({ quantity: 2 })).status).toBe(409);
  });

  test('requester can withdraw (close) with a reason before allocation', async () => {
    const req = await createRequest(t.user);
    expect((await transition(t.user, req._id, 'CLOSED')).status).toBe(400);
    const r = await transition(t.user, req._id, 'CLOSED', { reason: 'No longer needed' });
    expect(r.status).toBe(200);
    expect(r.body.request.closure.reason).toBe('No longer needed');
  });
});
