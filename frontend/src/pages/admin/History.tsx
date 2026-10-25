import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { AssignmentStatusBadge } from '../../components/resources/StatusBadge';
import { EmptyState, ErrorCard, LoadingCard, Pager } from '../../components/resources/PageState';
import { formatDate, useCatalog } from '../../components/resources/useCatalog';
import { errorMessage, resourceApi } from '../../lib/resourceApi';
import type { Assignment, Paged } from '../../types';

const selectClass = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export const History: React.FC = () => {
  const { catalog } = useCatalog();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Paged<Assignment> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = params.get('status') ?? '';
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
      setData(await resourceApi.listAssignments({ status, page, limit: 25 }));
    } catch (e) {
      setError(errorMessage(e, 'Failed to load history'));
    }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--primary-strong)]">Audit trail</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text)]">History</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Persisted allocation, reservation, release, and rejection events.</p>
      </div>
      <Card>
        <CardContent className="p-4">
          <select aria-label="History event" className={selectClass} value={status} onChange={e => update('status', e.target.value)}>
            <option value="">All allocation events</option>
            {catalog?.assignmentStatuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </CardContent>
      </Card>
      {error ? <ErrorCard message={error} onRetry={load} /> : !data ? <LoadingCard /> : (
        <Card>
          <CardHeader><CardTitle>{data.total} persisted event{data.total !== 1 ? 's' : ''}</CardTitle></CardHeader>
          <CardContent>
            {data.items.length === 0 ? <EmptyState message="No persisted events match this filter." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[var(--border)] text-left">
                    <th className="px-2 py-3 font-medium">When</th><th className="px-2 py-3 font-medium">Asset</th><th className="px-2 py-3 font-medium">Request</th><th className="px-2 py-3 font-medium">Event</th><th className="px-2 py-3 font-medium">Actor</th>
                  </tr></thead>
                  <tbody>{data.items.map(item => (
                    <tr key={item._id} className="border-b border-[var(--border)]">
                      <td className="px-2 py-3 text-[var(--text-muted)]">{formatDate(item.endedAt || item.approvedAt || item.assignedAt)}</td>
                      <td className="px-2 py-3"><Link className="font-medium text-[var(--primary-strong)] hover:underline" to={`/admin/inventory/${item.asset._id}`}>{item.asset.assetTag}</Link></td>
                      <td className="px-2 py-3"><Link className="text-[var(--primary-strong)] hover:underline" to={`/admin/requests/${typeof item.request === 'string' ? item.request : item.request._id}`}>{typeof item.request === 'string' ? item.request : item.request.title}</Link></td>
                      <td className="px-2 py-3"><AssignmentStatusBadge status={item.status} /></td>
                      <td className="px-2 py-3 text-[var(--text-muted)]">{item.endedBy?.name || item.approvedBy?.name || item.assignedBy?.name || '—'}</td>
                    </tr>
                  ))}</tbody>
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
