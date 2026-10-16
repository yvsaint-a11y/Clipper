import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motionTokens } from '@/src/lib/designTokens';

export interface FeedbackBannerProps {
  type?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export const FeedbackBanner: React.FC<FeedbackBannerProps> = ({
  type = 'info',
  title,
  message,
  onDismiss,
  className,
}) => {
  const configs = {
    success: {
      border: 'border-emerald-500/40',
      bg: 'bg-emerald-950/30',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
      glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
      textColor: 'text-emerald-200',
    },
    error: {
      border: 'border-red-500/40',
      bg: 'bg-red-950/30',
      icon: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
      glow: 'shadow-[0_0_20px_rgba(239,68,68,0.15)]',
      textColor: 'text-red-200',
    },
    warning: {
      border: 'border-amber-500/40',
      bg: 'bg-amber-950/30',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
      textColor: 'text-amber-200',
    },
    info: {
      border: 'border-[#686B70]/40',
      bg: 'bg-[#171819]',
      icon: <Info className="w-4 h-4 text-[#C7C9CC] shrink-0" />,
      glow: 'shadow-[0_0_20px_rgba(199,201,204,0.12)]',
      textColor: 'text-[#F2F2F0]',
    },
  };

  const current = configs[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: motionTokens.duration.component, ease: motionTokens.ease.expressiveOut }}
      className={cn(
        'flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-md',
        current.bg,
        current.border,
        current.glow,
        className
      )}
    >
      <div className="pt-0.5">{current.icon}</div>
      <div className="flex-1 min-w-0">
        {title && <h5 className={cn('text-xs font-semibold tracking-wide mb-0.5', current.textColor)}>{title}</h5>}
        <p className="text-xs text-zinc-300 leading-relaxed">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-zinc-500 hover:text-zinc-300 p-0.5 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.div>
  );
};

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: motionTokens.duration.component }}
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-dashed border-[#292B2D] bg-[#141516]/40 backdrop-blur-xs',
        className
      )}
    >
      <div className="w-12 h-12 rounded-xl bg-[#1B1C1E] border border-[#3A3C3F] flex items-center justify-center text-[#92969C] mb-4 shadow-sm">
        {icon}
      </div>
      <h4 className="text-sm font-semibold text-[#F2F2F0] mb-1.5">{title}</h4>
      <p className="text-xs text-[#92969C] max-w-sm mb-5 leading-relaxed">{description}</p>
      {action && <div>{action}</div>}
    </motion.div>
  );
};
