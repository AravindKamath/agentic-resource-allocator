import React from 'react';
import { cn } from '../lib/utils';

interface BrandMarkProps {
  collapsed?: boolean;
  monochrome?: boolean;
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ collapsed = false, className }) => (
  <div className={cn('flex items-center gap-3', className)}>
    <img src="/logo.svg" alt="" aria-hidden="true" className="h-9 w-9 shrink-0" />
    {!collapsed && (
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold tracking-tight text-[var(--text)]">IT Resource Desk</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Operations</span>
      </span>
    )}
  </div>
);
