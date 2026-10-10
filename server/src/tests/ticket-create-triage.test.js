import { request } from './setup.js';
import { startAgentStub } from './helpers/agentStub.js';

let agentStub;
beforeAll(async () => { agentStub = await startAgentStub(); });
afterAll(() => agentStub.close());

test('ticket creation triggers triage and persists suggestion', async () => {
  const lr = await request.post('/api/auth/login').send({ 
    email: 'u@u.com', 
    password: 'pass123' 
  });
  const token = lr.body.token;

  // Stub agent worker
  agentStub.reply({
      predictedCategory: 'billing',
      draftReply: 'Use KB [1]',
      citations: ['abc'],
      confidence: 0.9,
      modelInfo: { 
        provider: 'stub', 
        model: 'stub', 
        promptVersion: 'v1', 
        stubMode: true 
      },
      stepLogs: [{ 
        action: 'AGENT_CLASSIFIED', 
        meta: { predictedCategory: 'billing' } 
      }]
    });

  const r = await request.post('/api/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Refund please', 
      description: 'refund invoice'
    });
    
  expect(r.statusCode).toBe(201);
  expect(r.body.ticket.status).toBe('resolved');
});
