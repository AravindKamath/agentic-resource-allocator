import React, { useState } from 'react';
import type { Catalog, Specs } from '../../types';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

interface Props {
  catalog: Catalog;
  category: string;
  value: Specs;
  onChange: (specs: Specs) => void;
  idPrefix?: string;
}

/**
 * Optional specification inputs driven by the catalog. Fields relevant to the
 * chosen category are shown first; the rest are available behind a toggle.
 * Empty inputs are omitted from the result.
 */
export const SpecFieldsEditor: React.FC<Props> = ({ catalog, category, value, onChange, idPrefix = 'spec' }) => {
  const [showAll, setShowAll] = useState(false);
  const relevant = catalog.categories.find(c => c.key === category)?.specFields ?? [];
  const others = Object.keys(catalog.specFields).filter(k => !relevant.includes(k));
  const filledOthers = others.filter(k => value[k] !== undefined);
  const visible = showAll ? [...relevant, ...others] : [...relevant, ...filledOthers];

  const setField = (key: string, raw: string) => {
    const def = catalog.specFields[key];
    const next = { ...value };
    if (raw === '') delete next[key];
    else next[key] = def.type === 'number' ? Number(raw) : raw;
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {visible.length === 0 && (
        <p className="text-sm text-gray-500">No standard specifications for this category — describe your needs in the description.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visible.map(key => {
          const def = catalog.specFields[key];
          const id = `${idPrefix}-${key}`;
          const label = def.unit ? `${def.label} (${def.unit})` : def.label;
          const current = value[key] === undefined ? '' : String(value[key]);
          if (def.type === 'enum') {
            return (
              <Select
                key={key}
                id={id}
                label={label}
                value={current}
                onChange={e => setField(key, e.target.value)}
                options={[{ value: '', label: 'No preference' }, ...(def.options ?? []).map(o => ({ value: o, label: o.toUpperCase() === o ? o : o.charAt(0).toUpperCase() + o.slice(1) }))]}
              />
            );
          }
          return (
            <div key={key}>
              <Input
                id={id}
                label={label}
                type={def.type === 'number' ? 'number' : 'text'}
                min={def.min}
                max={def.max}
                step={def.integer ? 1 : 'any'}
                maxLength={def.maxLength}
                value={current}
                placeholder="Optional"
                onChange={e => setField(key, e.target.value)}
              />
              {def.hint && <p className="mt-1 text-xs text-gray-500">{def.hint}</p>}
            </div>
          );
        })}
      </div>
      {others.length > 0 && (
        <button type="button" className="text-sm text-blue-600 hover:text-blue-800" onClick={() => setShowAll(s => !s)}>
          {showAll ? 'Show fewer fields' : 'Show more specification fields'}
        </button>
      )}
    </div>
  );
};
