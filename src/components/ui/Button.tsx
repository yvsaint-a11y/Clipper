import React from 'react';
import { cn } from '@/src/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080909] disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none';

    const variants = {
      default: 'bg-[#1B1C1E] border border-[#686B70] text-[#F2F2F0] hover:bg-[#252628] hover:border-[#C7C9CC] focus-visible:ring-[#C7C9CC]',
      secondary: 'bg-[#141516] border border-[#292B2D] text-[#C7C9CC] hover:bg-[#202123] hover:text-[#F2F2F0] focus-visible:ring-[#686B70]',
      outline: 'border border-[rgba(199,201,204,0.20)] bg-transparent text-[#C7C9CC] hover:bg-white/[0.06] hover:text-[#FFFFFF] hover:border-[#92969C] focus-visible:ring-[#686B70]',
      ghost: 'bg-transparent text-[#777A7E] hover:bg-white/[0.04] hover:text-[#F2F2F0] focus-visible:ring-[#686B70]',
      destructive: 'bg-[#1B1112] border border-[#7F1D1D] text-[#FCA5A5] hover:bg-[#7F1D1D] hover:text-white focus-visible:ring-red-500',
    };

    const sizes = {
      sm: 'text-xs px-2.5 py-1.5 h-8 gap-1.5',
      md: 'text-sm px-4 py-2 h-9 gap-2',
      lg: 'text-base px-5 py-2.5 h-11 gap-2.5',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
