import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { RequestStatusBadge } from '../../components/resources/StatusBadge';
import { EmptyState, ErrorCard, LoadingCard } from '../../components/resources/PageState';
import { categoryLabel, formatDay, requestStatusLabel, useCatalog } from '../../components/resources/useCatalog';
import { errorMessage, resourceApi } from '../../lib/resourceApi';
import type { AdminOverview as Overview } from '../../types';

export const AdminOverview: React.FC = () => {
  const { catalog } = useCatalog();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await resourceApi.overview());
    } catch (e) {
      setError(errorMessage(e, 'Failed to load requests needing attention'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorCard message={error} onRetry={load} />;
  if (!data) return <LoadingCard lines={5} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-indigo-600">Admin workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">Requests needing attention</h1>
          <p className="mt-1 text-sm text-gray-500">Review exceptions and allocate compatible assets from the request detail.</p>
        </div>
        <Link to="/admin/requests" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
          View all requests <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Open request queue</CardTitle></CardHeader>
        <CardContent>
          {data.needsAttention.length === 0 ? <EmptyState message="No requests need attention." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-2 py-2 font-medium">Request</th>
                    <th className="px-2 py-2 font-medium">Requester</th>
                    <th className="px-2 py-2 font-medium">Category</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.needsAttention.map(request => (
                    <tr key={request._id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-2 py-3">
                        <Link to={`/admin/requests/${request._id}`} className="font-medium text-indigo-600 hover:text-indigo-800">{request.title}</Link>
                      </td>
                      <td className="px-2 py-3 text-gray-600">{request.requester?.name || '—'}</td>
                      <td className="px-2 py-3 text-gray-600">{categoryLabel(catalog, request.category)}</td>
                      <td className="px-2 py-3" title={requestStatusLabel(catalog, request.status)}><RequestStatusBadge status={request.status} /></td>
                      <td className="px-2 py-3 text-gray-600">{formatDay(request.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
