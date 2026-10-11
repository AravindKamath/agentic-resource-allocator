import React from 'react';
import type { Catalog, Specs } from '../../types';
import { formatSpecValue } from './useCatalog';

export const SpecList: React.FC<{ catalog: Catalog | null; specs?: Specs; empty?: string }> = ({ catalog, specs, empty = 'None specified' }) => {
  const entries = Object.entries(specs || {});
  if (!entries.length) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="flex justify-between gap-4 border-b border-gray-100 py-1">
          <dt className="text-gray-500">{catalog?.specFields[key]?.label ?? key}</dt>
          <dd className="font-medium text-gray-900 text-right">{formatSpecValue(catalog, key, value)}</dd>
        </div>
      ))}
    </dl>
  );
};
