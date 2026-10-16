import React from 'react';
import { motion, HTMLMotionProps } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { motionTokens } from '@/src/lib/designTokens';

export interface MotionButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'silver' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'glass';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const MotionButton = React.forwardRef<HTMLButtonElement, MotionButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const base = 'relative inline-flex items-center justify-center font-medium rounded-lg select-none cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C7C9CC] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080909] disabled:opacity-50 disabled:pointer-events-none overflow-hidden';

    const variants = {
      primary: 'bg-[#1B1C1E] hover:bg-[#252628] text-[#F2F2F0] border border-[#686B70] hover:border-[#C7C9CC] shadow-[0_2px_8px_rgba(0,0,0,0.6)] focus-visible:ring-[#C7C9CC]',
      silver: 'bg-gradient-to-br from-white via-[#E5E7EB] to-[#C7C9CC] hover:from-[#F2F2F0] hover:to-white text-[#0B0C0D] font-semibold border border-white shadow-[0_1px_12px_rgba(255,255,255,0.18)] focus-visible:ring-white',
      secondary: 'bg-[#141516] hover:bg-[#1B1C1E] active:bg-[#101112] text-[#C7C9CC] hover:text-[#F2F2F0] border border-[#292B2D] hover:border-[#3A3C3F]',
      outline: 'bg-transparent hover:bg-white/[0.05] text-[#C7C9CC] hover:text-[#FFFFFF] border border-[rgba(199,201,204,0.20)] hover:border-[#92969C]',
      ghost: 'bg-transparent hover:bg-white/[0.04] text-[#777A7E] hover:text-[#F2F2F0]',
      destructive: 'bg-[#1B1112] hover:bg-[#7F1D1D] active:bg-[#991B1B] text-[#FCA5A5] hover:text-white border border-[#7F1D1D] shadow-xs',
      glass: 'bg-[#141516]/80 hover:bg-[#1B1C1E]/95 backdrop-blur-md text-[#F2F2F0] border border-[rgba(199,201,204,0.15)] shadow-xs',
    };

    const sizes = {
      xs: 'text-xs px-2 py-1 h-7 gap-1 rounded-md',
      sm: 'text-xs px-2.5 py-1.5 h-8 gap-1.5',
      md: 'text-sm px-4 py-2 h-9 gap-2',
      lg: 'text-base px-5 py-2.5 h-11 gap-2.5',
    };

    return (
      <motion.button
        ref={ref}
        disabled={disabled || isLoading}
        whileHover={{ scale: disabled || isLoading ? 1 : 1.015 }}
        whileTap={{ scale: disabled || isLoading ? 1 : 0.97 }}
        transition={{ duration: motionTokens.duration.micro, ease: motionTokens.ease.snap }}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin -ml-0.5 h-4 w-4 text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Processing...</span>
          </span>
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            <span>{children}</span>
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </motion.button>
    );
  }
);

MotionButton.displayName = 'MotionButton';
