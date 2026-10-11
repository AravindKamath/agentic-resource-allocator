import React from 'react';
import { Badge } from '../ui/Badge';
import type { AssetStatus, AssignmentStatus, RequestStatus } from '../../types';
import { requestStatusLabel, useCatalog } from './useCatalog';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'secondary';

const REQUEST_VARIANTS: Record<RequestStatus, Variant> = {
  RECEIVED: 'secondary',
  UNDER_REVIEW: 'secondary',
  CLARIFICATION_REQUIRED: 'warning',
  APPROVED: 'warning',
  ALLOCATION_PENDING: 'warning',
  PARTIALLY_ALLOCATED: 'warning',
  ALLOCATED: 'success',
  REJECTED: 'danger',
  CLOSED: 'default',
};

const ASSET_VARIANTS: Record<AssetStatus, Variant> = {
  available: 'success',
  reserved: 'warning',
  allocated: 'secondary',
  maintenance: 'warning',
  unavailable: 'danger',
  retired: 'default',
};

const ASSIGNMENT_VARIANTS: Record<AssignmentStatus, Variant> = {
  proposed: 'warning',
  active: 'success',
  rejected: 'danger',
  released: 'default',
};

export const RequestStatusBadge: React.FC<{ status: RequestStatus }> = ({ status }) => {
  const { catalog } = useCatalog();
  return <Badge variant={REQUEST_VARIANTS[status] ?? 'default'}>{requestStatusLabel(catalog, status)}</Badge>;
};

export const AssetStatusBadge: React.FC<{ status: AssetStatus }> = ({ status }) => (
  <Badge variant={ASSET_VARIANTS[status] ?? 'default'} className="capitalize">{status}</Badge>
);

export const AssignmentStatusBadge: React.FC<{ status: AssignmentStatus }> = ({ status }) => (
  <Badge variant={ASSIGNMENT_VARIANTS[status] ?? 'default'} className="capitalize">
    {status === 'proposed' ? 'proposed (reserved)' : status}
  </Badge>
);
