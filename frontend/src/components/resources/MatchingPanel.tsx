import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, HelpCircle, Info, RefreshCw, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ErrorCard } from './PageState';
import { AssetStatusBadge } from './StatusBadge';
import { categoryLabel, formatSpecValue } from './useCatalog';
import { errorMessage, resourceApi } from '../../lib/resourceApi';
import type { Catalog, MatchCandidate, MatchComparison, MatchResult, ResourceRequestDetail } from '../../types';

interface Props {
  catalog: Catalog | null;
  request: ResourceRequestDetail;
  onAssigned: (updated: ResourceRequestDetail) => void;
}

const RESULT_STYLE: Record<MatchComparison['result'], { icon: React.ReactNode; text: string; className: string }> = {
  meets: { icon: <Check className="h-4 w-4" />, text: 'Meets', className: 'text-green-700' },
  exceeds: { icon: <Check className="h-4 w-4" />, text: 'Exceeds', className: 'text-green-700' },
  fails: { icon: <X className="h-4 w-4" />, text: 'Fails', className: 'text-red-700' },
  missing: { icon: <HelpCircle className="h-4 w-4" />, text: 'Unverified', className: 'text-yellow-700' },
};

function displayValue(catalog: Catalog | null, c: MatchComparison, value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (c.field === 'category') return categoryLabel(catalog, String(value));
  if (c.field === 'gpu') return value ? 'Yes' : 'No';
  if (c.field === 'storageType') return String(value).toUpperCase();
  return formatSpecValue(catalog, c.field, value);
}

const ComparisonTable: React.FC<{ catalog: Catalog | null; comparisons: MatchComparison[] }> = ({ catalog, comparisons }) => (
  <table className="w-full text-xs mt-2">
    <thead>
      <tr className="text-left text-gray-500">
        <th className="py-1 pr-2 font-medium">Requirement</th>
        <th className="py-1 pr-2 font-medium">Requested</th>
        <th className="py-1 pr-2 font-medium">This asset</th>
        <th className="py-1 font-medium">Result</th>
      </tr>
    </thead>
    <tbody>
      {comparisons.map(c => {
        const style = RESULT_STYLE[c.result];
        return (
          <tr key={c.field} className="border-t border-gray-100" title={c.message}>
            <td className="py-1 pr-2 text-gray-700">{c.label}</td>
            <td className="py-1 pr-2 text-gray-700">{displayValue(catalog, c, c.required)}</td>
            <td className="py-1 pr-2 text-gray-900 font-medium">{displayValue(catalog, c, c.actual)}</td>
            <td className={`py-1 ${style.className}`}><span className="inline-flex items-center gap-1">{style.icon}{style.text}</span></td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

const AssetHeading: React.FC<{ catalog: Catalog | null; c: MatchCandidate; link?: boolean }> = ({ catalog, c, link }) => (
  <div className="min-w-0">
    <p className="font-medium text-gray-900">
      {link
        ? <Link to={`/admin/inventory/${c.asset._id}`} className="text-blue-600 hover:text-blue-800">{c.asset.assetTag}</Link>
        : c.asset.assetTag}
      {' · '}{c.asset.name}
    </p>
    <p className="text-xs text-gray-500">
      {[categoryLabel(catalog, c.asset.category), [c.asset.manufacturer, c.asset.model].filter(Boolean).join(' '), c.asset.location, c.asset.operatingSystem]
        .filter(Boolean).join(' · ')}
    </p>
  </div>
);

const ReasonList: React.FC<{ items: string[]; className: string }> = ({ items, className }) =>
  items.length ? <ul className={`list-disc ml-5 text-xs space-y-0.5 ${className}`}>{items.map(i => <li key={i}>{i}</li>)}</ul> : null;

/**
 * Ranked, explained candidates from GET /requests/:id/matches. Advisory only:
 * Assign/Reserve call the existing allocation endpoint, which re-checks
 * compatibility and availability in its transaction.
 */
export const MatchingPanel: React.FC<Props> = ({ catalog, request, onAssigned }) => {
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await resourceApi.matches(request._id));
    } catch (e) {
      setError(errorMessage(e, 'Failed to load matching assets'));
    } finally {
      setLoading(false);
    }
  }, [request._id]);

  // Refetch whenever the request changes (status, allocation counts, edits).
  useEffect(() => { load(); }, [load, request.updatedAt, request.status, request.allocation.active, request.allocation.proposed]);

  const assign = async (c: MatchCandidate, mode: 'assign' | 'propose') => {
    setBusyId(c.asset._id);
    try {
      const updated = await resourceApi.assign(request._id, c.asset._id, mode);
      toast.success(mode === 'assign' ? `${c.asset.assetTag} assigned` : `${c.asset.assetTag} reserved pending approval`);
      onAssigned(updated);
    } catch (e) {
      // The server re-validated and refused (e.g. inventory changed); show why and refresh.
      toast.error(errorMessage(e, 'Assignment failed'));
      load();
    } finally {
      setBusyId(null);
    }
  };

  const header = (
    <CardHeader>
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>{result?.request.allocatable ? 'Assign resources' : 'Inventory check'}</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            {result?.request.allocatable
              ? `${result.request.remaining} of ${result.request.quantity} still to allocate. `
              : ''}
            Candidates are ranked by fixed rules; the assignment is re-checked against live inventory when you assign.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Refresh matches">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </CardHeader>
  );

  if (error) {
    return <Card>{header}<CardContent><ErrorCard message={error} onRetry={load} /></CardContent></Card>;
  }
  if (!result) {
    return <Card>{header}<CardContent><p className="text-sm text-gray-500">Finding matching assets…</p></CardContent></Card>;
  }

  const { candidates } = result;
  const canAct = result.request.allocatable;

  return (
    <Card>
      {header}
      <CardContent className="space-y-5">
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Requirements checked</h3>
          <div className="flex flex-wrap gap-2">
            {result.requirements.map(r => (
              <Badge key={r.field} variant={r.kind === 'preference' ? 'default' : 'secondary'}>
                {r.label}: {r.field === 'category' ? categoryLabel(catalog, String(r.value)) : r.display}
                {r.kind === 'preference' && ' (preference)'}
              </Badge>
            ))}
          </div>
        </div>

        {result.warnings.length > 0 && (
          <ul className="space-y-2">
            {result.warnings.map(w => (
              <li key={w.code} className={`flex gap-2 rounded-lg p-3 text-sm ${w.severity === 'warning' ? 'bg-yellow-50 text-yellow-900' : 'bg-gray-50 text-gray-700'}`}>
                {w.severity === 'warning' ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> : <Info className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        )}

        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Compatible and available ({candidates.eligible.length})</h3>
          {candidates.eligible.length === 0 ? (
            <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-700">{result.explanation}</div>
          ) : (
            <ol className="space-y-3">
              {candidates.eligible.map((c, i) => (
                <li key={c.asset._id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex gap-3 min-w-0">
                      <span className="text-sm font-semibold text-gray-400 w-6">#{i + 1}</span>
                      <AssetHeading catalog={catalog} c={c} link />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-500" title="Ranking points: relative order only, not a probability">{c.score} pts</span>
                      {canAct && (
                        <>
                          <Button size="sm" onClick={() => assign(c, 'assign')} isLoading={busyId === c.asset._id} disabled={!!busyId}>Assign</Button>
                          <Button size="sm" variant="outline" onClick={() => assign(c, 'propose')} disabled={!!busyId}>Reserve for approval</Button>
                        </>
                      )}
                    </div>
                  </div>
                  <ComparisonTable catalog={catalog} comparisons={c.comparisons} />
                  {c.scoreBreakdown.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-gray-600">Why this rank</p>
                      <ReasonList items={c.scoreBreakdown.map(b => `+${b.points}: ${b.message}`)} className="text-gray-600" />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {candidates.needsVerification.length > 0 && (
          <details className="rounded-lg border border-yellow-200 p-3" open={candidates.eligible.length === 0}>
            <summary className="cursor-pointer text-sm font-medium text-yellow-900">
              Needs verification ({candidates.needsVerification.length}) — available, but missing data prevents a reliable match
            </summary>
            <ul className="mt-3 space-y-3">
              {candidates.needsVerification.map(c => (
                <li key={c.asset._id}>
                  <AssetHeading catalog={catalog} c={c} link />
                  <ReasonList items={c.unverified} className="text-yellow-800 mt-1" />
                  <Link to={`/admin/inventory/${c.asset._id}`} className="text-xs text-blue-600 hover:text-blue-800">Complete this asset record</Link>
                </li>
              ))}
            </ul>
          </details>
        )}

        {candidates.unavailable.length > 0 && (
          <details className="rounded-lg border border-gray-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">
              Not currently available ({candidates.unavailable.length}{result.summary.unavailableCompatible ? `, ${result.summary.unavailableCompatible} would be compatible` : ''})
            </summary>
            <ul className="mt-3 space-y-2">
              {candidates.unavailable.map(c => (
                <li key={c.asset._id} className="flex items-center justify-between gap-3">
                  <AssetHeading catalog={catalog} c={c} link />
                  <div className="flex items-center gap-2 shrink-0 text-xs text-gray-500">
                    {c.eligibility === 'compatible' ? 'compatible' : 'needs verification'}
                    <AssetStatusBadge status={c.availability.status} />
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}

        {candidates.incompatible.length > 0 && (
          <details className="rounded-lg border border-gray-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">
              Incompatible ({candidates.incompatible.length}) — fail at least one requirement, cannot be assigned
            </summary>
            <ul className="mt-3 space-y-3">
              {candidates.incompatible.map(c => (
                <li key={c.asset._id}>
                  <AssetHeading catalog={catalog} c={c} link />
                  <ReasonList items={c.failures} className="text-red-700 mt-1" />
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="text-xs text-gray-500">
          {result.summary.evaluated} asset(s) in this category evaluated · rules {result.method.version}
          {result.summary.otherCategoryAvailable > 0 && ` · ${result.summary.otherCategoryAvailable} available asset(s) in other categories not considered`}
        </p>
      </CardContent>
    </Card>
  );
};
