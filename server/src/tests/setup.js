import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import supertest from 'supertest';
import { User } from '../models/User.js';
import { Article } from '../models/Article.js';
import { Config } from '../models/Config.js';

export let app, request, mongod;

beforeAll(async () => {
  // Replica set (not standalone) so multi-document transactions work, as on Atlas.
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongod.getUri());
  await Promise.all(mongoose.modelNames().map(n => mongoose.model(n).syncIndexes()));
  app = createApp();
  request = supertest(app);

  // seed minimal
  const admin = new User({ name: 'Admin', email: 'a@a.com', role: 'admin' }); 
  await admin.setPassword('pass123'); 
  await admin.save();
  
  const agent = new User({ name: 'Agent', email: 'g@g.com', role: 'agent' }); 
  await agent.setPassword('pass123'); 
  await agent.save();
  
  const user = new User({ name: 'User', email: 'u@u.com', role: 'user', department: 'Physics' }); 
  await user.setPassword('pass123'); 
  await user.save();

  const user2 = new User({ name: 'Other User', email: 'o@o.com', role: 'user' });
  await user2.setPassword('pass123');
  await user2.save();
  
  await Article.insertMany([
    { title: 'Billing FAQ', body: 'refund invoice card', tags: ['billing'], status: 'published' },
    { title: 'Tech 500s', body: 'error bug stack', tags: ['tech'], status: 'published' }
  ]);
  
  await new Config({ autoCloseEnabled: true, confidenceThreshold: 0.5, slaHours: 24 }).save();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

export async function loginAs(email, password = 'pass123') {
  const r = await request.post('/api/auth/login').send({ email, password });
  if (!r.body.token) throw new Error(`login failed for ${email}: ${r.status}`);
  return r.body.token;
}
