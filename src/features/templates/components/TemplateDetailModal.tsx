import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Surface, MotionButton, Badge, FeedbackBanner } from '@/src/components/ui';
import { motionTokens } from '@/src/lib/designTokens';
import {
  LayoutTemplate,
  X,
  Video,
  Music,
  Image as ImageIcon,
  Type,
  Lock,
  Globe,
  Archive,
  Clock,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Hash,
  Sparkles,
} from 'lucide-react';
import type { Template, TemplateSlot, TemplateSlotType } from '@/src/types/template';

export interface TemplateDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string | null;
  accessToken: string | null;
  currentUserId?: string | null;
  onArchiveSuccess?: (archivedTemplateId: string) => void;
  onApplySuccess?: (createdProject: any) => void;
}

export const TemplateDetailModal: React.FC<TemplateDetailModalProps> = ({
  isOpen,
  onClose,
  templateId,
  accessToken,
  currentUserId,
  onArchiveSuccess,
  onApplySuccess,
}) => {
  const [template, setTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Archive confirmation state
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Apply / Instantiate project state
  const [projectName, setProjectName] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !templateId || !accessToken) {
      setTemplate(null);
      setIsConfirmingArchive(false);
      setArchiveError(null);
      setProjectName('');
      setIsApplying(false);
      setApplyError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setIsConfirmingArchive(false);
    setArchiveError(null);
    setApplyError(null);

    fetch(`/api/templates/${templateId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to fetch template specifications.');
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setTemplate(data.template);
          setProjectName(`${data.template.name} — New Project`);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error loading template details.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, templateId, accessToken]);

  if (!isOpen) return null;

  const isOwner = Boolean(
    template && currentUserId && template.userId && template.userId === currentUserId
  );

  const handleApply = async () => {
    if (!template || !accessToken || isApplying) return;
    setIsApplying(true);
    setApplyError(null);

    try {
      const res = await fetch(`/api/templates/${template.id}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          projectName: projectName.trim() || `${template.name} — New Project`,
          versionNumber: template.latestVersion?.versionNumber,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to instantiate project from template.');
      }

      const data = await res.json();
      if (onApplySuccess) {
        onApplySuccess(data.project);
      }
      onClose();
    } catch (err: unknown) {
      setApplyError(err instanceof Error ? err.message : 'Error applying template.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleArchive = async () => {
    if (!template || !accessToken || isArchiving) return;
    setIsArchiving(true);
    setArchiveError(null);

    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to archive template.');
      }

      if (onArchiveSuccess) {
        onArchiveSuccess(template.id);
      }
      onClose();
    } catch (err: unknown) {
      setArchiveError(err instanceof Error ? err.message : 'Error archiving template.');
    } finally {
      setIsArchiving(false);
    }
  };

  const getSlotTypeIcon = (type: TemplateSlotType) => {
    switch (type) {
      case 'audio':
        return <Music className="w-4 h-4 text-amber-400" />;
      case 'image':
      case 'logo':
        return <ImageIcon className="w-4 h-4 text-emerald-400" />;
      case 'text':
      case 'caption':
        return <Type className="w-4 h-4 text-sky-400" />;
      default:
        return <Video className="w-4 h-4 text-[#C7C9CC]" />;
    }
  };

  const slots: TemplateSlot[] = template?.latestVersion?.slots || [];
  const durationSec = template?.durationMs ? (template.durationMs / 1000).toFixed(1) : null;
  const versionNum = template?.latestVersion?.versionNumber || template?.currentVersionNumber || 1;
  const checksum = template?.latestVersion?.checksum;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[#080909]/85 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: motionTokens.duration.component, ease: motionTokens.ease.expressiveOut }}
          className="relative z-10 w-full max-w-2xl max-h-[92vh] flex flex-col my-auto"
        >
          <Surface
            level={4}
            className="border-[#3A3C3F] shadow-[0_24px_64px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden rounded-xl bg-[#141516]"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#292B2D] flex items-center justify-between shrink-0 bg-[#0B0C0D]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#1B1C1E] border border-[#3A3C3F] flex items-center justify-center text-[#F2F2F0]">
                  <LayoutTemplate className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    {template?.name || 'Template Specifications'}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Reusable video structure and slot configuration
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-[#202123] transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(92vh-140px)]">
              {isLoading && (
                <div className="py-16 flex flex-col items-center justify-center space-y-3">
                  <div className="w-8 h-8 border-2 border-[#3A3C3F] border-t-[#C7C9CC] rounded-full animate-spin" />
                  <p className="text-xs text-zinc-400">Loading template specifications...</p>
                </div>
              )}

              {error && (
                <FeedbackBanner
                  type="error"
                  title="Inspection Error"
                  message={error}
                  onDismiss={() => setError(null)}
                />
              )}

              {archiveError && (
                <FeedbackBanner
                  type="error"
                  title="Archive Error"
                  message={archiveError}
                  onDismiss={() => setArchiveError(null)}
                />
              )}

              {template && !isLoading && (
                <>
                  {/* Status & Ownership Banner */}
                  <div className="rounded-lg bg-[#080909] border border-[#292B2D] p-3 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">Category:</span>
                      <span className="text-xs font-semibold text-white capitalize">
                        {template.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isOwner ? (
                        <span className="text-[11px] font-medium px-2.5 py-0.5 rounded bg-[#1B1C1E] text-[#C7C9CC] border border-[#3A3C3F]">
                          Owned by you
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium px-2.5 py-0.5 rounded bg-emerald-950/30 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          Community Template
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-zinc-500">
                        Created {new Date(template.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  {template.description && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
                        Overview
                      </h4>
                      <p className="text-xs text-zinc-300 leading-relaxed bg-[#080909] p-3 rounded-lg border border-[#292B2D]">
                        {template.description}
                      </p>
                    </div>
                  )}

                  {/* Technical Specifications Grid */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                      Technical Specifications
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-[#080909] border border-[#292B2D]">
                        <span className="block text-[10px] text-zinc-400 uppercase font-mono">Aspect Ratio</span>
                        <span className="text-sm font-semibold text-white font-mono">{template.aspectRatio}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-[#080909] border border-[#292B2D]">
                        <span className="block text-[10px] text-zinc-400 uppercase font-mono">Resolution</span>
                        <span className="text-sm font-semibold text-white font-mono">{template.resolution || '1080p'}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-[#080909] border border-[#292B2D]">
                        <span className="block text-[10px] text-zinc-400 uppercase font-mono">Frame Rate</span>
                        <span className="text-sm font-semibold text-white font-mono">{template.fps || 30} FPS</span>
                      </div>
                      <div className="p-3 rounded-lg bg-[#080909] border border-[#292B2D]">
                        <span className="block text-[10px] text-zinc-400 uppercase font-mono">Duration</span>
                        <span className="text-sm font-semibold text-white font-mono">
                          {durationSec ? `${durationSec}s` : 'Variable'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Version Information */}
                  <div className="rounded-lg bg-[#080909] border border-[#292B2D] p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Active Version:</span>
                      <span className="font-mono text-emerald-400 font-semibold">
                        Version {versionNum} (Immutable)
                      </span>
                    </div>

                    {checksum && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-[#1B1C1E]">
                        <span className="text-zinc-500 font-mono text-[10px]">Deterministic Fingerprint:</span>
                        <span
                          className="font-mono text-[10px] text-zinc-400 truncate max-w-[240px]"
                          title={checksum}
                        >
                          sha256:{checksum.substring(0, 16)}...
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Configured Slots List */}
                  <div className="space-y-3 pt-2 border-t border-[#292B2D]">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-[#C7C9CC]" />
                          Configured Media Slots ({slots.length})
                        </h4>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Replaceable input placeholders that will be customizable when creating projects from this template.
                        </p>
                      </div>
                    </div>

                    {slots.length === 0 ? (
                      <div className="p-4 rounded-lg bg-[#080909] border border-[#292B2D] text-center text-xs text-zinc-400">
                        This template uses fixed timeline content only. No dynamic input slots configured.
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                        {slots.map((slot, index) => {
                          const isRequired = slot.constraints?.isRequired !== false;
                          return (
                            <div
                              key={slot.id || slot.slotKey || index}
                              className="p-3 rounded-lg border border-[#292B2D] bg-[#171819] flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-[10px] font-mono text-zinc-500 w-4">#{index + 1}</span>
                                <div className="p-1.5 rounded bg-[#1B1C1E] border border-[#3A3C3F]">
                                  {getSlotTypeIcon(slot.type)}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-white truncate max-w-[220px] sm:max-w-xs">
                                    {slot.label}
                                  </div>
                                  <div className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[280px]">
                                    {slot.description || `Replaceable ${slot.type} input placeholder`}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-mono capitalize px-2 py-0.5 rounded bg-[#141516] text-[#C7C9CC] border border-[#292B2D]">
                                  {slot.type}
                                </span>
                                {isRequired ? (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#1B1C1E] text-[#C7C9CC] border border-[#3A3C3F]">
                                    Required
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#141516] text-zinc-400 border border-[#292B2D]">
                                    Optional
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Create Project from Template Configuration */}
                  <div className="rounded-lg bg-[#141516] border border-[#292B2D] p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#F2F2F0]" />
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#F2F2F0]">
                        Instantiate New Project
                      </h4>
                    </div>
                    <p className="text-xs text-[#92969C] leading-relaxed">
                      Creates an independent, fully editable project in your workspace. The original template recipe remains 100% untouched.
                    </p>
                    <div className="space-y-1.5">
                      <label htmlFor="apply-project-name" className="block text-xs font-medium text-zinc-300">
                        New Project Name
                      </label>
                      <input
                        id="apply-project-name"
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="e.g. My New Video"
                        maxLength={100}
                        disabled={isApplying}
                        className="w-full px-3 py-2 text-xs bg-[#080909] border border-[#292B2D] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-[#C7C9CC] transition-colors"
                      />
                    </div>
                    {applyError && (
                      <FeedbackBanner variant="error" message={applyError} />
                    )}
                  </div>

                  {/* Confirmation Area if Archive Clicked */}
                  {isConfirmingArchive && (
                    <div className="p-4 rounded-lg bg-rose-950/20 border border-rose-800/40 space-y-3">
                      <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Confirm Archiving Template</span>
                      </div>
                      <p className="text-xs text-zinc-300">
                        Are you sure you want to archive "{template.name}"? It will be removed from your active library while preserving historical version records.
                      </p>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <MotionButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsConfirmingArchive(false)}
                          disabled={isArchiving}
                        >
                          Cancel
                        </MotionButton>
                        <MotionButton
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={handleArchive}
                          disabled={isArchiving}
                          isLoading={isArchiving}
                          className="bg-rose-600 hover:bg-rose-500 text-white"
                        >
                          Yes, Archive Template
                        </MotionButton>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-[#292B2D] flex items-center justify-between shrink-0 bg-[#0B0C0D]">
              <div>
                {isOwner && !isConfirmingArchive && (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingArchive(true)}
                    className="text-xs text-zinc-400 hover:text-rose-400 flex items-center gap-1.5 transition-colors cursor-pointer py-1"
                    aria-label={`Archive template ${template?.name || ''}`}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Archive Template</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <MotionButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="text-zinc-400 hover:text-white"
                >
                  Close
                </MotionButton>

                {/* Apply Template Action */}
                <MotionButton
                  type="button"
                  variant="silver"
                  size="sm"
                  onClick={handleApply}
                  disabled={isLoading || isApplying || isArchiving}
                  isLoading={isApplying}
                  leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                  className="font-medium text-xs px-4"
                >
                  {isApplying ? 'Creating Project...' : 'Use Template'}
                </MotionButton>
              </div>
            </div>
          </Surface>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
