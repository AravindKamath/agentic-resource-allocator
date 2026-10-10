import { request, loginAs } from '../setup.js';

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

export function requestBody(overrides = {}) {
  return {
    title: 'GPU machine for thesis',
    category: 'gpu_system',
    purpose: 'Train image segmentation models for MSc thesis',
    description: 'Need a GPU box for about three months; PyTorch on Linux.',
    specifications: { gpuCount: 1, gpuMemoryGb: 24, memoryGb: 64, operatingSystem: 'Ubuntu 22.04' },
    quantity: 1,
    urgency: 'normal',
    ...overrides
  };
}

let tagSeq = 0;
export function assetBody(overrides = {}) {
  tagSeq += 1;
  return {
    assetTag: `TEST-${Date.now().toString(36).toUpperCase()}-${tagSeq}`,
    name: `Test asset ${tagSeq}`,
    category: 'gpu_system',
    manufacturer: 'Acme',
    model: 'X1',
    specs: { gpuCount: 1, gpuMemoryGb: 24 },
    ...overrides
  };
}

export async function tokens() {
  return {
    admin: await loginAs('a@a.com'),
    user: await loginAs('u@u.com'),
    other: await loginAs('o@o.com'),
    agent: await loginAs('g@g.com')
  };
}

export async function createRequest(token, overrides) {
  const r = await request.post('/api/requests').set(auth(token)).send(requestBody(overrides));
  if (r.status !== 201) throw new Error(`create request failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.request;
}

export async function transition(token, id, to, extra = {}) {
  return request.post(`/api/requests/${id}/transitions`).set(auth(token)).send({ to, ...extra });
}

/** Creates a request as `userToken` and moves it to APPROVED as `adminToken`. */
export async function createApprovedRequest(userToken, adminToken, overrides) {
  const req = await createRequest(userToken, overrides);
  let r = await transition(adminToken, req._id, 'UNDER_REVIEW');
  if (r.status !== 200) throw new Error(`review failed ${r.status}`);
  r = await transition(adminToken, req._id, 'APPROVED');
  if (r.status !== 200) throw new Error(`approve failed ${r.status}`);
  return r.body.request;
}

export async function createAsset(adminToken, overrides) {
  const r = await request.post('/api/assets').set(auth(adminToken)).send(assetBody(overrides));
  if (r.status !== 201) throw new Error(`create asset failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.asset;
}
