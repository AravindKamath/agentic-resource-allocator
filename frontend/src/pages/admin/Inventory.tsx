import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { AssetStatusBadge } from '../../components/resources/StatusBadge';
import { EmptyState, ErrorCard, LoadingCard, Pager } from '../../components/resources/PageState';
import { categoryLabel, useCatalog } from '../../components/resources/useCatalog';
import { errorMessage, resourceApi } from '../../lib/resourceApi';
import type { Asset, Paged } from '../../types';

const selectClass = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export const Inventory: React.FC = () => {
  const { catalog } = useCatalog();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Paged<Asset> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await resourceApi.listAssets({ status, category, q, page, limit: 25 }));
    } catch (e) {
      setError(errorMessage(e, 'Failed to load inventory'));
    }
  }, [status, category, q, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => { if (search !== q) update('q', search); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
        <Link to="/admin/inventory/new"><Button><Plus className="mr-2 h-4 w-4" />Add asset</Button></Link>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="w-64"><Input id="inventory-search" placeholder="Asset ID, name, model, location" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <select aria-label="Status" className={selectClass} value={status} onChange={e => update('status', e.target.value)}>
            <option value="">All statuses</option>
            {catalog?.assetStatuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select aria-label="Category" className={selectClass} value={category} onChange={e => update('category', e.target.value)}>
            <option value="">All categories</option>
            {catalog?.categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </CardContent>
      </Card>

      {error ? <ErrorCard message={error} onRetry={load} /> : !data ? <LoadingCard /> : (
        <Card>
          <CardHeader><CardTitle>{data.total} asset{data.total !== 1 ? 's' : ''}</CardTitle></CardHeader>
          <CardContent>
            {data.items.length === 0 ? (
              <EmptyState message="No assets match these filters.">
                <Link to="/admin/inventory/new"><Button>Add an asset</Button></Link>
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-3 px-2 font-medium">Asset</th>
                      <th className="py-3 px-2 font-medium">Category</th>
                      <th className="py-3 px-2 font-medium">Make / model</th>
                      <th className="py-3 px-2 font-medium">Location</th>
                      <th className="py-3 px-2 font-medium">Status</th>
                      <th className="py-3 px-2 font-medium">Assigned to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(a => (
                      <tr key={a._id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-2">
                          <Link to={`/admin/inventory/${a._id}`} className="font-medium text-blue-600 hover:text-blue-800">{a.assetTag}</Link>
                          <div className="text-xs text-gray-500">{a.name}</div>
                        </td>
                        <td className="py-3 px-2 text-gray-600">{categoryLabel(catalog, a.category)}</td>
                        <td className="py-3 px-2 text-gray-600">{[a.manufacturer, a.model].filter(Boolean).join(' ') || '—'}</td>
                        <td className="py-3 px-2 text-gray-600">{a.location || '—'}</td>
                        <td className="py-3 px-2"><AssetStatusBadge status={a.status} /></td>
                        <td className="py-3 px-2 text-gray-600">
                          {a.currentAssignment ? (
                            <Link to={`/admin/requests/${a.currentAssignment.request._id}`} className="text-blue-600 hover:text-blue-800">
                              {a.currentAssignment.request.requester?.name ?? a.currentAssignment.request.title}
                            </Link>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pager page={data.page} limit={data.limit} total={data.total} onPage={p => update('page', String(p))} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
