import http from 'node:http';
import crypto from 'node:crypto';
import { request } from './setup.js';
import { Asset } from '../models/Asset.js';
import { Assignment } from '../models/Assignment.js';
import { ResourceRequest } from '../models/ResourceRequest.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { EmailOutbox } from '../models/EmailOutbox.js';
import { config } from '../config.js';
import { auth, tokens, createAsset } from './helpers/resources.js';

let checkpointA = null;
let checkpointB = null;

// Mock gmailClient
const { jest } = await import('@jest/globals');
const gmail = {
  listUnreadMessages: jest.fn(),
  getMessage: jest.fn(),
  parseMessage: jest.fn(),
  markRead: jest.fn(),
  sendMessage: jest.fn()
};
jest.unstable_mockModule('../services/gmailClient.js', () => gmail);

const { pollGmailOnce } = await import('../services/emailService.js');

let t;
let agentServer;
let agentPort;

beforeAll(async () => {
  t = await tokens();

  // Create an in-process HTTP server simulating the Python agent worker
  agentServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/resource-extract') {
      let bodyStr = '';
      req.on('data', chunk => { bodyStr += chunk; });
      req.on('end', () => {
        const body = JSON.parse(bodyStr);
        checkpointA = body;
        const hash = crypto.createHash('sha256').update([body.title, body.purpose, body.description].join(' ').trim()).digest('hex');
        checkpointB = {
          extractionStatus: 'EXTRACTED',
          escalationOutcome: 'NONE',
          category: 'gpu_system',
          purpose: body.purpose,
          specifications: {
            cpuCores: 16,
            memoryGb: 64.0,
            storageGb: 2000.0,
            storageType: 'nvme',
            gpuMemoryGb: 24.0,
            gpuCount: 1,
            operatingSystem: 'Ubuntu 22.04'
          },
          quantity: 1,
          missingFields: [],
          ambiguities: [],
          confidence: 0.9,
          reason: 'Requirements extracted and ready for deterministic matching.',
          sourceHash: hash,
          model: 'deterministic-resource-extractor'
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(checkpointB));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(resolve => {
    agentServer.listen(0, '127.0.0.1', () => {
      agentPort = agentServer.address().port;
      config.agent.baseUrl = `http://127.0.0.1:${agentPort}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (agentServer) {
    await new Promise(resolve => agentServer.close(resolve));
  }
});

describe('Email-to-Resource-Matching End-to-End Investigation', () => {
  test('Checkpoint trace with target email and DEMO-WS-COMPAT-001', async () => {
    config.gmail.enabled = true;
    config.gmail.adminEmail = 'a@a.com';
    config.gmail.userEmail = 'desk@example.com';
    config.resourceAutomation.enabled = true;

    await Promise.all([
      ResourceRequest.deleteMany({}),
      EmailMessage.deleteMany({}),
      EmailOutbox.deleteMany({}),
      Asset.deleteMany({ assetTag: 'DEMO-WS-COMPAT-001' })
    ]);

    // 1. Seed DEMO-WS-COMPAT-001
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
    const createdAsset = await createAsset(t.admin, assetPayload);
    expect(createdAsset.assetTag).toBe('DEMO-WS-COMPAT-001');

    // 2. Setup inbound target email
    const emailBody = [
      'I need a high-performance machine for thesis model training.',
      'CPU: at least 16 cores',
      'RAM: at least 64 GB',
      'Storage: at least 2000 GB NVMe',
      'GPU memory: at least 24 GB VRAM',
      'GPU: at least one dedicated GPU',
      'Operating system: Ubuntu 22.04',
      'Quantity: 1'
    ].join('\n');

    gmail.listUnreadMessages.mockResolvedValue([{ id: 'gmail-target-1' }]);
    gmail.getMessage.mockResolvedValue({});
    gmail.parseMessage.mockReturnValue({
      id: 'gmail-target-1',
      threadId: 'thread-target-1',
      sender: 'u@u.com',
      subject: 'Need a workstation for research',
      messageId: '<target-1@example.com>',
      body: emailBody,
      receivedAt: new Date()
    });
    gmail.markRead.mockResolvedValue({});
    gmail.sendMessage.mockResolvedValue({ id: 'sent-target-1', threadId: 'thread-target-1' });

    // Run inbound email polling
    const pollResult = await pollGmailOnce();
    expect(pollResult.processed).toBe(1);

    // Checkpoint A: Normalized email input supplied to extraction
    console.log('--- CHECKPOINT A: Normalized Email Input to Agent ---');
    console.log(JSON.stringify(checkpointA, null, 2));

    // Checkpoint B: Raw structured extraction response from agent
    console.log('--- CHECKPOINT B: Agent Extraction Response ---');
    console.log(JSON.stringify(checkpointB, null, 2));

    // Checkpoint D: Persisted request
    const persistedReq = await ResourceRequest.findOne({ 'inboundEmail.messageId': 'gmail-target-1' }).lean();
    expect(persistedReq).toBeDefined();

    console.log('--- CHECKPOINT D: Persisted Resource Request ---');
    console.log(JSON.stringify({
      id: persistedReq._id,
      category: persistedReq.category,
      originalCategory: persistedReq.original.category,
      purpose: persistedReq.purpose,
      quantity: persistedReq.quantity,
      specifications: persistedReq.specifications,
      status: persistedReq.status,
      automation: persistedReq.automation
    }, null, 2));

    // Checkpoint E: Matching endpoint evaluation
    const matchRes = await request.get(`/api/requests/${persistedReq._id}/matches`).set(auth(t.admin));
    console.log('--- CHECKPOINT E: Matching Endpoint Response ---');
    console.log(JSON.stringify({
      status: matchRes.status,
      request: matchRes.body.request,
      requirements: matchRes.body.requirements,
      candidates: {
        eligible: matchRes.body.candidates.eligible.map(c => c.asset.assetTag),
        incompatible: matchRes.body.candidates.incompatible.map(c => c.asset.assetTag),
        unavailable: matchRes.body.candidates.unavailable.map(c => c.asset.assetTag),
        needsVerification: matchRes.body.candidates.needsVerification.map(c => c.asset.assetTag)
      },
      summary: matchRes.body.summary,
      explanation: matchRes.body.explanation
    }, null, 2));

    // Assert the exact failure state
    expect(persistedReq.category).toBe('gpu_system');
    expect(persistedReq.automation.status).toBe('escalated');
    expect(persistedReq.automation.outcomeCode).toBe('NO_COMPATIBLE_ASSET');
    expect(persistedReq.status).toBe('UNDER_REVIEW');
    expect(matchRes.body.candidates.eligible).toHaveLength(0);
    expect(matchRes.body.summary.otherCategoryAvailable).toBe(1);
    expect(matchRes.body.explanation).toMatch(/No non-retired assets are recorded in the requested category \(gpu_system\)/);
  });
});
