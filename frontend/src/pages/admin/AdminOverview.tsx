import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { RequestStatusBadge } from '../../components/resources/StatusBadge';
import { EmptyState, ErrorCard, LoadingCard } from '../../components/resources/PageState';
import { categoryLabel, formatDay, requestStatusLabel, urgencyLabel, useCatalog } from '../../components/resources/useCatalog';
import { errorMessage, resourceApi } from '../../lib/resourceApi';
import type { AdminOverview as Overview, RequestStatus } from '../../types';

const Stat: React.FC<{ label: string; value: number; to?: string; highlight?: boolean }> = ({ label, value, to, highlight }) => {
  const body = (
    <Card className={highlight && value > 0 ? 'border-yellow-300' : ''}>
      <CardContent className="p-4">
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to} className="block hover:opacity-90">{body}</Link> : body;
};

export const AdminOverview: React.FC = () => {
  const { catalog } = useCatalog();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await resourceApi.overview());
    } catch (e) {
      setError(errorMessage(e, 'Failed to load overview'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorCard message={error} onRetry={load} />;
  if (!data) return <LoadingCard lines={8} />;

  const s = data.requestsByStatus;
  const queue = (statuses: RequestStatus[]) => `/admin/requests?status=${statuses.join(',')}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Overview</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">Requests needing action</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label="New (received)" value={s.RECEIVED} to={queue(['RECEIVED'])} highlight />
          <Stat label="Under review" value={s.UNDER_REVIEW} to={queue(['UNDER_REVIEW'])} highlight />
          <Stat label="Awaiting allocation" value={s.APPROVED + s.PARTIALLY_ALLOCATED} to={queue(['APPROVED', 'PARTIALLY_ALLOCATED'])} highlight />
          <Stat label="Reservations to approve" value={data.assignments.proposed} to="/admin/assignments?status=proposed" highlight />
          <Stat label="Urgent (high/critical) open" value={data.urgentOpenRequests} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">Waiting on others / done</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label="Waiting for requester" value={s.CLARIFICATION_REQUIRED} to={queue(['CLARIFICATION_REQUIRED'])} />
          <Stat label="Allocated" value={s.ALLOCATED} to={queue(['ALLOCATED'])} />
          <Stat label="Active assignments" value={data.assignments.active} to="/admin/assignments?status=active" />
          <Stat label="Rejected" value={s.REJECTED} to={queue(['REJECTED'])} />
          <Stat label="Closed" value={s.CLOSED} to={queue(['CLOSED'])} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">Inventory</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {(['available', 'reserved', 'allocated', 'maintenance', 'unavailable', 'retired'] as const).map(st => (
            <Stat key={st} label={st.charAt(0).toUpperCase() + st.slice(1)} value={data.assetsByStatus[st]} to={`/admin/inventory?status=${st}`} />
          ))}
        </div>
      </section>

      <Card>
        <CardHeader><CardTitle>Oldest open requests</CardTitle></CardHeader>
        <CardContent>
          {data.needsAttention.length === 0 ? <EmptyState message="Nothing is waiting for IT." /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2 px-2 font-medium">Request</th>
                  <th className="py-2 px-2 font-medium">Requester</th>
                  <th className="py-2 px-2 font-medium">Category</th>
                  <th className="py-2 px-2 font-medium">Urgency</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 px-2 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {data.needsAttention.map(r => (
                  <tr key={r._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-2"><Link to={`/admin/requests/${r._id}`} className="font-medium text-blue-600 hover:text-blue-800">{r.title}</Link></td>
                    <td className="py-2 px-2 text-gray-600">{r.requester?.name}{r.requester?.department ? ` · ${r.requester.department}` : ''}</td>
                    <td className="py-2 px-2 text-gray-600">{categoryLabel(catalog, r.category)}</td>
                    <td className="py-2 px-2 text-gray-600">{urgencyLabel(catalog, r.urgency)}</td>
                    <td className="py-2 px-2" title={requestStatusLabel(catalog, r.status)}><RequestStatusBadge status={r.status} /></td>
                    <td className="py-2 px-2 text-gray-600">{formatDay(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
