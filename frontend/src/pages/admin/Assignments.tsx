import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { AssignmentStatusBadge } from '../../components/resources/StatusBadge';
import { EmptyState, ErrorCard, LoadingCard, Pager } from '../../components/resources/PageState';
import { formatDate, useCatalog } from '../../components/resources/useCatalog';
import { errorMessage, resourceApi } from '../../lib/resourceApi';
import type { Assignment, Paged } from '../../types';

const selectClass = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export const Assignments: React.FC = () => {
  const { catalog } = useCatalog();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Paged<Assignment> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await resourceApi.listAssignments({ status, page, limit: 25 }));
    } catch (e) {
      setError(errorMessage(e, 'Failed to load assignments'));
    }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
      <Card>
        <CardContent className="p-4">
          <select aria-label="Status" className={selectClass} value={status} onChange={e => setFilter('status', e.target.value)}>
            <option value="">All assignments</option>
            {catalog?.assignmentStatuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </CardContent>
      </Card>

      {error ? <ErrorCard message={error} onRetry={load} /> : !data ? <LoadingCard /> : (
        <Card>
          <CardHeader><CardTitle>{data.total} assignment{data.total !== 1 ? 's' : ''}</CardTitle></CardHeader>
          <CardContent>
            {data.items.length === 0 ? <EmptyState message="No assignments match this filter." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-3 px-2 font-medium">Asset</th>
                      <th className="py-3 px-2 font-medium">Request</th>
                      <th className="py-3 px-2 font-medium">Requester</th>
                      <th className="py-3 px-2 font-medium">Status</th>
                      <th className="py-3 px-2 font-medium">Assigned</th>
                      <th className="py-3 px-2 font-medium">Ended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(a => {
                      const req = typeof a.request === 'object' ? a.request : null;
                      return (
                        <tr key={a._id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2">
                            <Link to={`/admin/inventory/${a.asset?._id}`} className="font-medium text-blue-600 hover:text-blue-800">{a.asset?.assetTag}</Link>
                            <div className="text-xs text-gray-500">{a.asset?.name}</div>
                          </td>
                          <td className="py-3 px-2">
                            {req ? <Link to={`/admin/requests/${req._id}`} className="text-blue-600 hover:text-blue-800">{req.title}</Link> : '—'}
                          </td>
                          <td className="py-3 px-2 text-gray-600">
                            {req?.requester?.name ?? '—'}
                            {req?.requester?.department && <div className="text-xs">{req.requester.department}</div>}
                          </td>
                          <td className="py-3 px-2"><AssignmentStatusBadge status={a.status} /></td>
                          <td className="py-3 px-2 text-gray-600">{formatDate(a.assignedAt)}<div className="text-xs">by {a.assignedBy?.name}</div></td>
                          <td className="py-3 px-2 text-gray-600">
                            {a.endedAt ? formatDate(a.endedAt) : '—'}
                            {a.endReason && <div className="text-xs">{a.endReason}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pager page={data.page} limit={data.limit} total={data.total} onPage={p => setFilter('page', String(p))} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
