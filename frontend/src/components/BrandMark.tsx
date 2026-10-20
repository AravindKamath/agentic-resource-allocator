import React from 'react';
import { cn } from '../lib/utils';

interface BrandMarkProps {
  collapsed?: boolean;
  monochrome?: boolean;
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ collapsed = false, monochrome = false, className }) => (
  <div className={cn('flex items-center gap-3', className)}>
    <svg aria-hidden="true" className="h-9 w-9 shrink-0" viewBox="0 0 40 40" fill="none">
      <path d="M20 3 35 11.5v17L20 37 5 28.5v-17L20 3Z" className={monochrome ? 'fill-current' : 'fill-[var(--primary)]'} />
      <path d="m20 10 9 5v10l-9 5-9-5V15l9-5Z" className={monochrome ? 'fill-[var(--surface)]' : 'fill-[var(--surface)]'} />
      <path d="m20 15 4 2.25v5.5L20 25l-4-2.25v-5.5L20 15Z" className={monochrome ? 'fill-current' : 'fill-[var(--accent)]'} />
    </svg>
    {!collapsed && (
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold tracking-tight text-[var(--text)]">IT Resource Desk</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Operations</span>
      </span>
    )}
  </div>
);
