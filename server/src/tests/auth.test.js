import { request } from './setup.js';

test('register & login', async () => {
  const r1 = await request.post('/api/auth/register').send({ 
    name: 'Xavier', // schema requires >= 2 chars; the original 'X' was rejected with 400
    email: 'x@x.com', 
    password: 'pass123' 
  });
  expect(r1.statusCode).toBe(200);
  
  const r2 = await request.post('/api/auth/login').send({ 
    email: 'x@x.com', 
    password: 'pass123' 
  });
  expect(r2.body.token).toBeDefined();
});

test('public registration cannot grant a privileged role', async () => {
  const r = await request.post('/api/auth/register').send({
    name: 'Mallory',
    email: 'mallory@x.com',
    password: 'pass123',
    role: 'admin'
  });
  expect(r.statusCode).toBe(200);
  expect(r.body.user.role).toBe('user');

  const token = r.body.token;
  const assets = await request.get('/api/assets').set('Authorization', `Bearer ${token}`);
  expect(assets.statusCode).toBe(403);
});
