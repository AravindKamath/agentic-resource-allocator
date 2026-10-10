import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { EmptyState, ErrorCard } from './PageState';
import { SpecList } from './SpecList';
import { categoryLabel } from './useCatalog';
import { errorMessage, resourceApi } from '../../lib/resourceApi';
import type { Asset, Catalog, ResourceRequestDetail } from '../../types';

interface Props {
  catalog: Catalog | null;
  request: ResourceRequestDetail;
  onAssigned: (updated: ResourceRequestDetail) => void;
}

/**
 * Lists available inventory and assigns (or reserves pending approval) an asset.
 * Candidates are filtered by category only; requirement matching is not
 * implemented yet, so the administrator compares specifications manually.
 */
export const AssignAssetPanel: React.FC<Props> = ({ catalog, request, onAssigned }) => {
  const [sameCategory, setSameCategory] = useState(true);
  const [q, setQ] = useState('');
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const remaining = request.quantity - request.allocation.active - request.allocation.proposed;

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await resourceApi.listAssets({
        status: 'available',
        category: sameCategory ? request.category : undefined,
        q: q || undefined,
        limit: 50,
      });
      setAssets(res.items);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load inventory'));
    }
  }, [sameCategory, q, request.category]);

  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
  }, [load]);

  const assign = async (asset: Asset, mode: 'assign' | 'propose') => {
    setBusyId(asset._id);
    try {
      const updated = await resourceApi.assign(request._id, asset._id, mode);
      toast.success(mode === 'assign' ? `${asset.assetTag} assigned` : `${asset.assetTag} reserved pending approval`);
      onAssigned(updated);
    } catch (e) {
      toast.error(errorMessage(e, 'Assignment failed'));
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign resources</CardTitle>
        <p className="text-sm text-gray-600 mt-2">
          {remaining} of {request.quantity} still to allocate. Compare each asset with the requirements above.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-64">
            <Input id="asset-search" label="Search" placeholder="Asset ID, name, model, location" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input type="checkbox" checked={sameCategory} onChange={e => setSameCategory(e.target.checked)}
              className="rounded border-gray-300 text-blue-600" />
            Only {categoryLabel(catalog, request.category)}
          </label>
        </div>

        {error ? <ErrorCard message={error} onRetry={load} /> : !assets ? <p className="text-sm text-gray-500">Loading inventory…</p> :
          assets.length === 0 ? <EmptyState message="No available assets match these filters." /> : (
            <ul className="divide-y divide-gray-100">
              {assets.map(asset => (
                <li key={asset._id} className="py-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{asset.assetTag} · {asset.name}</p>
                    <p className="text-xs text-gray-500">
                      {categoryLabel(catalog, asset.category)}
                      {asset.manufacturer || asset.model ? ` · ${[asset.manufacturer, asset.model].filter(Boolean).join(' ')}` : ''}
                      {asset.location ? ` · ${asset.location}` : ''}
                      {asset.operatingSystem ? ` · ${asset.operatingSystem}` : ''}
                    </p>
                    <div className="mt-2 max-w-xl"><SpecList catalog={catalog} specs={asset.specs} empty="No specifications recorded" /></div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => assign(asset, 'assign')} isLoading={busyId === asset._id} disabled={!!busyId}>Assign</Button>
                    <Button size="sm" variant="outline" onClick={() => assign(asset, 'propose')} disabled={!!busyId}>Reserve for approval</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </CardContent>
    </Card>
  );
};
