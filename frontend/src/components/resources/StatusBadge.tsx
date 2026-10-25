import React from 'react';
import { Badge } from '../ui/Badge';
import type { AssetStatus, AssignmentStatus, RequestStatus } from '../../types';
import { displayStatusLabel } from './useCatalog';

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
  allocated: 'success',
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

export const RequestStatusBadge: React.FC<{ status: RequestStatus; active?: number; quantity?: number }> = ({ status, active, quantity }) => {
  const progress = status === 'PARTIALLY_ALLOCATED' && active !== undefined && quantity !== undefined
    ? ` · ${active} of ${quantity}`
    : '';
  return <Badge variant={REQUEST_VARIANTS[status] ?? 'default'}>{displayStatusLabel(status)}{progress}</Badge>;
};

export const AssetStatusBadge: React.FC<{ status: AssetStatus }> = ({ status }) => (
  <Badge variant={ASSET_VARIANTS[status] ?? 'default'} className="capitalize">{status}</Badge>
);

export const AssignmentStatusBadge: React.FC<{ status: AssignmentStatus }> = ({ status }) => (
  <Badge variant={ASSIGNMENT_VARIANTS[status] ?? 'default'} className="capitalize">
    {status === 'proposed' ? 'proposed (reserved)' : status}
  </Badge>
);
