import { request } from './setup.js';
import { auth, tokens, assetBody, createAsset } from './helpers/resources.js';

let t;
beforeAll(async () => { t = await tokens(); });

test('ordinary users and agents cannot read, create or edit inventory', async () => {
  const asset = await createAsset(t.admin);
  for (const token of [t.user, t.agent]) {
    expect((await request.get('/api/assets').set(auth(token))).status).toBe(403);
    expect((await request.post('/api/assets').set(auth(token)).send(assetBody())).status).toBe(403);
    expect((await request.patch(`/api/assets/${asset._id}`).set(auth(token)).send({ name: 'hacked' })).status).toBe(403);
  }
  expect((await request.get('/api/assets')).status).toBe(401);
});

test('administrator can create, list, view and edit assets', async () => {
  const created = await request.post('/api/assets').set(auth(t.admin))
    .send(assetBody({ assetTag: 'ws-cad-100', name: 'CAD workstation', category: 'workstation', specs: { memoryGb: 64, gpuModel: 'RTX A4000' } }));
  expect(created.status).toBe(201);
  const asset = created.body.asset;
  expect(asset.assetTag).toBe('WS-CAD-100'); // normalised
  expect(asset.status).toBe('available');
  expect(asset.currentAssignment).toBeNull();
  expect(asset.createdAt).toBeDefined();

  const list = await request.get('/api/assets?category=workstation&q=cad').set(auth(t.admin));
  expect(list.status).toBe(200);
  expect(list.body.items.some(a => a.assetTag === 'WS-CAD-100')).toBe(true);

  const edited = await request.patch(`/api/assets/${asset._id}`).set(auth(t.admin))
    .send({ location: 'Design Lab', specs: { memoryGb: 128 }, status: 'maintenance', notes: 'RAM upgrade' });
  expect(edited.status).toBe(200);
  expect(edited.body.asset).toMatchObject({ location: 'Design Lab', status: 'maintenance', notes: 'RAM upgrade' });
  expect(edited.body.asset.specs).toEqual({ memoryGb: 128 });
  expect(edited.body.asset.assignmentHistory).toEqual([]);

  const detail = await request.get(`/api/assets/${asset._id}`).set(auth(t.admin));
  expect(detail.body.asset.status).toBe('maintenance');
});

test('asset validation: unique tag, known specs, no direct allocated/reserved status, tag immutable', async () => {
  const a = await createAsset(t.admin, { assetTag: 'DUP-001' });
  expect((await request.post('/api/assets').set(auth(t.admin)).send(assetBody({ assetTag: 'dup-001' }))).status).toBe(409);
  expect((await request.post('/api/assets').set(auth(t.admin)).send(assetBody({ specs: { warpDrive: true } }))).status).toBe(400);
  expect((await request.post('/api/assets').set(auth(t.admin)).send(assetBody({ assetTag: 'bad tag!' }))).status).toBe(400);
  expect((await request.patch(`/api/assets/${a._id}`).set(auth(t.admin)).send({ status: 'allocated' })).status).toBe(400);
  expect((await request.patch(`/api/assets/${a._id}`).set(auth(t.admin)).send({ assetTag: 'NEW-TAG' })).status).toBe(400);
});
