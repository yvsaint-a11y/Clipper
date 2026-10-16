import React from 'react';
import { motion, HTMLMotionProps } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { motionTokens } from '@/src/lib/designTokens';

export interface SurfaceProps extends HTMLMotionProps<'div'> {
  level?: 0 | 1 | 2 | 3 | 4 | 5;
  variant?: 'base' | 'raised' | 'overlay' | 'sunken' | 'glass';
  glow?: 'none' | 'silver' | 'indigo' | 'emerald' | 'amber' | 'crimson';
  interactive?: boolean;
}

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  (
    {
      level = 1,
      variant = 'base',
      glow = 'none',
      interactive = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const levelClasses = {
      0: 'bg-transparent border-transparent shadow-none',
      1: 'bg-[#141516] border border-[#292B2D] shadow-[0_1px_3px_rgba(0,0,0,0.6)]',
      2: 'bg-[#171819] border border-[#292B2D] shadow-[0_4px_14px_rgba(0,0,0,0.7)]',
      3: 'bg-[#1B1C1E] border border-[#3A3C3F] shadow-[0_12px_28px_rgba(0,0,0,0.8)]',
      4: 'bg-[#202123] border border-[#3A3C3F] shadow-[0_20px_40px_rgba(0,0,0,0.9)]',
      5: 'bg-[#252628] border border-[#686B70] shadow-[0_28px_64px_rgba(0,0,0,0.95)]',
    };

    const variantClasses = {
      base: 'bg-[#141516]',
      raised: 'bg-[#171819]',
      overlay: 'bg-[#1B1C1E]',
      sunken: 'bg-[#080909] border border-[#292B2D]',
      glass: 'bg-[#141516]/85 backdrop-blur-md border border-[rgba(199,201,204,0.12)]',
    };

    const glowClasses = {
      none: '',
      silver: 'shadow-[0_0_20px_rgba(199,201,204,0.18)] border-[#92969C]',
      indigo: 'shadow-[0_0_20px_rgba(199,201,204,0.18)] border-[#92969C]', // mapped to silver
      emerald: 'shadow-[0_0_20px_rgba(16,185,129,0.18)] border-emerald-500/50',
      amber: 'shadow-[0_0_20px_rgba(245,158,11,0.18)] border-amber-500/50',
      crimson: 'shadow-[0_0_20px_rgba(239,68,68,0.18)] border-red-500/50',
    };

    return (
      <motion.div
        ref={ref}
        whileHover={interactive ? { y: -2, transition: { duration: motionTokens.duration.micro } } : undefined}
        whileTap={interactive ? { scale: 0.99, transition: { duration: motionTokens.duration.micro } } : undefined}
        className={cn(
          'rounded-xl transition-colors duration-200',
          levelClasses[level],
          variant !== 'base' && variantClasses[variant],
          glowClasses[glow],
          interactive && 'cursor-pointer hover:border-zinc-600/80',
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

Surface.displayName = 'Surface';
