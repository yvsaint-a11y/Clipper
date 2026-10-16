import React from 'react';
import { Surface, ParallaxContainer, MotionButton, Badge } from '@/src/components/ui';
import {
  LayoutTemplate,
  Monitor,
  Smartphone,
  Square,
  Clock,
  Archive,
  Layers,
  Sparkles,
  ExternalLink,
  Lock,
  Globe,
  Sliders,
} from 'lucide-react';
import type { Template } from '@/src/types/template';

export interface TemplateCardProps {
  template: Template;
  isOwner: boolean;
  onOpen: (template: Template) => void;
  onArchive?: (template: Template) => void;
  isArchiving?: boolean;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  isOwner,
  onOpen,
  onArchive,
  isArchiving = false,
}) => {
  const getAspectIcon = (ratio: string) => {
    switch (ratio) {
      case '9:16':
        return <Smartphone className="w-3.5 h-3.5 text-[#C7C9CC]" />;
      case '1:1':
        return <Square className="w-3.5 h-3.5 text-[#B4B6B9]" />;
      default:
        return <Monitor className="w-3.5 h-3.5 text-[#F2F2F0]" />;
    }
  };

  const durationSec = template.durationMs ? (template.durationMs / 1000).toFixed(1) : null;
  const slotCount = template.slotCount ?? template.latestVersion?.slots?.length ?? 0;
  const versionNum = template.latestVersionNumber ?? template.currentVersionNumber ?? 1;

  // Aspect ratio preview container dimensions
  const getPreviewAspectClass = (ratio: string) => {
    switch (ratio) {
      case '9:16':
        return 'w-20 h-32';
      case '1:1':
        return 'w-24 h-24';
      default:
        return 'w-36 h-20';
    }
  };

  return (
    <ParallaxContainer depth={6} className="h-full">
      <Surface
        level={2}
        className="group relative p-5 border-[#292B2D] hover:border-[#686B70] flex flex-col justify-between h-full transition-all duration-200 rounded-xl bg-[#141516]"
      >
        <div className="space-y-4">
          {/* Header Metadata Row: Format, Ownership & Category */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] gap-1.5 border-[#3A3C3F] bg-[#1B1C1E] text-[#C7C9CC] font-mono">
                {getAspectIcon(template.aspectRatio)}
                <span>{template.aspectRatio}</span>
              </Badge>

              <span className="text-[11px] text-[#92969C] capitalize font-medium">
                {template.category}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {isOwner ? (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#1B1C1E] text-[#C7C9CC] border border-[#3A3C3F]">
                  My Template
                </span>
              ) : (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-950/30 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <Globe className="w-2.5 h-2.5" />
                  Community
                </span>
              )}
            </div>
          </div>

          {/* Visual Preview Wireframe (Zero Video Overhead) */}
          <div
            onClick={() => onOpen(template)}
            className="w-full h-32 rounded-lg bg-[#080909] border border-[#292B2D] flex items-center justify-center p-3 relative overflow-hidden cursor-pointer group-hover:border-[#686B70] transition-colors select-none"
            title="Click to inspect template slots and specifications"
          >
            {/* Ambient track stripes background */}
            <div className="absolute inset-0 opacity-20 pointer-events-none flex flex-col justify-between py-2 px-3">
              <div className="w-full h-1.5 rounded bg-zinc-600" />
              <div className="w-3/4 h-1.5 rounded bg-zinc-600" />
              <div className="w-1/2 h-1.5 rounded bg-zinc-600" />
            </div>

            {/* Stylized Canvas Outline */}
            <div
              className={`${getPreviewAspectClass(
                template.aspectRatio
              )} border-2 border-dashed border-[#686B70] rounded flex flex-col items-center justify-center p-1.5 bg-[#1B1C1E]/60 shadow-lg relative z-10 transition-transform group-hover:scale-105`}
            >
              <LayoutTemplate className="w-5 h-5 text-[#C7C9CC] mb-1" />
              <span className="text-[10px] font-mono text-[#F2F2F0] tracking-tight">
                {template.aspectRatio}
              </span>
              <span className="text-[9px] font-mono text-[#92969C]">
                {slotCount} {slotCount === 1 ? 'slot' : 'slots'}
              </span>
            </div>
          </div>

          {/* Template Title & Description */}
          <div>
            <h3
              onClick={() => onOpen(template)}
              className="text-sm font-semibold text-white tracking-tight truncate group-hover:text-[#C7C9CC] transition-colors cursor-pointer"
              title={template.name}
            >
              {template.name}
            </h3>

            <p className="text-xs text-zinc-400 line-clamp-2 mt-1 leading-relaxed min-h-[2rem]">
              {template.description || 'Reusable video layout recipe and timeline structure.'}
            </p>
          </div>

          {/* Typographic Metadata (Zero pills, clean text with separators) */}
          <div className="pt-2 border-t border-[#292B2D] flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400 font-mono">
            <span>{template.resolution || '1080p'}</span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span>{template.fps || 30}fps</span>
            {durationSec && (
              <>
                <span aria-hidden="true" className="text-zinc-600">·</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  {durationSec}s
                </span>
              </>
            )}
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="text-emerald-400 font-medium">v{versionNum}</span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="text-[#C7C9CC]">{slotCount} {slotCount === 1 ? 'slot' : 'slots'}</span>
          </div>
        </div>

        {/* Card Footer Actions */}
        <div className="mt-5 pt-3 border-t border-[#292B2D] flex items-center justify-between gap-2">
          <MotionButton
            variant="silver"
            size="sm"
            onClick={() => onOpen(template)}
            className="flex-1 text-xs py-1.5 font-medium"
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
          >
            Use Template
          </MotionButton>

          {isOwner && onArchive && (
            <button
              type="button"
              onClick={() => onArchive(template)}
              disabled={isArchiving}
              title="Archive template"
              aria-label={`Archive template ${template.name}`}
              className="p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-950/20 border border-transparent hover:border-rose-900/40 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Archive className="w-4 h-4" />
            </button>
          )}
        </div>
      </Surface>
    </ParallaxContainer>
  );
};
