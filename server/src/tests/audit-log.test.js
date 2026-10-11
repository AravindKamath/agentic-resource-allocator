import { request } from './setup.js';
import { startAgentStub } from './helpers/agentStub.js';

let agentStub;
beforeAll(async () => { agentStub = await startAgentStub(); });
afterAll(() => agentStub.close());

test('audit timeline present', async () => {
  const lr = await request.post('/api/auth/login').send({ 
    email: 'u@u.com', 
    password: 'pass123' 
  });
  const token = lr.body.token;

  agentStub.reply({
      predictedCategory: 'tech',
      draftReply: 'Check KB',
      citations: [],
      confidence: 0.7,
      modelInfo: { 
        provider: 'stub', 
        model: 'stub', 
        promptVersion: 'v1', 
        stubMode: true 
      },
      stepLogs: [{ 
        action: 'AGENT_CLASSIFIED', 
        meta: { predictedCategory: 'tech' } 
      }]
    });

  const r = await request.post('/api/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'error bug', 
      description: 'stack trace'
    });
  const ticketId = r.body.ticket._id;

  const audit = await request.get(`/api/tickets/${ticketId}/audit`)
    .set('Authorization', `Bearer ${token}`);
    
  expect(audit.statusCode).toBe(200);
  // GET /api/tickets/:id/audit is served by the tickets router, which returns { timeline, ... }
  expect(audit.body.timeline.some(e => e.action === 'TICKET_CREATED')).toBe(true);
});
