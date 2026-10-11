// Shapes returned by /api/catalog, /api/requests, /api/assets, /api/assignments.

export type SpecValue = string | number | boolean;
export type Specs = Record<string, SpecValue>;

export interface SpecFieldDef {
  label: string;
  type: 'number' | 'string' | 'enum' | 'boolean';
  unit?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  maxLength?: number;
  options?: string[];
  hint?: string;
}

export interface CategoryDef {
  key: string;
  label: string;
  description: string;
  specFields: string[];
}

export interface Catalog {
  categories: CategoryDef[];
  specFields: Record<string, SpecFieldDef>;
  urgencyLevels: { key: string; label: string }[];
  requestStatuses: { key: RequestStatus; label: string }[];
  terminalStatuses: RequestStatus[];
  assetStatuses: AssetStatus[];
  adminSettableAssetStatuses: AssetStatus[];
  assignmentStatuses: AssignmentStatus[];
}

export type RequestStatus =
  | 'RECEIVED' | 'UNDER_REVIEW' | 'CLARIFICATION_REQUIRED' | 'APPROVED'
  | 'ALLOCATION_PENDING' | 'PARTIALLY_ALLOCATED' | 'ALLOCATED' | 'REJECTED' | 'CLOSED';
export type AssetStatus = 'available' | 'reserved' | 'allocated' | 'maintenance' | 'unavailable' | 'retired';
export type AssignmentStatus = 'proposed' | 'active' | 'rejected' | 'released';

export interface PersonRef {
  _id: string;
  name?: string;
  email?: string;
  department?: string;
  role?: string;
}

export interface HistoryEntry {
  _id: string;
  type: 'created' | 'status_change' | 'updated' | 'clarification_response' | 'assignment';
  from: RequestStatus | null;
  to: RequestStatus | null;
  actor: PersonRef | null;
  actorRole: string;
  message?: string;
  meta?: Record<string, unknown>;
  at: string;
}

export interface AllowedTransition {
  to: RequestStatus;
  action: string;
  requires: 'reason' | 'message' | null;
}

export interface RequestRequirements {
  title: string;
  category: string;
  purpose: string;
  description: string;
  specifications: Specs;
  quantity: number;
  urgency: string;
  neededBy?: string | null;
}

export interface ResourceRequestSummary extends RequestRequirements {
  _id: string;
  requester: PersonRef;
  department?: string;
  status: RequestStatus;
  allocation: { active: number; proposed: number };
  createdAt: string;
  updatedAt: string;
}

export interface AssetRef {
  _id: string;
  assetTag: string;
  name: string;
  category: string;
  manufacturer?: string;
  model?: string;
  specs?: Specs;
  operatingSystem?: string;
  location?: string;
  department?: string;
  status: AssetStatus;
}

export interface Assignment {
  _id: string;
  request: string | { _id: string; title: string; status: RequestStatus; quantity?: number; requester?: PersonRef };
  asset: AssetRef;
  status: AssignmentStatus;
  isCurrent: boolean;
  assignedBy: PersonRef;
  assignedAt: string;
  approvedBy?: PersonRef | null;
  approvedAt?: string | null;
  endedBy?: PersonRef | null;
  endedAt?: string | null;
  endReason?: string;
  notes?: string;
}

export interface ResourceRequestDetail extends ResourceRequestSummary {
  original: RequestRequirements;
  history: HistoryEntry[];
  assignments: Assignment[];
  rejection?: { reason: string; rejectedAt: string };
  pendingClarification?: { message: string; requestedAt: string };
  closure?: { reason?: string; closedAt: string };
  allowedTransitions: AllowedTransition[];
  canEdit: boolean;
  canRespondToClarification: boolean;
}

export interface Asset extends AssetRef {
  serialNumber?: string;
  software?: string[];
  notes?: string;
  currentAssignment: null | {
    _id: string;
    status: AssignmentStatus;
    assignedAt: string;
    request: { _id: string; title: string; status: RequestStatus; requester?: PersonRef };
  };
  createdAt: string;
  updatedAt: string;
  assignmentHistory?: (Omit<Assignment, 'asset' | 'request'> & { request: { _id: string; title: string; status: RequestStatus } })[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminOverview {
  requestsByStatus: Record<RequestStatus, number>;
  urgentOpenRequests: number;
  needsAttention: ResourceRequestSummary[];
  assetsByStatus: Record<AssetStatus, number>;
  assignments: { proposed: number; active: number };
}

// GET /api/requests/:id/matches (advisory; see docs/IT_RESOURCE_WORKFLOW.md)
export type Eligibility = 'compatible' | 'unverified' | 'incompatible';

export interface MatchRequirement {
  field: string;
  label: string;
  kind: 'exact' | 'minimum' | 'minimum_tier' | 'compatibility' | 'capability' | 'preference';
  value: unknown;
  display: string;
}

export interface MatchWarning {
  code: string;
  severity: 'warning' | 'info';
  message: string;
  field?: string;
  fields?: string[];
}

export interface MatchComparison {
  field: string;
  label: string;
  required: unknown;
  actual: unknown;
  result: 'meets' | 'exceeds' | 'fails' | 'missing';
  message: string;
}

export interface MatchCandidate {
  asset: Omit<AssetRef, 'status'> & { specs: Specs };
  availability: { status: AssetStatus; available: boolean };
  eligibility: Eligibility;
  score: number | null;
  scoreBreakdown: { rule: string; points: number; message: string }[];
  comparisons: MatchComparison[];
  matches: string[];
  failures: string[];
  unverified: string[];
  preferences: string[];
}

export interface MatchResult {
  requestId: string;
  generatedAt: string;
  advisory: true;
  method: { version: string; scoring: Record<string, number> };
  request: { status: RequestStatus; category: string; quantity: number; remaining: number; allocatable: boolean };
  requirements: MatchRequirement[];
  warnings: MatchWarning[];
  candidates: {
    eligible: MatchCandidate[];
    needsVerification: MatchCandidate[];
    incompatible: MatchCandidate[];
    unavailable: MatchCandidate[];
  };
  summary: {
    evaluated: number; eligible: number; needsVerification: number; incompatible: number;
    unavailable: number; unavailableCompatible: number; otherCategoryAvailable: number;
  };
  explanation: string | null;
}
