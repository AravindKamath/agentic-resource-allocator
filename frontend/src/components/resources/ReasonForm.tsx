import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';

interface Props {
  title: string;
  label: string;
  required: boolean;
  confirmLabel: string;
  variant?: 'primary' | 'danger';
  onSubmit: (text: string) => Promise<void>;
  onCancel: () => void;
}

/** Inline confirmation with an optional or required free-text reason/message. */
export const ReasonForm: React.FC<Props> = ({ title, label, required, confirmLabel, variant = 'primary', onSubmit, onCancel }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (required && !text.trim()) {
      setError('This field is required');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(text.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <Textarea id="reason-text" label={`${label}${required ? '' : ' (optional)'}`} rows={3} value={text}
        error={error} maxLength={2000} onChange={e => { setText(e.target.value); setError(undefined); }} autoFocus />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" variant={variant} size="sm" isLoading={busy}>{confirmLabel}</Button>
      </div>
    </form>
  );
};
