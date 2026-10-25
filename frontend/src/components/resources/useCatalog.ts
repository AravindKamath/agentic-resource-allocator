import { useEffect } from 'react';
import { useCatalogStore } from '../../stores/catalog';
import type { Catalog } from '../../types';
import type { RequestStatus } from '../../types';

export type DisplayRequestStatus = 'new' | 'in_progress' | 'allocated' | 'closed';
export const DISPLAY_STATUS_LABELS: Record<DisplayRequestStatus, string> = {
  new: 'New', in_progress: 'In progress', allocated: 'Allocated', closed: 'Closed'
};
export const DISPLAY_STATUS_GROUPS: Record<DisplayRequestStatus, RequestStatus[]> = {
  new: ['RECEIVED'],
  in_progress: ['UNDER_REVIEW', 'CLARIFICATION_REQUIRED', 'APPROVED', 'ALLOCATION_PENDING', 'PARTIALLY_ALLOCATED'],
  allocated: ['ALLOCATED'],
  closed: ['REJECTED', 'CLOSED']
};

export const displayRequestStatus = (status: RequestStatus): DisplayRequestStatus =>
  (Object.entries(DISPLAY_STATUS_GROUPS).find(([, values]) => values.includes(status))?.[0] as DisplayRequestStatus) ?? 'closed';
export const displayStatusLabel = (status: RequestStatus) => DISPLAY_STATUS_LABELS[displayRequestStatus(status)];
export const statusesForDisplay = (status: DisplayRequestStatus) => DISPLAY_STATUS_GROUPS[status];

export function useCatalog() {
  const { catalog, error, load } = useCatalogStore();
  useEffect(() => {
    load();
  }, [load]);
  return { catalog, error };
}

export const categoryLabel = (catalog: Catalog | null, key: string) =>
  catalog?.categories.find(c => c.key === key)?.label ?? key;

export const urgencyLabel = (catalog: Catalog | null, key: string) =>
  catalog?.urgencyLevels.find(u => u.key === key)?.label ?? key;

export const requestStatusLabel = (catalog: Catalog | null, key: string) =>
  displayStatusLabel(key as RequestStatus);

export const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const formatDay = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

export const shortId = (id: string) => id.slice(-6).toUpperCase();

export const formatSpecValue = (catalog: Catalog | null, key: string, value: unknown) => {
  const def = catalog?.specFields[key];
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return def?.unit ? `${value} ${def.unit}` : String(value);
};
