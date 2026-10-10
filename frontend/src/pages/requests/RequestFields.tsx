import React from 'react';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { SpecFieldsEditor } from '../../components/resources/SpecFieldsEditor';
import type { Catalog } from '../../types';
import type { RequestFormErrors, RequestFormValues } from './requestForm';


interface Props {
  catalog: Catalog;
  values: RequestFormValues;
  errors: RequestFormErrors;
  onChange: (v: RequestFormValues) => void;
  showDepartment?: boolean;
}

export const RequestFields: React.FC<Props> = ({ catalog, values, errors, onChange, showDepartment }) => {
  const set = <K extends keyof RequestFormValues>(key: K, value: RequestFormValues[K]) => onChange({ ...values, [key]: value });
  const category = catalog.categories.find(c => c.key === values.category);

  return (
    <div className="space-y-5">
      <Input id="title" label="Title" placeholder="e.g. Laptop for new research assistant" value={values.title}
        onChange={e => set('title', e.target.value)} error={errors.title} maxLength={200} />

      <div>
        <Select id="category" label="What kind of resource do you need?" value={values.category}
          onChange={e => set('category', e.target.value)} error={errors.category}
          options={[{ value: '', label: 'Select a category' }, ...catalog.categories.map(c => ({ value: c.key, label: c.label }))]} />
        {category && <p className="mt-1 text-xs text-gray-500">{category.description}</p>}
      </div>

      <Textarea id="purpose" label="Purpose / use case" rows={2} value={values.purpose} error={errors.purpose}
        placeholder="e.g. Running deep-learning experiments for my final-year project" maxLength={2000}
        onChange={e => set('purpose', e.target.value)} />

      <Textarea id="description" label="Description" rows={5} value={values.description} error={errors.description}
        hint="Describe what you need in your own words: software you will run, how long you need it, anything else IT should know."
        maxLength={5000} onChange={e => set('description', e.target.value)} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input id="quantity" label="Quantity" type="number" min={1} max={50} step={1} value={String(values.quantity)}
          error={errors.quantity} onChange={e => set('quantity', e.target.value === '' ? 0 : Number(e.target.value))} />
        <Select id="urgency" label="Urgency" value={values.urgency} onChange={e => set('urgency', e.target.value)}
          options={catalog.urgencyLevels.map(u => ({ value: u.key, label: u.label }))} />
        <Input id="neededBy" label="Needed by (optional)" type="date" value={values.neededBy ? values.neededBy.slice(0, 10) : ''}
          onChange={e => set('neededBy', e.target.value)} />
      </div>

      {showDepartment && (
        <Input id="department" label="Department (optional)" value={values.department ?? ''} maxLength={200}
          onChange={e => set('department', e.target.value)} />
      )}

      {values.category && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Specifications (all optional)</h3>
          <p className="text-xs text-gray-500">Fill in only what you know. IT staff will work out the rest from your description.</p>
          <SpecFieldsEditor catalog={catalog} category={values.category} value={values.specifications}
            onChange={specs => set('specifications', specs)} />
        </div>
      )}
    </div>
  );
};
