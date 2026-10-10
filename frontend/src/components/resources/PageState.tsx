import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { Button } from '../ui/Button';

export const LoadingCard: React.FC<{ lines?: number }> = ({ lines = 5 }) => (
  <Card>
    <CardContent className="p-6">
      <LoadingSkeleton lines={lines} />
    </CardContent>
  </Card>
);

export const ErrorCard: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <Card>
    <CardContent className="p-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-red-700">
        <AlertCircle className="h-5 w-5" />
        <span>{message}</span>
      </div>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
    </CardContent>
  </Card>
);

export const EmptyState: React.FC<{ message: string; children?: React.ReactNode }> = ({ message, children }) => (
  <div className="text-center py-12">
    <p className="text-gray-500">{message}</p>
    {children && <div className="mt-4">{children}</div>}
  </div>
);

export const Pager: React.FC<{ page: number; limit: number; total: number; onPage: (p: number) => void }> = ({ page, limit, total, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-4 text-sm text-gray-600">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span>Page {page} of {pages}</span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
};
