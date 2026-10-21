import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ClipperLogo } from '@/src/components/ClipperLogo';

export interface CinematicBrandRevealProps {
  /** Called when the introduction animation completes or is explicitly dismissed */
  onComplete: () => void;
  /** Total visible duration in milliseconds before exit transition begins (default: 4800ms) */
  visibleHoldMs?: number;
  /** Exit transition duration in milliseconds (default: 800ms) */
  exitDurationMs?: number;
}

export const CinematicBrandReveal: React.FC<CinematicBrandRevealProps> = ({
  onComplete,
  visibleHoldMs = 4800,
  exitDurationMs = 800,
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Guard against duplicate callbacks
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Timers references for reliable cleanup
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect user preference for reduced motion
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);

      const listener = (e: MediaQueryListEvent) => {
        setPrefersReducedMotion(e.matches);
      };

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
      }
    }
  }, []);

  const triggerExit = useCallback(
    (isImmediateSkip = false) => {
      if (completedRef.current) return;
      completedRef.current = true;

      // Clear any pending automatic timer
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }

      setIsExiting(true);

      const delay = isImmediateSkip ? 150 : exitDurationMs;
      exitTimerRef.current = setTimeout(() => {
        onCompleteRef.current();
      }, delay);
    },
    [exitDurationMs]
  );

  // Mount entrance trigger
  useEffect(() => {
    mountTimerRef.current = setTimeout(() => {
      setIsMounted(true);
    }, 60);

    return () => {
      if (mountTimerRef.current) {
        clearTimeout(mountTimerRef.current);
      }
    };
  }, []);

  // Automatic progression after full visible entrance + hold (~5.6 seconds total)
  // Preserves visible hold even when prefers-reduced-motion is true
  useEffect(() => {
    // Total hold time before initiating exit (at least 4.5s to ensure >3s visible hold)
    const holdDuration = Math.max(3500, visibleHoldMs);

    autoTimerRef.current = setTimeout(() => {
      triggerExit(false);
    }, holdDuration);

    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [visibleHoldMs, triggerExit]);

  // Keyboard shortcut listener for instant skip (Escape, Space, Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent repeated keydown events from holding the key
      if (e.repeat) return;

      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        triggerExit(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [triggerExit]);

  const entranceDurationClass = prefersReducedMotion
    ? 'duration-300'
    : 'duration-[1200ms]';

  const exitDurationClass = prefersReducedMotion
    ? 'duration-200'
    : 'duration-[800ms]';

  return (
    <div
      role="region"
      aria-label="Clipper Brand Introduction"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#080909] select-none transition-opacity ease-out ${exitDurationClass} ${
        isExiting ? 'opacity-0 pointer-events-none' : isMounted ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Subtle Cinematic Ambient Lighting (Restrained Graphite Sheen) */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] sm:w-[800px] sm:h-[400px] bg-gradient-to-b from-white/[0.04] via-[#C7C9CC]/[0.015] to-transparent rounded-full blur-[120px] pointer-events-none"
        aria-hidden="true"
      />

      {/* Skip Button for immediate user control */}
      <div className="absolute top-6 right-6 sm:top-8 sm:right-8 z-10">
        <button
          type="button"
          onClick={() => triggerExit(true)}
          className="group px-3 py-1.5 rounded-lg bg-[#141516]/80 hover:bg-[#1B1C1E] border border-[#292B2D] hover:border-[#686B70] text-[#92969C] hover:text-[#F2F2F0] text-xs font-medium tracking-wide transition-all cursor-pointer backdrop-blur-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C7C9CC]"
          aria-label="Skip Brand Introduction"
        >
          <span>Skip</span>
          <span className="hidden sm:inline-block ml-1.5 text-[10px] text-[#777A7E] group-hover:text-[#92969C]">
            [Esc]
          </span>
        </button>
      </div>

      {/* Centered Brand Presentation */}
      <div
        className={`relative z-1 flex flex-col items-center text-center px-4 transition-all ease-out ${entranceDurationClass} ${
          prefersReducedMotion
            ? isMounted && !isExiting
              ? 'opacity-100'
              : 'opacity-0'
            : isMounted && !isExiting
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-2 scale-[0.98]'
        }`}
      >
        {/* Prominent Clipper Brand Logo (strictly preserving proportions) */}
        <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-b from-white/[0.02] to-transparent border border-white/[0.05] shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-xs">
          <ClipperLogo size="xl" showDescriptor={false} />
        </div>

        {/* Minimalist Cinematic Descriptor */}
        <div className="mt-6 space-y-1.5">
          <p className="text-xs sm:text-sm font-medium tracking-[0.25em] text-[#92969C] uppercase">
            Cinematic Video Studio
          </p>
          <p className="text-[11px] sm:text-xs text-[#777A7E] tracking-wider font-mono">
            Precision Editing · Reusable Templates
          </p>
        </div>
      </div>

      {/* Discrete subtle indicator bar at bottom */}
      {!prefersReducedMotion && (
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 w-32 h-0.5 bg-[#1B1C1E] rounded-full overflow-hidden"
          aria-hidden="true"
        >
          <div
            className={`h-full bg-[#C7C9CC]/40 rounded-full transition-all ease-linear ${
              isMounted && !isExiting ? 'w-full' : 'w-0'
            }`}
            style={{ transitionDuration: `${visibleHoldMs}ms` }}
          />
        </div>
      )}
    </div>
  );
};
