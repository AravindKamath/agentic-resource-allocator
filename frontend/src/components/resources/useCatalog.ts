import { useEffect } from 'react';
import { useCatalogStore } from '../../stores/catalog';
import type { Catalog } from '../../types';

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
  catalog?.requestStatuses.find(s => s.key === key)?.label ?? key.replace(/_/g, ' ').toLowerCase();

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
