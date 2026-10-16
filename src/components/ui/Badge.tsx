import React from 'react';
import { cn } from '@/src/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'outline';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  children,
  ...props
}) => {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap';
  const variants = {
    default: 'bg-[#1B1C1E] text-[#C7C9CC] border border-[#3A3C3F]',
    success: 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60',
    warning: 'bg-amber-950/80 text-amber-400 border border-amber-800/60',
    outline: 'bg-[#141516] text-[#92969C] border border-[#292B2D]',
  };

  return (
    <span className={cn(base, variants[variant], className)} {...props}>
      {children}
    </span>
  );
};
