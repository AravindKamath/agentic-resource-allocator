import { assignmentConfirmedTemplate, requestReceivedTemplate, requestRejectedTemplate, manualReviewTemplate } from '../services/emailTemplates.js';

const request = {
  _id: '507f1f77bcf86cd799439011',
  category: 'other',
  purpose: '<script>alert(1)</script>',
  specifications: { memoryGb: 32 },
  quantity: 1,
  status: 'REJECTED',
  rejection: { reason: 'Not available <now>' }
};

test.each([
  ['received', requestReceivedTemplate(request), 'IT Resource Request Received'],
  ['assignment', assignmentConfirmedTemplate({ ...request, status: 'ALLOCATED' }, { category: 'workstation', name: 'Dev box', specs: { memoryGb: 64 } }), 'IT Resource Request – Assignment Confirmed'],
  ['rejection', requestRejectedTemplate(request), 'IT Resource Request – Update'],
  ['manual review', manualReviewTemplate({ ...request, status: 'UNDER_REVIEW' }), 'IT Resource Request – Manual Review Needed']
])('%s template has safe HTML and readable text alternatives', (_name, template, subject) => {
  expect(template.subject).toBe(subject);
  expect(template.html).toContain('<table');
  expect(template.text).toContain('Reference: IT-99439011');
  expect(template.html).not.toContain('<script>');
  expect(template.text).not.toContain('HTTP: 502');
});
