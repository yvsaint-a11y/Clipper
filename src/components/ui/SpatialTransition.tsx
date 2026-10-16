import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { motionTokens } from '@/src/lib/designTokens';
import { cn } from '@/src/lib/utils';

export interface SpatialTransitionProps {
  layoutId?: string;
  isOpen: boolean;
  onClose?: () => void;
  triggerContent: React.ReactNode;
  expandedContent: React.ReactNode;
  className?: string;
}

export const SpatialTransition: React.FC<SpatialTransitionProps> = ({
  layoutId = 'spatial-surface',
  isOpen,
  onClose,
  triggerContent,
  expandedContent,
  className,
}) => {
  return (
    <div className={cn('relative', className)}>
      {/* Collapsed state */}
      {!isOpen && (
        <motion.div
          layoutId={layoutId}
          transition={{ duration: motionTokens.duration.component, ease: motionTokens.ease.spatial }}
          className="w-full"
        >
          {triggerContent}
        </motion.div>
      )}

      {/* Expanded modal / surface state */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-[#090a0f]/80 backdrop-blur-md"
            />

            {/* Expanding Surface */}
            <motion.div
              layoutId={layoutId}
              transition={{ duration: motionTokens.duration.spatial, ease: motionTokens.ease.spatial }}
              className="relative z-10 w-full max-w-2xl bg-[#141722] border border-[#2e374f] rounded-2xl p-6 shadow-[0_24px_64px_rgba(0,0,0,0.9)] overflow-hidden"
            >
              {expandedContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
