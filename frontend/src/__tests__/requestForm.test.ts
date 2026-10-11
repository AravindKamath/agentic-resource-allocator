import { describe, expect, it } from 'vitest';
import { emptyRequestForm, toRequestPayload, validateRequestForm } from '../pages/requests/requestForm';

describe('request form helpers', () => {
  it('flags missing required fields on an empty form', () => {
    const errors = validateRequestForm(emptyRequestForm());
    expect(Object.keys(errors).sort()).toEqual(['category', 'description', 'purpose', 'title']);
  });

  it('rejects quantities outside 1..50', () => {
    const base = { ...emptyRequestForm(), title: 'Laptop', category: 'standard_computer', purpose: 'Teaching', description: 'A laptop for lectures' };
    expect(validateRequestForm({ ...base, quantity: 0 }).quantity).toBeDefined();
    expect(validateRequestForm({ ...base, quantity: 51 }).quantity).toBeDefined();
    expect(validateRequestForm({ ...base, quantity: 2 })).toEqual({});
  });

  it('builds a trimmed payload and converts an empty date to null', () => {
    const payload = toRequestPayload({
      ...emptyRequestForm(' Physics '),
      title: '  GPU box ', category: 'gpu_system', purpose: ' ML ', description: ' Train models ',
      specifications: { gpuCount: 2 },
    });
    expect(payload).toEqual({
      title: 'GPU box', category: 'gpu_system', purpose: 'ML', description: 'Train models',
      specifications: { gpuCount: 2 }, quantity: 1, urgency: 'normal', neededBy: null, department: 'Physics',
    });
  });
});
