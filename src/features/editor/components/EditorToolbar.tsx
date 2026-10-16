import React from 'react';
import { Surface, MotionButton, Badge } from '@/src/components/ui';
import { ClipperLogo } from '@/src/components/ClipperLogo';
import {
  ArrowLeft,
  Save,
  Check,
  RotateCw,
  Film,
  Monitor,
  Smartphone,
  Square,
  Lock,
  LayoutTemplate,
  Sparkles,
} from 'lucide-react';

export interface EditorToolbarProps {
  projectName: string;
  aspectRatio: string;
  resolution: string;
  fps: number;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  lastSaveError?: string | null;
  onSave: () => void;
  onSaveAsTemplate?: () => void;
  onBack: () => void;
  onTitleChange?: (newTitle: string) => void;
  replaceableSlotCount?: number;
  onOpenReplaceSlotMedia?: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  projectName,
  aspectRatio,
  resolution,
  fps,
  isDirty,
  isSaving,
  lastSavedAt,
  lastSaveError,
  onSave,
  onSaveAsTemplate,
  onBack,
  onTitleChange,
  replaceableSlotCount,
  onOpenReplaceSlotMedia,
}) => {
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [tempTitle, setTempTitle] = React.useState(projectName);

  React.useEffect(() => {
    setTempTitle(projectName);
  }, [projectName]);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (tempTitle.trim() && tempTitle.trim() !== projectName && onTitleChange) {
      onTitleChange(tempTitle.trim());
    } else {
      setTempTitle(projectName);
    }
  };

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

  return (
    <Surface
      level={3}
      className="px-2.5 sm:px-4 py-2 sm:py-2.5 border-b border-[#292B2D] flex items-center justify-between gap-2 sm:gap-4 select-none shrink-0 bg-[#0B0C0D] overflow-x-auto scrollbar-none min-w-0"
    >
      {/* Left branding & return */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
        <MotionButton
          variant="ghost"
          size="sm"
          onClick={onBack}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
          className="text-zinc-400 hover:text-white px-2 sm:px-3 shrink-0"
        >
          <span className="hidden sm:inline">Projects</span>
        </MotionButton>

        <div className="h-4 w-px bg-[#292B2D] shrink-0" />

        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0">
            <ClipperLogo variant="mark" size="sm" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              {isEditingTitle ? (
                <input
                  type="text"
                  value={tempTitle}
                  autoFocus
                  onChange={(e) => setTempTitle(e.target.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTitleSubmit();
                    if (e.key === 'Escape') {
                      setTempTitle(projectName);
                      setIsEditingTitle(false);
                    }
                  }}
                  className="text-xs sm:text-sm font-semibold text-white bg-[#080909] border border-[#686B70] rounded px-1.5 py-0.5 outline-none max-w-[120px] xs:max-w-[160px] sm:max-w-xs focus:border-[#C7C9CC]"
                />
              ) : (
                <h2
                  onClick={() => setIsEditingTitle(true)}
                  title="Click to rename project"
                  className="text-xs sm:text-sm font-semibold text-white tracking-tight truncate max-w-[110px] xs:max-w-[150px] sm:max-w-xs cursor-pointer hover:text-[#C7C9CC] transition-colors"
                >
                  {projectName}
                </h2>
              )}
              {isDirty ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Unsaved changes in workspace" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-400/80 shrink-0" title="Synchronized with database" />
              )}
            </div>
            <div className="text-[9px] sm:text-[10px] text-zinc-500 font-mono truncate max-w-[110px] xs:max-w-[150px] sm:max-w-none">
              {lastSaveError ? (
                <span className="text-rose-400">Save error: {lastSaveError}</span>
              ) : isSaving ? (
                <span className="text-[#C7C9CC]">Saving version...</span>
              ) : lastSavedAt ? (
                `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`
              ) : (
                'All changes saved to DB'
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Center format pills */}
      <div className="hidden md:flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-[11px] gap-1.5 border-[#3A3C3F] bg-[#1B1C1E] text-[#C7C9CC] font-mono">
          {getAspectIcon(aspectRatio)}
          <span>{aspectRatio}</span>
        </Badge>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#080909] text-[#92969C] border border-[#292B2D]">
          {resolution} • {fps}fps
        </span>
      </div>

      {/* Right save action & sync status */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono mr-1">
          {isDirty ? (
            <span className="text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Unsaved
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Synced
            </span>
          )}
        </div>

        {onOpenReplaceSlotMedia && typeof replaceableSlotCount === 'number' && replaceableSlotCount > 0 && (
          <MotionButton
            variant="outline"
            size="sm"
            onClick={onOpenReplaceSlotMedia}
            leftIcon={<Sparkles className="w-3.5 h-3.5 text-[#C7C9CC]" />}
            title="Replace media assigned to template slots"
            className="border-[#292B2D] hover:border-[#686B70] hover:bg-[#1B1C1E] text-xs px-2 sm:px-3 shrink-0"
          >
            <span className="hidden md:inline">Replace Media</span>
            <span className="md:hidden">Replace</span>
            <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-[#252628] text-[#C7C9CC] border border-[#3A3C3F]">
              {replaceableSlotCount}
            </span>
          </MotionButton>
        )}

        {onSaveAsTemplate && (
          <MotionButton
            variant="outline"
            size="sm"
            onClick={onSaveAsTemplate}
            disabled={isSaving}
            leftIcon={<LayoutTemplate className="w-3.5 h-3.5 text-[#C7C9CC]" />}
            title="Save this project's layout and timing as a reusable template"
            className="border-[#292B2D] hover:border-[#686B70] hover:bg-[#1B1C1E] px-2 sm:px-3 shrink-0"
          >
            <span className="hidden md:inline">Save as Template</span>
            <span className="md:hidden">Template</span>
          </MotionButton>
        )}

        <MotionButton
          variant={isDirty ? 'silver' : 'outline'}
          size="sm"
          onClick={onSave}
          disabled={isSaving}
          isLoading={isSaving}
          leftIcon={<Save className="w-3.5 h-3.5" />}
          title={isDirty ? 'Save Project (Ctrl+S / ⌘S)' : 'All changes saved (Ctrl+S / ⌘S)'}
          className="px-2.5 sm:px-3 shrink-0"
        >
          <span className="hidden xs:inline">{isSaving ? 'Saving...' : isDirty ? 'Save Project' : 'Saved'}</span>
          <span className="xs:hidden">{isSaving ? '...' : isDirty ? 'Save' : 'Saved'}</span>
        </MotionButton>
      </div>
    </Surface>
  );
};
