import { describe, expect, it } from 'vitest';
import { displayRequestStatus, DISPLAY_STATUS_GROUPS } from '../components/resources/useCatalog';

describe('request display status mapping', () => {
  it('groups detailed workflow states without changing backend values', () => {
    expect(displayRequestStatus('RECEIVED')).toBe('new');
    expect(displayRequestStatus('CLARIFICATION_REQUIRED')).toBe('in_progress');
    expect(displayRequestStatus('PARTIALLY_ALLOCATED')).toBe('in_progress');
    expect(displayRequestStatus('ALLOCATED')).toBe('allocated');
    expect(displayRequestStatus('REJECTED')).toBe('closed');
    expect(DISPLAY_STATUS_GROUPS.closed).toEqual(['REJECTED', 'CLOSED']);
  });
});
