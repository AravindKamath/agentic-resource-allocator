import http from 'node:http';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from './setup.js';
import { Asset } from '../models/Asset.js';
import { Assignment } from '../models/Assignment.js';
import { ResourceRequest } from '../models/ResourceRequest.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { EmailOutbox } from '../models/EmailOutbox.js';
import { config } from '../config.js';
import { auth, tokens, createAsset, transition } from './helpers/resources.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const pythonBin = path.join(projectRoot, 'agent', '.venv', 'bin', 'python');

let extractionResponse = null;

// Mock gmailClient as in existing email tests
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
const { getMatches } = await import('../services/matchingService.js');

let t;
let agentServer;

beforeAll(async () => {
  t = await tokens();

  // Real HTTP server that executes the Python agent worker using agent/.venv/bin/python
  agentServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/resource-extract') {
      let bodyStr = '';
      req.on('data', chunk => { bodyStr += chunk; });
      req.on('end', () => {
        try {
          const pyScript = `
import sys, json
sys.path.insert(0, "agent")
from app.llm_provider import LLMProvider
req_data = json.loads(sys.stdin.read())
result = LLMProvider().extract_resource_request(req_data)
print(json.dumps(result))
`;
          const output = execFileSync(pythonBin, ['-c', pyScript], {
            input: bodyStr,
            encoding: 'utf8',
            cwd: projectRoot
          });
          extractionResponse = JSON.parse(output.trim());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(output);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(resolve => {
    agentServer.listen(0, '127.0.0.1', () => {
      const port = agentServer.address().port;
      config.agent.baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (agentServer) {
    await new Promise(resolve => agentServer.close(resolve));
  }
});

describe('Inbound Email to Resource Matching & Allocation Regression', () => {
  test('end-to-end flow with DEMO-WS-COMPAT-001 fixture and target email', async () => {
    config.gmail.enabled = true;
    config.gmail.adminEmail = 'a@a.com';
    config.gmail.userEmail = 'desk@example.com';
    config.resourceAutomation.enabled = true;

    // Reset collections for clean isolated test state
    await Promise.all([
      ResourceRequest.deleteMany({}),
      EmailMessage.deleteMany({}),
      EmailOutbox.deleteMany({}),
      Assignment.deleteMany({}),
      Asset.deleteMany({ assetTag: 'DEMO-WS-COMPAT-001' })
    ]);

    // Seed the DEMO-WS-COMPAT-001 asset
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
    expect(createdAsset.category).toBe('workstation');
    expect(createdAsset.status).toBe('available');
    expect(createdAsset.currentAssignment).toBeNull();

    // Exact labeled email input
    const emailBody = [
      'I need a high-performance workstation for thesis model training.',
      'CPU: at least 16 cores',
      'RAM: at least 64 GB',
      'Storage: at least 2000 GB NVMe',
      'GPU memory: at least 24 GB VRAM',
      'GPU: at least one dedicated GPU',
      'Operating system: Ubuntu 22.04',
      'Quantity: 1'
    ].join('\n');

    gmail.listUnreadMessages.mockResolvedValue([{ id: 'gmail-msg-001' }]);
    gmail.getMessage.mockResolvedValue({});
    gmail.parseMessage.mockReturnValue({
      id: 'gmail-msg-001',
      threadId: 'thread-ws-001',
      sender: 'u@u.com',
      subject: 'Need a workstation for research',
      messageId: '<ws-001@example.com>',
      body: emailBody,
      receivedAt: new Date()
    });
    gmail.markRead.mockResolvedValue({});
    gmail.sendMessage.mockResolvedValue({ id: 'sent-ws-001', threadId: 'thread-ws-001' });

    // 1. Inbound request is created once via email polling
    const pollResult = await pollGmailOnce();
    expect(pollResult.processed).toBe(1);
    expect(await ResourceRequest.countDocuments()).toBe(1);
    expect(await EmailMessage.countDocuments({ direction: 'inbound' })).toBe(1);

    // 2. Extraction returns category 'workstation'
    expect(extractionResponse).toBeDefined();
    expect(extractionResponse.extractionStatus).toBe('EXTRACTED');
    expect(extractionResponse.category).toBe('workstation');

    // 3. All seven expected specification fields are preserved
    const extractedSpecs = extractionResponse.specifications;
    expect(extractedSpecs.cpuCores).toBe(16);
    expect(extractedSpecs.memoryGb).toBe(64);
    expect(extractedSpecs.storageGb).toBe(2000);
    expect(extractedSpecs.storageType).toBe('nvme');
    expect(extractedSpecs.gpuCount).toBe(1);
    expect(extractedSpecs.gpuMemoryGb).toBe(24);
    expect(extractedSpecs.operatingSystem).toBe('Ubuntu 22.04');
    expect(extractionResponse.quantity).toBe(1);

    // 4. The persisted request category remains 'workstation' with all 7 specs
    const persistedReq = await ResourceRequest.findOne({ 'inboundEmail.messageId': 'gmail-msg-001' }).lean();
    expect(persistedReq).toBeDefined();
    expect(persistedReq.category).toBe('workstation');
    expect(persistedReq.specifications).toMatchObject({
      cpuCores: 16,
      memoryGb: 64,
      storageGb: 2000,
      storageType: 'nvme',
      gpuCount: 1,
      gpuMemoryGb: 24,
      operatingSystem: 'Ubuntu 22.04'
    });

    // 5. Matching includes the target asset in candidates.eligible
    // Check matching advisory for this request
    const matchData = await getMatches(persistedReq._id);
    expect(matchData.request.category).toBe('workstation');
    // Candidates evaluated against workstation category
    const allCandidates = [
      ...matchData.candidates.eligible,
      ...matchData.candidates.incompatible,
      ...matchData.candidates.unavailable,
      ...matchData.candidates.needsVerification
    ];
    expect(allCandidates.map(c => c.asset.assetTag)).toContain('DEMO-WS-COMPAT-001');

    // 6. The request does not escalate because of a category mismatch
    expect(persistedReq.automation.outcomeCode).not.toBe('NO_COMPATIBLE_ASSET');
    expect(persistedReq.automation.status).toBe('allocated');
    expect(persistedReq.automation.outcomeCode).toBe('NONE');

    // 7. The normal approval policy is respected:
    // Request transitioned through valid lifecycle: RECEIVED -> UNDER_REVIEW -> APPROVED -> ALLOCATED
    const statusHistory = persistedReq.history.filter(h => h.type === 'status_change' || h.type === 'assignment');
    const statusProgression = statusHistory.map(h => `${h.from}->${h.to}`);
    expect(statusProgression).toContain('RECEIVED->UNDER_REVIEW');
    expect(statusProgression).toContain('UNDER_REVIEW->APPROVED');
    expect(statusProgression).toContain('APPROVED->ALLOCATED');

    // 8. Once legitimately approved, assignment succeeds exactly once
    expect(persistedReq.status).toBe('ALLOCATED');
    expect(persistedReq.allocation.active).toBe(1);
    expect(persistedReq.allocation.proposed).toBe(0);

    const updatedAsset = await Asset.findById(createdAsset._id).lean();
    expect(updatedAsset.status).toBe('allocated');
    expect(updatedAsset.currentAssignment).not.toBeNull();

    const activeAssignments = await Assignment.find({ asset: createdAsset._id, isCurrent: true }).lean();
    expect(activeAssignments).toHaveLength(1);
    expect(String(updatedAsset.currentAssignment)).toBe(String(activeAssignments[0]._id));
    expect(String(activeAssignments[0].request)).toBe(String(persistedReq._id));

    // 9. A repeat assignment attempt fails safely, with exactly one active assignment remaining
    const repeatAssignRes = await request.post(`/api/requests/${persistedReq._id}/assignments`)
      .set(auth(t.admin))
      .send({ assetId: createdAsset._id });

    expect(repeatAssignRes.status).toBe(409);
    expect(repeatAssignRes.body.message).toMatch(/cannot be assigned while the request is ALLOCATED/);

    // Verify DB state remains unchanged after failed duplicate assignment
    const afterAsset = await Asset.findById(createdAsset._id).lean();
    expect(afterAsset.status).toBe('allocated');
    expect(String(afterAsset.currentAssignment)).toBe(String(activeAssignments[0]._id));

    const totalAssignments = await Assignment.find({ asset: createdAsset._id }).lean();
    expect(totalAssignments).toHaveLength(1);

    const finalReq = await ResourceRequest.findById(persistedReq._id).lean();
    expect(finalReq.status).toBe('ALLOCATED');
    expect(finalReq.allocation.active).toBe(1);
  });
});

