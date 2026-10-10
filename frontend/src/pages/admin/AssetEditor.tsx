import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { SpecFieldsEditor } from '../../components/resources/SpecFieldsEditor';
import { AssetStatusBadge, AssignmentStatusBadge } from '../../components/resources/StatusBadge';
import { ErrorCard, LoadingCard } from '../../components/resources/PageState';
import { formatDate, useCatalog } from '../../components/resources/useCatalog';
import { errorMessage, resourceApi, type AssetInput } from '../../lib/resourceApi';
import type { Asset } from '../../types';

type FormValues = AssetInput & { assetTag: string; softwareText: string };

const empty: FormValues = {
  assetTag: '', name: '', category: '', manufacturer: '', model: '', serialNumber: '', specs: {},
  operatingSystem: '', software: [], softwareText: '', location: '', department: '', status: 'available', notes: '',
};

const fromAsset = (a: Asset): FormValues => ({
  assetTag: a.assetTag, name: a.name, category: a.category, manufacturer: a.manufacturer ?? '', model: a.model ?? '',
  serialNumber: a.serialNumber ?? '', specs: a.specs ?? {}, operatingSystem: a.operatingSystem ?? '',
  software: a.software ?? [], softwareText: (a.software ?? []).join(', '), location: a.location ?? '',
  department: a.department ?? '', status: a.status, notes: a.notes ?? '',
});

/** Create (/admin/inventory/new) or view/edit (/admin/inventory/:id) an asset. */
export const AssetEditor: React.FC = () => {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { catalog, error: catalogError } = useCatalog();

  const [asset, setAsset] = useState<Asset | null>(null);
  const [values, setValues] = useState<FormValues>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const a = await resourceApi.getAsset(id);
      setAsset(a);
      setValues(fromAsset(a));
    } catch (e) {
      setLoadError(errorMessage(e, 'Failed to load asset'));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (catalogError) return <ErrorCard message={catalogError} />;
  if (loadError) return <ErrorCard message={loadError} onRetry={load} />;
  if (!catalog || (!isNew && !asset)) return <LoadingCard lines={8} />;

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setValues(prev => ({ ...prev, [k]: v }));
  const holdsAssignment = !!asset?.currentAssignment;

  const validate = () => {
    const e: typeof errors = {};
    if (isNew && !/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/.test(values.assetTag.trim())) {
      e.assetTag = '2-40 characters: letters, digits, ".", "_" or "-"';
    }
    if (!values.name.trim()) e.name = 'Name is required';
    if (!values.category) e.category = 'Choose a category';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    const payload: AssetInput = {
      name: values.name.trim(), category: values.category, manufacturer: values.manufacturer, model: values.model,
      serialNumber: values.serialNumber, specs: values.specs, operatingSystem: values.operatingSystem,
      software: values.softwareText.split(',').map(s => s.trim()).filter(Boolean),
      location: values.location, department: values.department, notes: values.notes,
    };
    // Status can only be set manually while the asset holds no assignment.
    if (!holdsAssignment) payload.status = values.status;
    setSaving(true);
    try {
      if (isNew) {
        const created = await resourceApi.createAsset({ ...payload, assetTag: values.assetTag.trim() });
        toast.success(`Asset ${created.assetTag} created`);
        navigate(`/admin/inventory/${created._id}`);
      } else {
        const updated = await resourceApi.updateAsset(id!, payload);
        setAsset(updated);
        setValues(fromAsset(updated));
        toast.success('Asset saved');
      }
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to save asset'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/admin/inventory" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to inventory
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{isNew ? 'Add asset' : `${asset!.assetTag} · ${asset!.name}`}</h1>
        {asset && <AssetStatusBadge status={asset.status} />}
      </div>

      {asset?.currentAssignment && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 text-sm text-blue-900">
            {asset.currentAssignment.status === 'proposed' ? 'Reserved (pending approval) for ' : 'Currently assigned to '}
            <Link to={`/admin/requests/${asset.currentAssignment.request._id}`} className="font-medium underline">
              {asset.currentAssignment.request.title}
            </Link>
            {asset.currentAssignment.request.requester?.name && ` — ${asset.currentAssignment.request.requester.name}`}
            {' '}since {formatDate(asset.currentAssignment.assignedAt)}.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{isNew ? 'Asset details' : 'Edit details'}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input id="assetTag" label="Asset ID" value={values.assetTag} disabled={!isNew} error={errors.assetTag}
                placeholder="e.g. PC-LAB1-001" onChange={e => set('assetTag', e.target.value)} />
              <Input id="name" label="Name" value={values.name} error={errors.name} onChange={e => set('name', e.target.value)} />
              <Select id="category" label="Category" value={values.category} error={errors.category}
                onChange={e => set('category', e.target.value)}
                options={[{ value: '', label: 'Select a category' }, ...catalog.categories.map(c => ({ value: c.key, label: c.label }))]} />
              <div>
                <Select id="status" label="Availability" value={values.status} disabled={holdsAssignment}
                  onChange={e => set('status', e.target.value)}
                  options={(holdsAssignment ? [values.status ?? ''] : catalog.adminSettableAssetStatuses).map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />
                {holdsAssignment && <p className="mt-1 text-xs text-gray-500">Release the assignment before changing availability.</p>}
              </div>
              <Input id="manufacturer" label="Manufacturer" value={values.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
              <Input id="model" label="Model" value={values.model} onChange={e => set('model', e.target.value)} />
              <Input id="serialNumber" label="Serial number" value={values.serialNumber} onChange={e => set('serialNumber', e.target.value)} />
              <Input id="operatingSystem" label="Operating system" value={values.operatingSystem} onChange={e => set('operatingSystem', e.target.value)} />
              <Input id="location" label="Location" value={values.location} onChange={e => set('location', e.target.value)} />
              <Input id="department" label="Department" value={values.department} onChange={e => set('department', e.target.value)} />
            </div>
            <Input id="software" label="Installed software (comma-separated)" value={values.softwareText}
              onChange={e => set('softwareText', e.target.value)} />
            {values.category && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700">Hardware specifications</h3>
                <SpecFieldsEditor catalog={catalog} category={values.category} value={values.specs}
                  onChange={specs => set('specs', specs)} idPrefix="asset-spec" />
              </div>
            )}
            <Textarea id="notes" label="Notes" rows={3} value={values.notes} onChange={e => set('notes', e.target.value)} maxLength={5000} />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => navigate('/admin/inventory')}>Cancel</Button>
              <Button type="submit" isLoading={saving}>{isNew ? 'Create asset' : 'Save changes'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {asset && (
        <Card>
          <CardHeader><CardTitle>Assignment history</CardTitle></CardHeader>
          <CardContent>
            {!asset.assignmentHistory?.length ? <p className="text-sm text-gray-500">Never assigned.</p> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-2 px-2 font-medium">Request</th>
                    <th className="py-2 px-2 font-medium">Status</th>
                    <th className="py-2 px-2 font-medium">Assigned</th>
                    <th className="py-2 px-2 font-medium">Ended</th>
                  </tr>
                </thead>
                <tbody>
                  {asset.assignmentHistory.map(h => (
                    <tr key={h._id} className="border-b border-gray-100">
                      <td className="py-2 px-2"><Link to={`/admin/requests/${h.request._id}`} className="text-blue-600 hover:text-blue-800">{h.request.title}</Link></td>
                      <td className="py-2 px-2"><AssignmentStatusBadge status={h.status} /></td>
                      <td className="py-2 px-2 text-gray-600">{formatDate(h.assignedAt)} · {h.assignedBy?.name}</td>
                      <td className="py-2 px-2 text-gray-600">{h.endedAt ? `${formatDate(h.endedAt)}${h.endReason ? ` · ${h.endReason}` : ''}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-gray-500 mt-3">Created {formatDate(asset.createdAt)} · last modified {formatDate(asset.updatedAt)}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
