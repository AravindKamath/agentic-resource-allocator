// Single source of truth for IT resource categories, specification fields,
// request lifecycle and asset/assignment states. The frontend reads this via
// GET /api/catalog, so nothing here should be duplicated elsewhere.

export const RESOURCE_CATEGORIES = [
  {
    key: 'standard_computer',
    label: 'Standard computer',
    description: 'Desktop or laptop for everyday work: documents, browsing, coding, teaching.',
    specFields: ['cpuCores', 'memoryGb', 'storageGb', 'storageType', 'operatingSystem', 'formFactor']
  },
  {
    key: 'workstation',
    label: 'High-performance workstation',
    description: 'Powerful machine for simulation, CAD, video editing or large datasets.',
    specFields: ['cpuCores', 'memoryGb', 'storageGb', 'storageType', 'gpuModel', 'gpuMemoryGb', 'operatingSystem']
  },
  {
    key: 'server',
    label: 'Server',
    description: 'Always-on machine that hosts services, databases or shared workloads.',
    specFields: ['cpuCores', 'memoryGb', 'storageGb', 'storageType', 'operatingSystem', 'networkSpeedGbps']
  },
  {
    key: 'gpu_system',
    label: 'GPU-enabled system',
    description: 'Machine with one or more GPUs for machine learning or GPU computing.',
    specFields: ['gpuModel', 'gpuCount', 'gpuMemoryGb', 'cpuCores', 'memoryGb', 'storageGb', 'operatingSystem']
  },
  {
    key: 'networking',
    label: 'Networking equipment',
    description: 'Switches, routers, access points, cables and similar.',
    specFields: ['networkPorts', 'networkSpeedGbps']
  },
  {
    key: 'storage',
    label: 'Storage equipment',
    description: 'External drives, NAS or other storage capacity.',
    specFields: ['storageGb', 'storageType']
  },
  {
    key: 'other',
    label: 'Other',
    description: 'Anything else. Describe what you need in the description.',
    specFields: []
  }
];

// Shared specification vocabulary for both request requirements and asset specs,
// so later matching can compare like with like. All fields are optional.
export const SPEC_FIELDS = {
  cpuCores: { label: 'CPU cores', type: 'number', min: 1, max: 1024, integer: true, hint: 'Leave blank if unsure' },
  memoryGb: { label: 'Memory (RAM)', type: 'number', unit: 'GB', min: 1, max: 65536, hint: 'e.g. 16 for typical work, 64+ for heavy data work' },
  storageGb: { label: 'Storage', type: 'number', unit: 'GB', min: 1, max: 10000000 },
  storageType: { label: 'Storage type', type: 'enum', options: ['hdd', 'ssd', 'nvme'] },
  gpuModel: { label: 'GPU model', type: 'string', maxLength: 100, hint: 'e.g. NVIDIA RTX 4090, or "any CUDA-capable"' },
  gpuCount: { label: 'Number of GPUs', type: 'number', min: 1, max: 64, integer: true },
  gpuMemoryGb: { label: 'GPU memory', type: 'number', unit: 'GB', min: 1, max: 4096 },
  operatingSystem: { label: 'Operating system', type: 'string', maxLength: 100, hint: 'e.g. Windows 11, Ubuntu 22.04' },
  formFactor: { label: 'Form factor', type: 'enum', options: ['desktop', 'laptop', 'any'] },
  networkPorts: { label: 'Network ports', type: 'number', min: 1, max: 1024, integer: true },
  networkSpeedGbps: { label: 'Network speed', type: 'number', unit: 'Gbps', min: 0.01, max: 1000 }
};

export const URGENCY_LEVELS = [
  { key: 'low', label: 'Low' },
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High' },
  { key: 'critical', label: 'Critical' }
];

export const REQUEST_STATUS = Object.freeze({
  RECEIVED: 'RECEIVED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  CLARIFICATION_REQUIRED: 'CLARIFICATION_REQUIRED',
  APPROVED: 'APPROVED',
  ALLOCATION_PENDING: 'ALLOCATION_PENDING',
  PARTIALLY_ALLOCATED: 'PARTIALLY_ALLOCATED',
  ALLOCATED: 'ALLOCATED',
  REJECTED: 'REJECTED',
  CLOSED: 'CLOSED'
});

const S = REQUEST_STATUS;

export const REQUEST_STATUS_LABELS = {
  [S.RECEIVED]: 'Received',
  [S.UNDER_REVIEW]: 'Under review',
  [S.CLARIFICATION_REQUIRED]: 'Clarification required',
  [S.APPROVED]: 'Approved – awaiting allocation',
  [S.ALLOCATION_PENDING]: 'Allocation pending approval',
  [S.PARTIALLY_ALLOCATED]: 'Partially allocated',
  [S.ALLOCATED]: 'Allocated',
  [S.REJECTED]: 'Rejected',
  [S.CLOSED]: 'Closed'
};

export const TERMINAL_STATUSES = [S.REJECTED, S.CLOSED];

// Statuses in which assets may be assigned or proposed.
export const ALLOCATABLE_STATUSES = [S.APPROVED, S.ALLOCATION_PENDING, S.PARTIALLY_ALLOCATED];

// Statuses whose value is derived from allocation counters (see deriveAllocationStatus).
export const ALLOCATION_STATUSES = [S.APPROVED, S.ALLOCATION_PENDING, S.PARTIALLY_ALLOCATED, S.ALLOCATED];

// Statuses in which the requester may edit their submission.
export const REQUESTER_EDITABLE_STATUSES = [S.RECEIVED, S.CLARIFICATION_REQUIRED];

// Manual transitions. Allocation-driven statuses (ALLOCATION_PENDING,
// PARTIALLY_ALLOCATED, ALLOCATED, and falling back to APPROVED) are never set
// manually; the allocation service derives them from recorded assignments.
// `roles` lists who may perform the transition: 'admin', or 'requester' (owner).
// `requires` names the body field that must be non-empty.
export const MANUAL_TRANSITIONS = [
  { from: S.RECEIVED, to: S.UNDER_REVIEW, roles: ['admin'], action: 'start_review' },
  { from: S.RECEIVED, to: S.CLARIFICATION_REQUIRED, roles: ['admin'], action: 'request_clarification', requires: 'message' },
  { from: S.RECEIVED, to: S.REJECTED, roles: ['admin'], action: 'reject', requires: 'reason' },
  { from: S.RECEIVED, to: S.CLOSED, roles: ['admin', 'requester'], action: 'close', requires: 'reason' },

  { from: S.UNDER_REVIEW, to: S.APPROVED, roles: ['admin'], action: 'approve' },
  { from: S.UNDER_REVIEW, to: S.CLARIFICATION_REQUIRED, roles: ['admin'], action: 'request_clarification', requires: 'message' },
  { from: S.UNDER_REVIEW, to: S.REJECTED, roles: ['admin'], action: 'reject', requires: 'reason' },
  { from: S.UNDER_REVIEW, to: S.CLOSED, roles: ['admin', 'requester'], action: 'close', requires: 'reason' },

  // Requester answers via POST /requests/:id/clarification-response.
  { from: S.CLARIFICATION_REQUIRED, to: S.UNDER_REVIEW, roles: ['admin'], action: 'resume_review' },
  { from: S.CLARIFICATION_REQUIRED, to: S.REJECTED, roles: ['admin'], action: 'reject', requires: 'reason' },
  { from: S.CLARIFICATION_REQUIRED, to: S.CLOSED, roles: ['admin', 'requester'], action: 'close', requires: 'reason' },

  // Only reachable while nothing is allocated or reserved (APPROVED implies that).
  { from: S.APPROVED, to: S.REJECTED, roles: ['admin'], action: 'reject', requires: 'reason' },
  { from: S.APPROVED, to: S.CLOSED, roles: ['admin', 'requester'], action: 'close', requires: 'reason' },

  // Closing keeps assignment records and leaves active assignments in place.
  { from: S.PARTIALLY_ALLOCATED, to: S.CLOSED, roles: ['admin'], action: 'close', requires: 'reason' },
  { from: S.ALLOCATED, to: S.CLOSED, roles: ['admin'], action: 'close' }
];

export function findManualTransition(from, to) {
  return MANUAL_TRANSITIONS.find(t => t.from === from && t.to === to) || null;
}

export function allowedTransitionsFor(status, { isAdmin, isOwner }) {
  return MANUAL_TRANSITIONS.filter(t =>
    t.from === status &&
    ((isAdmin && t.roles.includes('admin')) || (isOwner && t.roles.includes('requester')))
  ).map(({ to, action, requires }) => ({ to, action, requires: requires || null }));
}

/** Status implied by recorded allocations for a request in an allocation status. */
export function deriveAllocationStatus({ active, proposed, quantity }) {
  if (active >= quantity) return S.ALLOCATED;
  if (active > 0) return S.PARTIALLY_ALLOCATED;
  if (proposed > 0) return S.ALLOCATION_PENDING;
  return S.APPROVED;
}

export const ASSET_STATUS = Object.freeze({
  AVAILABLE: 'available',
  RESERVED: 'reserved',       // held by a proposed assignment
  ALLOCATED: 'allocated',     // held by an active assignment
  MAINTENANCE: 'maintenance',
  UNAVAILABLE: 'unavailable',
  RETIRED: 'retired'
});

// Statuses an administrator may set directly. RESERVED/ALLOCATED are only
// set by the allocation service.
export const ADMIN_SETTABLE_ASSET_STATUSES = [
  ASSET_STATUS.AVAILABLE,
  ASSET_STATUS.MAINTENANCE,
  ASSET_STATUS.UNAVAILABLE,
  ASSET_STATUS.RETIRED
];

export const ASSIGNMENT_STATUS = Object.freeze({
  PROPOSED: 'proposed',   // asset reserved, awaiting approval
  ACTIVE: 'active',       // asset allocated to the request
  REJECTED: 'rejected',   // proposal declined, asset released
  RELEASED: 'released'    // asset returned to inventory
});

export const CATEGORY_KEYS = RESOURCE_CATEGORIES.map(c => c.key);
export const URGENCY_KEYS = URGENCY_LEVELS.map(u => u.key);
export const REQUEST_STATUS_VALUES = Object.values(REQUEST_STATUS);
export const ASSET_STATUS_VALUES = Object.values(ASSET_STATUS);
export const ASSIGNMENT_STATUS_VALUES = Object.values(ASSIGNMENT_STATUS);

export function publicCatalog() {
  return {
    categories: RESOURCE_CATEGORIES,
    specFields: SPEC_FIELDS,
    urgencyLevels: URGENCY_LEVELS,
    requestStatuses: REQUEST_STATUS_VALUES.map(key => ({ key, label: REQUEST_STATUS_LABELS[key] })),
    terminalStatuses: TERMINAL_STATUSES,
    assetStatuses: ASSET_STATUS_VALUES,
    adminSettableAssetStatuses: ADMIN_SETTABLE_ASSET_STATUSES,
    assignmentStatuses: ASSIGNMENT_STATUS_VALUES
  };
}
