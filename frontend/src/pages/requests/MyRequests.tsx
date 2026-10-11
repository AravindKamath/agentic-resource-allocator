import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { RequestStatusBadge } from '../../components/resources/StatusBadge';
import { EmptyState, ErrorCard, LoadingCard, Pager } from '../../components/resources/PageState';
import { categoryLabel, formatDay, shortId, useCatalog } from '../../components/resources/useCatalog';
import { errorMessage, resourceApi } from '../../lib/resourceApi';
import type { Paged, ResourceRequestSummary } from '../../types';

export const MyRequests: React.FC = () => {
  const { catalog } = useCatalog();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<ResourceRequestSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await resourceApi.listRequests({ mine: true, page, limit: 20 }));
    } catch (e) {
      setError(errorMessage(e, 'Failed to load your requests'));
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Requests</h1>
        <Link to="/requests/new">
          <Button><Plus className="mr-2 h-4 w-4" />New Request</Button>
        </Link>
      </div>

      {error ? <ErrorCard message={error} onRetry={load} /> : !data ? <LoadingCard /> : (
        <Card>
          <CardHeader>
            <CardTitle>{data.total} request{data.total !== 1 ? 's' : ''}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.items.length === 0 ? (
              <EmptyState message="You have not requested any IT resources yet.">
                <Link to="/requests/new"><Button>Submit your first request</Button></Link>
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-3 px-2 font-medium text-gray-900">Request</th>
                      <th className="py-3 px-2 font-medium text-gray-900">Category</th>
                      <th className="py-3 px-2 font-medium text-gray-900">Qty</th>
                      <th className="py-3 px-2 font-medium text-gray-900">Status</th>
                      <th className="py-3 px-2 font-medium text-gray-900">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(r => (
                      <tr key={r._id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-2">
                          <Link to={`/requests/${r._id}`} className="font-medium text-blue-600 hover:text-blue-800">{r.title}</Link>
                          <div className="text-xs text-gray-500">#{shortId(r._id)}</div>
                        </td>
                        <td className="py-3 px-2 text-gray-600">{categoryLabel(catalog, r.category)}</td>
                        <td className="py-3 px-2 text-gray-600">{r.allocation.active}/{r.quantity}</td>
                        <td className="py-3 px-2"><RequestStatusBadge status={r.status} /></td>
                        <td className="py-3 px-2 text-gray-600">{formatDay(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
