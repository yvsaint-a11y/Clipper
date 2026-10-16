import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion, useSpring } from 'motion/react';
import { cn } from '@/src/lib/utils';

export interface ParallaxContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  depth?: number; // Intensity factor, default 15
  disabled?: boolean;
}

export const ParallaxContainer: React.FC<ParallaxContainerProps> = ({
  depth = 12,
  disabled = false,
  className,
  children,
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const springConfig = { stiffness: 150, damping: 20 };
  const rotateX = useSpring(0, springConfig);
  const rotateY = useSpring(0, springConfig);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || prefersReducedMotion || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const mouseX = e.clientX - centerX;
      const mouseY = e.clientY - centerY;

      const normX = mouseX / (rect.width / 2);
      const normY = mouseY / (rect.height / 2);

      rotateY.set(normX * (depth * 0.5));
      rotateX.set(-normY * (depth * 0.5));
    },
    [depth, disabled, prefersReducedMotion, rotateX, rotateY]
  );

  const handleMouseLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
  }, [rotateX, rotateY]);

  return (
    <div
      ref={containerRef}
      style={{ perspective: 1000 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn('relative', className)}
      {...props}
    >
      <motion.div
        style={{
          rotateX: prefersReducedMotion || disabled ? 0 : rotateX,
          rotateY: prefersReducedMotion || disabled ? 0 : rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="w-full h-full"
      >
        {children}
      </motion.div>
    </div>
  );
};
