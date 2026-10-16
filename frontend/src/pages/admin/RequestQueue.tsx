import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { RequestStatusBadge } from '../../components/resources/StatusBadge';
import { EmptyState, ErrorCard, LoadingCard, Pager } from '../../components/resources/PageState';
import { categoryLabel, formatDay, shortId, urgencyLabel, useCatalog } from '../../components/resources/useCatalog';
import { errorMessage, resourceApi } from '../../lib/resourceApi';
import type { Paged, ResourceRequestSummary } from '../../types';

const selectClass = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export const RequestQueue: React.FC = () => {
  const { catalog } = useCatalog();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Paged<ResourceRequestSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const urgency = params.get('urgency') ?? '';
  const sort = params.get('sort') ?? 'oldest';
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
      setData(await resourceApi.listRequests({ status, category, urgency, sort, q, page, limit: 25 }));
    } catch (e) {
      setError(errorMessage(e, 'Failed to load requests'));
    }
  }, [status, category, urgency, sort, q, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => { if (search !== q) update('q', search); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-indigo-600">Exceptions</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">Requests</h1>
        <p className="mt-1 text-sm text-gray-500">Prioritize requests that need review, clarification, or allocation.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="w-56"><Input id="queue-search" placeholder="Search title" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <select aria-label="Status" className={selectClass} value={status} onChange={e => update('status', e.target.value)}>
            <option value="">All statuses</option>
            {status.includes(',') && <option value={status}>Selected ({status.split(',').length})</option>}
            {catalog?.requestStatuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select aria-label="Category" className={selectClass} value={category} onChange={e => update('category', e.target.value)}>
            <option value="">All categories</option>
            {catalog?.categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select aria-label="Urgency" className={selectClass} value={urgency} onChange={e => update('urgency', e.target.value)}>
            <option value="">Any urgency</option>
            {catalog?.urgencyLevels.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
          </select>
          <select aria-label="Sort" className={selectClass} value={sort} onChange={e => update('sort', e.target.value)}>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </CardContent>
      </Card>

      {error ? <ErrorCard message={error} onRetry={load} /> : !data ? <LoadingCard /> : (
        <Card>
          <CardHeader><CardTitle>{data.total} request{data.total !== 1 ? 's' : ''}</CardTitle></CardHeader>
          <CardContent>
            {data.items.length === 0 ? <EmptyState message="No requests match these filters." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-3 px-2 font-medium">Request</th>
                      <th className="py-3 px-2 font-medium">Requester</th>
                      <th className="py-3 px-2 font-medium">Category</th>
                      <th className="py-3 px-2 font-medium">Qty</th>
                      <th className="py-3 px-2 font-medium">Urgency</th>
                      <th className="py-3 px-2 font-medium">Status</th>
                      <th className="py-3 px-2 font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(r => (
                      <tr key={r._id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-2">
                          <Link to={`/admin/requests/${r._id}`} className="font-medium text-blue-600 hover:text-blue-800">{r.title}</Link>
                          <div className="text-xs text-gray-500">#{shortId(r._id)}</div>
                        </td>
                        <td className="py-3 px-2 text-gray-600">
                          {r.requester?.name}
                          <div className="text-xs">{r.department || r.requester?.department || ''}</div>
                        </td>
                        <td className="py-3 px-2 text-gray-600">{categoryLabel(catalog, r.category)}</td>
                        <td className="py-3 px-2 text-gray-600">{r.allocation.active}/{r.quantity}</td>
                        <td className="py-3 px-2 text-gray-600">{urgencyLabel(catalog, r.urgency)}</td>
                        <td className="py-3 px-2"><RequestStatusBadge status={r.status} /></td>
                        <td className="py-3 px-2 text-gray-600">{formatDay(r.createdAt)}</td>
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
