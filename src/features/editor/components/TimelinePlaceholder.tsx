import React from 'react';
import { Surface, Badge } from '@/src/components/ui';
import {
  Layers,
  Clock,
  Sliders,
  Sparkles,
  Film,
  Lock,
} from 'lucide-react';

export interface TimelinePlaceholderProps {
  durationMs: number;
  fps: number;
}

export const TimelinePlaceholder: React.FC<TimelinePlaceholderProps> = ({
  durationMs,
  fps,
}) => {
  return (
    <Surface
      level={2}
      className="h-44 sm:h-52 border-t border-[#292B2D] flex flex-col justify-between overflow-hidden select-none shrink-0 bg-[#080909]"
    >
      {/* Timeline Header Bar */}
      <div className="px-4 py-2 border-b border-[#292B2D] flex items-center justify-between text-xs text-zinc-400 bg-[#0B0C0D] shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-[#C7C9CC]" />
          <span className="font-semibold text-zinc-300">Timeline Workspace Area</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1B1C1E] text-[#C7C9CC] border border-[#3A3C3F]">
            Reserved for Phase 6B
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
          <span>Target Framerate: {fps} fps</span>
          <span>•</span>
          <span>Timeline DB State: Initialized</span>
        </div>
      </div>

      {/* Center Reserved Area Visual */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-9 h-9 rounded-xl bg-[#1B1C1E] border border-[#3A3C3F] flex items-center justify-center text-[#C7C9CC] mb-2">
          <Clock className="w-4 h-4" />
        </div>
        <h4 className="text-xs font-semibold text-zinc-300">
          Timeline Tracks & Multi-Clip Manipulation Reserved
        </h4>
        <p className="text-[11px] text-zinc-500 max-w-md mt-1 leading-relaxed">
          Phase 6A establishes real project and media loading. Phase 6B will attach timeline tracks, video trimming, split operations, and playhead synchronization.
        </p>
      </div>

      {/* Bottom Timeline Rulers Placeholder (Visual boundary) */}
      <div className="h-6 border-t border-[#292B2D] bg-[#0B0C0D] flex items-center px-4 justify-between text-[10px] font-mono text-zinc-600">
        <span>00:00:00:00</span>
        <span>00:00:15:00</span>
        <span>00:00:30:00</span>
        <span>00:00:45:00</span>
        <span>00:01:00:00</span>
      </div>
    </Surface>
  );
};
