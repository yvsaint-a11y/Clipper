import React, { useState } from 'react';
import { Surface, ParallaxContainer, MotionButton, Badge } from '@/src/components/ui';
import {
  Film,
  Monitor,
  Smartphone,
  Square,
  Clock,
  MoreVertical,
  Copy,
  Trash2,
  ExternalLink,
  Edit2,
  Check,
  X,
} from 'lucide-react';

export interface ProjectItem {
  id: string;
  name: string;
  description?: string | null;
  aspectRatio: string;
  resolution: string;
  fps: number;
  durationMs: number;
  currentVersionNumber: number;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCardProps {
  project: ProjectItem;
  onOpen: (project: ProjectItem) => void;
  onDuplicate: (project: ProjectItem) => void;
  onDelete: (project: ProjectItem) => void;
  onRename: (project: ProjectItem, newName: string) => Promise<void>;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onOpen,
  onDuplicate,
  onDelete,
  onRename,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [nameVal, setNameVal] = useState(project.name);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

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

  const handleSaveRename = async () => {
    if (!nameVal.trim() || nameVal === project.name) {
      setIsEditing(false);
      setNameVal(project.name);
      return;
    }
    setIsRenaming(true);
    try {
      await onRename(project, nameVal.trim());
      setIsEditing(false);
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <ParallaxContainer depth={8} className="h-full">
      <Surface
        level={2}
        className="group relative p-5 border-[#292B2D] bg-[#141516] hover:border-[#686B70] flex flex-col justify-between h-full transition-all duration-200"
      >
        <div>
          {/* Card Header & Format Badges */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <Badge variant="outline" className="text-[11px] gap-1.5 border-[#3A3C3F] bg-[#1B1C1E] text-[#C7C9CC] font-mono">
              {getAspectIcon(project.aspectRatio)}
              <span>{project.aspectRatio}</span>
            </Badge>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#080909] text-[#92969C] border border-[#292B2D]">
                {project.resolution} • {project.fps}fps
              </span>

              {/* Action Dropdown Toggle */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(!isMenuOpen);
                  }}
                  className="p-1 rounded text-[#92969C] hover:text-[#F2F2F0] hover:bg-[#202123] transition-colors cursor-pointer"
                  title="Project options"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>

                {isMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-7 w-36 rounded-lg bg-[#141516] border border-[#3A3C3F] shadow-[0_12px_28px_rgba(0,0,0,0.8)] py-1 z-30 space-y-0.5"
                  >
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-[#C7C9CC] hover:bg-[#252628] hover:text-[#FFFFFF] flex items-center gap-2 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Rename</span>
                    </button>
                    <button
                      onClick={() => {
                        onDuplicate(project);
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-[#C7C9CC] hover:bg-[#252628] hover:text-[#FFFFFF] flex items-center gap-2 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Duplicate</span>
                    </button>
                    <button
                      onClick={() => {
                        onDelete(project);
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300 flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Archive</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Project Title / Inline Editing */}
          {isEditing ? (
            <div className="flex items-center gap-1.5 mb-2" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                autoFocus
                disabled={isRenaming}
                className="w-full px-2 py-1 bg-[#080909] border border-[#686B70] rounded text-xs text-[#F2F2F0] focus:outline-none"
              />
              <button
                onClick={handleSaveRename}
                disabled={isRenaming}
                className="p-1 rounded bg-[#252628] text-white hover:bg-[#3A3C3F] cursor-pointer"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setNameVal(project.name);
                }}
                className="p-1 rounded bg-[#171819] text-[#92969C] hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <h4
              onClick={() => onOpen(project)}
              className="text-sm font-semibold text-[#F2F2F0] group-hover:text-white transition-colors cursor-pointer truncate mb-1"
              title={project.name}
            >
              {project.name}
            </h4>
          )}

          {project.description ? (
            <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-4">
              {project.description}
            </p>
          ) : (
            <p className="text-xs text-zinc-500 italic mb-4">No project description</p>
          )}
        </div>

        {/* Footer Meta & Open Button */}
        <div className="pt-3 border-t border-[#292B2D] flex items-center justify-between text-[11px] text-[#92969C]">
          <div className="flex items-center gap-1 font-mono">
            <Clock className="w-3 h-3 text-[#777A7E]" />
            <span>v{project.currentVersionNumber} • {new Date(project.updatedAt).toLocaleDateString()}</span>
          </div>

          <MotionButton
            variant="glass"
            size="xs"
            onClick={() => onOpen(project)}
            rightIcon={<ExternalLink className="w-3 h-3" />}
          >
            Open Studio
          </MotionButton>
        </div>
      </Surface>
    </ParallaxContainer>
  );
};
