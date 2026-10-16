import { parseMessage } from '../services/gmailClient.js';

describe('Gmail message parsing', () => {
  test('uses the trusted sender header and readable plain text part', () => {
    const parsed = parseMessage({
      id: 'message-1',
      threadId: 'thread-1',
      internalDate: '1720000000000',
      payload: {
        headers: [
          { name: 'From', value: 'Requester <user@example.com>' },
          { name: 'Subject', value: 'Need a workstation' }
        ],
        parts: [{
          mimeType: 'multipart/alternative',
          parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('Need 64 GB RAM').toString('base64url') } }]
        }]
      }
    });

    expect(parsed.sender).toBe('user@example.com');
    expect(parsed.subject).toBe('Need a workstation');
    expect(parsed.body).toBe('Need 64 GB RAM');
    expect(parsed.threadId).toBe('thread-1');
  });
});
