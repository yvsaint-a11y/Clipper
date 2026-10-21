import React from 'react';
import { cn } from '@/src/lib/utils';

export interface ClipperLogoProps {
  className?: string;
  variant?: 'full' | 'mark' | 'compact';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showDescriptor?: boolean;
}

export const ClipperLogo: React.FC<ClipperLogoProps> = ({
  className,
  variant = 'full',
  size = 'md',
  showDescriptor = false,
}) => {
  const markSizes = {
    sm: 'w-6 h-6',
    md: 'w-7 h-7 sm:w-8 sm:h-8',
    lg: 'w-10 h-10',
    xl: 'w-14 h-14 sm:w-16 sm:h-16',
  };

  const textSizes = {
    sm: 'text-sm tracking-tight',
    md: 'text-base sm:text-lg tracking-tight',
    lg: 'text-xl sm:text-2xl tracking-tight',
    xl: 'text-3xl sm:text-4xl tracking-wider',
  };

  const svgSizes = {
    sm: 'w-4 h-4 sm:w-5 sm:h-5',
    md: 'w-4 h-4 sm:w-5 sm:h-5',
    lg: 'w-6 h-6 sm:w-7 sm:h-7',
    xl: 'w-8 h-8 sm:w-9 sm:h-9',
  };

  return (
    <div className={cn('inline-flex items-center gap-2.5 sm:gap-3 select-none', className)}>
      {/* Precision Metallic "C" Aperture Mark */}
      <div
        className={cn(
          'relative flex items-center justify-center shrink-0 rounded-lg sm:rounded-xl bg-[#141516] border border-[#3A3C3F] shadow-[0_2px_8px_rgba(0,0,0,0.6)] group-hover:border-[#686B70] transition-colors',
          markSizes[size]
        )}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={svgSizes[size]}
        >
          <defs>
            <linearGradient id="clipper-metallic-sheen" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="45%" stopColor="#C7C9CC" />
              <stop offset="75%" stopColor="#92969C" />
              <stop offset="100%" stopColor="#686B70" />
            </linearGradient>
            <linearGradient id="clipper-cut-accent" x1="16" y1="8" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#3A3C3F" />
            </linearGradient>
          </defs>

          {/* Precision Faceted Cut "C" Arch */}
          <path
            d="M23 10.5C21.2 8.5 18.5 7.2 15.5 7.2C10.2 7.2 6 11.2 6 16C6 20.8 10.2 24.8 15.5 24.8C18.5 24.8 21.2 23.5 23 21.5L19.2 18.5C18.2 19.8 16.9 20.6 15.5 20.6C12.7 20.6 10.5 18.5 10.5 16C10.5 13.5 12.7 11.4 15.5 11.4C16.9 11.4 18.2 12.2 19.2 13.5L23 10.5Z"
            fill="url(#clipper-metallic-sheen)"
          />
          {/* Subtle Razor Clip Notch */}
          <rect
            x="20.5"
            y="14.5"
            width="5"
            height="3"
            rx="1"
            transform="rotate(-25 20.5 14.5)"
            fill="url(#clipper-cut-accent)"
            opacity="0.9"
          />
        </svg>
      </div>

      {/* Typography Lockup */}
      {variant !== 'mark' && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'font-extrabold text-[#F2F2F0] uppercase font-sans tracking-wider',
                textSizes[size]
              )}
            >
              Clipper
            </span>
          </div>
          {showDescriptor && (
            <span className="text-[10px] tracking-wide text-[#777A7E] font-medium uppercase">
              Cinematic Video Studio
            </span>
          )}
        </div>
      )}

      {/* Accessible Screen Reader Label */}
      <span className="sr-only">Clipper — AI-powered cinematic video editor</span>
    </div>
  );
};
