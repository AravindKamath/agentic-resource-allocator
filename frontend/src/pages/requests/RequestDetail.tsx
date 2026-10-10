import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { AssignmentStatusBadge, RequestStatusBadge } from '../../components/resources/StatusBadge';
import { ErrorCard, LoadingCard } from '../../components/resources/PageState';
import { SpecList } from '../../components/resources/SpecList';
import { HistoryTimeline } from '../../components/resources/HistoryTimeline';
import { ReasonForm } from '../../components/resources/ReasonForm';
import { AssignAssetPanel } from '../../components/resources/AssignAssetPanel';
import { categoryLabel, formatDate, formatDay, shortId, urgencyLabel, useCatalog } from '../../components/resources/useCatalog';
import { errorMessage, resourceApi } from '../../lib/resourceApi';
import { useAuthStore } from '../../stores/auth';
import type { AllowedTransition, Assignment, ResourceRequestDetail } from '../../types';
import { RequestFields } from './RequestFields';
import { toRequestPayload, validateRequestForm, type RequestFormErrors, type RequestFormValues } from './requestForm';
import { Textarea } from '../../components/ui/Textarea';

const ALLOCATABLE = ['APPROVED', 'ALLOCATION_PENDING', 'PARTIALLY_ALLOCATED'];

const ACTION_LABELS: Record<string, string> = {
  start_review: 'Start review',
  resume_review: 'Resume review',
  approve: 'Approve request',
  request_clarification: 'Request clarification',
  reject: 'Reject request',
  close: 'Close request',
};

type PendingAction =
  | { kind: 'transition'; transition: AllowedTransition }
  | { kind: 'assignment'; assignment: Assignment; op: 'reject' | 'release' };

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{children}</dd>
  </div>
);

export const RequestDetail: React.FC = () => {
  const { id = '' } = useParams();
  const { user } = useAuthStore();
  const { catalog } = useCatalog();
  const isAdmin = user?.role === 'admin';

  const [request, setRequest] = useState<ResourceRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRequest(await resourceApi.getRequest(id));
    } catch (e) {
      setError(errorMessage(e, 'Failed to load request'));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorCard message={error} onRetry={load} />;
  if (!request) return <LoadingCard lines={8} />;

  const runTransition = async (t: AllowedTransition, text?: string) => {
    setBusy(true);
    try {
      const extra = t.requires === 'message' ? { message: text } : { reason: text };
      setRequest(await resourceApi.transition(request._id, t.to, extra));
      setPending(null);
      toast.success('Request updated');
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
      load();
    } finally {
      setBusy(false);
    }
  };

  const runAssignmentOp = async (a: Assignment, op: 'approve' | 'reject' | 'release', reason = '') => {
    setBusy(true);
    try {
      if (op === 'approve') await resourceApi.approveAssignment(a._id);
      if (op === 'reject') await resourceApi.rejectAssignment(a._id, reason);
      if (op === 'release') await resourceApi.releaseAssignment(a._id, reason);
      toast.success(op === 'approve' ? 'Allocation approved' : op === 'reject' ? 'Reservation rejected' : 'Asset released');
      setPending(null);
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
    } finally {
      setBusy(false);
      load();
    }
  };

  const actionLabel = (t: AllowedTransition) =>
    t.action === 'close' && !isAdmin ? 'Withdraw request' : ACTION_LABELS[t.action] ?? t.to;

  const originalChanged = JSON.stringify(request.original) !== JSON.stringify({
    title: request.title, category: request.category, purpose: request.purpose, description: request.description,
    specifications: request.specifications, quantity: request.quantity, urgency: request.urgency, neededBy: request.neededBy ?? null,
  });

  const requirements = showOriginal ? request.original : request;
  const canAssign = isAdmin && ALLOCATABLE.includes(request.status) &&
    request.allocation.active + request.allocation.proposed < request.quantity;

  return (
    <div className="space-y-6">
      <Link to={isAdmin ? '/admin/requests' : '/requests'} className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to {isAdmin ? 'request queue' : 'my requests'}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{request.title}</h1>
          <p className="text-sm text-gray-500">#{shortId(request._id)} · submitted {formatDate(request.createdAt)}</p>
        </div>
        <RequestStatusBadge status={request.status} />
      </div>

      {request.status === 'CLARIFICATION_REQUIRED' && request.pendingClarification && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-yellow-900">IT has asked for more information</p>
            <p className="text-sm text-yellow-900 whitespace-pre-wrap mt-1">{request.pendingClarification.message}</p>
          </CardContent>
        </Card>
      )}
      {request.status === 'REJECTED' && request.rejection && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-red-900">Request rejected</p>
            <p className="text-sm text-red-900 whitespace-pre-wrap mt-1">{request.rejection.reason}</p>
          </CardContent>
        </Card>
      )}
      {request.status === 'CLOSED' && request.closure?.reason && (
        <Card>
          <CardContent className="p-4 text-sm text-gray-700">Closed: {request.closure.reason}</CardContent>
        </Card>
      )}

      {request.canRespondToClarification && (
        <ClarificationResponse request={request} onDone={setRequest} />
      )}

      {request.allowedTransitions.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {request.allowedTransitions.map(t => (
                <Button key={`${t.action}-${t.to}`}
                  variant={t.action === 'reject' || t.action === 'close' ? 'outline' : 'primary'}
                  disabled={busy}
                  onClick={() => (t.requires ? setPending({ kind: 'transition', transition: t }) : runTransition(t))}>
                  {actionLabel(t)}
                </Button>
              ))}
            </div>
            {pending?.kind === 'transition' && (
              <ReasonForm
                title={actionLabel(pending.transition)}
                label={pending.transition.requires === 'message' ? 'Message to the requester' : 'Reason'}
                required={pending.transition.requires !== null}
                confirmLabel="Confirm"
                variant={pending.transition.action === 'reject' ? 'danger' : 'primary'}
                onCancel={() => setPending(null)}
                onSubmit={text => runTransition(pending.transition, text)}
              />
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{showOriginal ? 'Original submission' : 'Requirements'}</CardTitle>
              {originalChanged && (
                <button className="text-sm text-blue-600 hover:text-blue-800" onClick={() => setShowOriginal(s => !s)}>
                  {showOriginal ? 'Show current' : 'Show original submission'}
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Category">{categoryLabel(catalog, requirements.category)}</Field>
              <Field label="Quantity">
                {requirements.quantity}
                {!showOriginal && ` (${request.allocation.active} allocated${request.allocation.proposed ? `, ${request.allocation.proposed} reserved` : ''})`}
              </Field>
              <Field label="Urgency">{urgencyLabel(catalog, requirements.urgency)}</Field>
              <Field label="Needed by">{formatDay(requirements.neededBy)}</Field>
              <div className="sm:col-span-2"><Field label="Purpose">{requirements.purpose}</Field></div>
              <div className="sm:col-span-2"><Field label="Description">{requirements.description}</Field></div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">Specifications</dt>
                <SpecList catalog={catalog} specs={requirements.specifications} />
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Requester</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Field label="Name">{request.requester?.name ?? '—'}</Field>
              <Field label="Email">{request.requester?.email ?? '—'}</Field>
              <Field label="Department">{request.department || request.requester?.department || '—'}</Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Assigned resources</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {request.assignments.length === 0 ? (
            <p className="text-sm text-gray-500">No resources have been assigned yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-2 px-2 font-medium">Asset</th>
                    <th className="py-2 px-2 font-medium">Details</th>
                    <th className="py-2 px-2 font-medium">Status</th>
                    <th className="py-2 px-2 font-medium">Assigned</th>
                    {isAdmin && <th className="py-2 px-2 font-medium" />}
                  </tr>
                </thead>
                <tbody>
                  {request.assignments.map(a => (
                    <tr key={a._id} className="border-b border-gray-100 align-top">
                      <td className="py-2 px-2">
                        {isAdmin
                          ? <Link to={`/admin/inventory/${a.asset._id}`} className="font-medium text-blue-600 hover:text-blue-800">{a.asset.assetTag}</Link>
                          : <span className="font-medium">{a.asset.assetTag}</span>}
                        <div className="text-xs text-gray-500">{a.asset.name}</div>
                      </td>
                      <td className="py-2 px-2 text-gray-600">
                        {[a.asset.manufacturer, a.asset.model].filter(Boolean).join(' ') || categoryLabel(catalog, a.asset.category)}
                        {a.asset.location && <div className="text-xs">Location: {a.asset.location}</div>}
                        {a.asset.operatingSystem && <div className="text-xs">OS: {a.asset.operatingSystem}</div>}
                      </td>
                      <td className="py-2 px-2">
                        <AssignmentStatusBadge status={a.status} />
                        {a.endReason && <div className="text-xs text-gray-500 mt-1">{a.endReason}</div>}
                      </td>
                      <td className="py-2 px-2 text-gray-600">
                        {formatDate(a.assignedAt)}
                        <div className="text-xs">by {a.assignedBy?.name ?? '—'}</div>
                      </td>
                      {isAdmin && (
                        <td className="py-2 px-2">
                          <div className="flex gap-2 justify-end">
                            {a.status === 'proposed' && (
                              <>
                                <Button size="sm" disabled={busy} onClick={() => runAssignmentOp(a, 'approve')}>Approve</Button>
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending({ kind: 'assignment', assignment: a, op: 'reject' })}>Reject</Button>
                              </>
                            )}
                            {a.status === 'active' && (
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending({ kind: 'assignment', assignment: a, op: 'release' })}>Release</Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pending?.kind === 'assignment' && (
            <ReasonForm
              title={pending.op === 'reject' ? `Reject reservation of ${pending.assignment.asset.assetTag}` : `Release ${pending.assignment.asset.assetTag} back to inventory`}
              label="Reason"
              required={false}
              confirmLabel={pending.op === 'reject' ? 'Reject reservation' : 'Release asset'}
              variant="danger"
              onCancel={() => setPending(null)}
              onSubmit={text => runAssignmentOp(pending.assignment, pending.op, text)}
            />
          )}
        </CardContent>
      </Card>

      {canAssign && <AssignAssetPanel catalog={catalog} request={request} onAssigned={setRequest} />}

      <Card>
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent><HistoryTimeline catalog={catalog} history={request.history} /></CardContent>
      </Card>
    </div>
  );
};

const ClarificationResponse: React.FC<{ request: ResourceRequestDetail; onDone: (r: ResourceRequestDetail) => void }> = ({ request, onDone }) => {
  const { catalog } = useCatalog();
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<RequestFormValues>({
    title: request.title, category: request.category, purpose: request.purpose, description: request.description,
    specifications: request.specifications, quantity: request.quantity, urgency: request.urgency, neededBy: request.neededBy ?? '',
  });
  const [errors, setErrors] = useState<RequestFormErrors>({});
  const [messageError, setMessageError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = editing ? validateRequestForm(values) : {};
    setErrors(found);
    if (!message.trim()) setMessageError('Please answer the question above');
    if (!message.trim() || Object.keys(found).length) return;
    setBusy(true);
    try {
      const updates = editing ? toRequestPayload(values) : {};
      onDone(await resourceApi.respondToClarification(request._id, message.trim(), updates));
      toast.success('Response sent; your request is back under review');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to send response'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Respond to IT</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Textarea id="clarification-message" label="Your answer" rows={3} value={message} error={messageError} maxLength={5000}
            onChange={e => { setMessage(e.target.value); setMessageError(undefined); }} />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={editing} onChange={e => setEditing(e.target.checked)} className="rounded border-gray-300 text-blue-600" />
            Also update the request details
          </label>
          {editing && catalog && <RequestFields catalog={catalog} values={values} errors={errors} onChange={setValues} />}
          <div className="flex justify-end">
            <Button type="submit" isLoading={busy}>Send response</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
