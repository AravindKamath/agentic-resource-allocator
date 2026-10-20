import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'secondary';
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default: 'bg-[var(--surface-muted)] text-[var(--text-muted)]',
      success: 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300',
      warning: 'bg-amber-100/80 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
      danger: 'bg-red-100/80 text-red-800 dark:bg-red-400/15 dark:text-red-300',
      secondary: 'bg-indigo-100/80 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-300',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };