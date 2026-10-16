import React from 'react';
import type { Catalog, HistoryEntry } from '../../types';
import { formatDate, requestStatusLabel } from './useCatalog';

const TITLES: Record<HistoryEntry['type'], string> = {
  created: 'Request submitted',
  status_change: 'Status changed',
  updated: 'Request edited',
  clarification_response: 'Requester responded to clarification',
  assignment: 'Allocation updated',
};

export const HistoryTimeline: React.FC<{ catalog: Catalog | null; history: HistoryEntry[] }> = ({ catalog, history }) => (
  <ol className="relative ml-2 space-y-5 border-l border-gray-200">
    {[...history].reverse().map(entry => (
      <li key={entry._id} className="ml-4">
        <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-indigo-500 dark:border-slate-900" />
        <p className="text-sm font-medium text-gray-900">
          {TITLES[entry.type]}
          {entry.from && entry.to && entry.from !== entry.to && (
            <span className="font-normal text-gray-600">
              {' '}— {requestStatusLabel(catalog, entry.from)} → {requestStatusLabel(catalog, entry.to)}
            </span>
          )}
        </p>
        {entry.message && <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{entry.message}</p>}
        <p className="text-xs text-gray-500 mt-1">
          {formatDate(entry.at)} · {entry.actor?.name ?? (entry.actorRole === 'system' ? 'System' : 'Unknown')}
          {entry.actorRole !== 'system' && ` (${entry.actorRole})`}
        </p>
      </li>
    ))}
  </ol>
);
