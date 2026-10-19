import { jest } from '@jest/globals';
import { ResourceRequest } from '../models/ResourceRequest.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { EmailOutbox } from '../models/EmailOutbox.js';
import { config } from '../config.js';

const gmail = {
  listUnreadMessages: jest.fn(),
  getMessage: jest.fn(),
  parseMessage: jest.fn(),
  markRead: jest.fn(),
  sendMessage: jest.fn()
};

jest.unstable_mockModule('../services/gmailClient.js', () => gmail);
const { pollGmailOnce } = await import('../services/emailService.js');

describe('Gmail resource request ingestion', () => {
  beforeEach(async () => {
    await Promise.all([ResourceRequest.deleteMany({}), EmailMessage.deleteMany({}), EmailOutbox.deleteMany({})]);
    config.gmail.enabled = true;
    config.gmail.adminEmail = 'a@a.com';
    config.gmail.userEmail = 'desk@example.com';
    gmail.listUnreadMessages.mockResolvedValue([{ id: 'gmail-1' }]);
    gmail.getMessage.mockResolvedValue({});
    gmail.parseMessage.mockReturnValue({
      id: 'gmail-1',
      threadId: 'thread-1',
      sender: 'u@u.com',
      subject: 'Need a workstation',
      messageId: '<gmail-1@example.com>',
      body: 'I need a workstation for development.',
      receivedAt: new Date()
    });
    gmail.markRead.mockResolvedValue({});
    gmail.sendMessage.mockResolvedValue({ id: 'sent-1', threadId: 'thread-1' });
  });

  test('accepts a registered sender once and deduplicates a repeated poll', async () => {
    await pollGmailOnce();
    await pollGmailOnce();

    expect(await ResourceRequest.countDocuments()).toBe(1);
    expect(await EmailMessage.countDocuments({ direction: 'inbound' })).toBe(1);
    expect(gmail.markRead).not.toHaveBeenCalled();
  });

  test('ignores an unregistered sender without creating a request', async () => {
    gmail.parseMessage.mockReturnValue({
      id: 'gmail-2',
      threadId: 'thread-2',
      sender: 'unknown@example.com',
      subject: 'Request',
      body: 'Please allocate a server.',
      receivedAt: new Date()
    });

    await pollGmailOnce();

    expect(await ResourceRequest.countDocuments()).toBe(0);
    expect(await EmailMessage.countDocuments({ status: 'ignored' })).toBe(1);
    expect(gmail.markRead).not.toHaveBeenCalled();
  });

  test('deduplicates concurrent delivery of the same Gmail message', async () => {
    await Promise.all([pollGmailOnce(), pollGmailOnce()]);

    expect(await ResourceRequest.countDocuments()).toBe(1);
    expect(await EmailMessage.countDocuments({ gmailMessageId: 'gmail-1' })).toBe(1);
  });

  test('records a failed message when request persistence fails', async () => {
    const originalCreate = ResourceRequest.create;
    ResourceRequest.create = jest.fn().mockRejectedValue(Object.assign(new Error('database unavailable'), { code: 'DB_UNAVAILABLE' }));
    try {
      await pollGmailOnce();

      expect(await ResourceRequest.countDocuments()).toBe(0);
      expect(await EmailMessage.countDocuments({ status: 'failed', error: 'database unavailable' })).toBe(1);
    } finally {
      ResourceRequest.create = originalCreate;
    }
  });

  test('reports Gmail permission failures without changing message state', async () => {
    gmail.listUnreadMessages.mockRejectedValue(Object.assign(new Error('Gmail list failed'), {
      code: 'PERMISSION_DENIED',
      status: 403
    }));

    await expect(pollGmailOnce()).rejects.toMatchObject({ code: 'PERMISSION_DENIED', status: 403 });
    expect(await EmailMessage.countDocuments()).toBe(0);
    expect(await ResourceRequest.countDocuments()).toBe(0);
  });

  test('skips malformed messages without stopping the poll', async () => {
    gmail.listUnreadMessages.mockResolvedValue([{ id: 'bad-message' }, { id: 'gmail-1' }]);
    gmail.getMessage
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    gmail.parseMessage
      .mockReturnValueOnce({ id: 'bad-message', threadId: '', sender: '' })
      .mockReturnValueOnce({
        id: 'gmail-1',
        threadId: 'thread-1',
        sender: 'u@u.com',
        subject: 'Need a workstation',
        messageId: '<gmail-1@example.com>',
        body: 'I need a workstation for development.',
        receivedAt: new Date()
      });

    await pollGmailOnce();

    expect(await ResourceRequest.countDocuments()).toBe(1);
  });
});
