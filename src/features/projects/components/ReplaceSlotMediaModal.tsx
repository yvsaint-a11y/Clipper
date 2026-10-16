import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Surface, MotionButton, Badge, FeedbackBanner, EmptyState } from '@/src/components/ui';
import { motionTokens } from '@/src/lib/designTokens';
import {
  X,
  FileVideo,
  FileAudio,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  ArrowRight,
  HardDrive,
  AlertCircle,
  Film,
} from 'lucide-react';
import type { EditorMediaAsset } from '../../editor/stores/useEditorStore';

export interface ReplaceableSlotItem {
  slotKey: string;
  clip: any;
  track: any;
}

export interface ReplaceSlotMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  accessToken: string | null;
  slots: ReplaceableSlotItem[];
  initialSlotKey?: string | null;
  mediaAssets: EditorMediaAsset[];
  onSuccess: (project: any, timeline: any) => void;
}

export const ReplaceSlotMediaModal: React.FC<ReplaceSlotMediaModalProps> = ({
  isOpen,
  onClose,
  projectId,
  accessToken,
  slots,
  initialSlotKey,
  mediaAssets,
  onSuccess,
}) => {
  const [activeSlotKey, setActiveSlotKey] = useState<string>('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Initialize active slot
  useEffect(() => {
    if (initialSlotKey && slots.some((s) => s.slotKey === initialSlotKey)) {
      setActiveSlotKey(initialSlotKey);
    } else if (slots.length > 0) {
      setActiveSlotKey(slots[0].slotKey);
    }
    setSelectedAssetId(null);
    setError(null);
    setSuccessMsg(null);
  }, [isOpen, initialSlotKey, slots]);

  if (!isOpen) return null;

  const currentSlot = slots.find((s) => s.slotKey === activeSlotKey) || slots[0];
  const clipType = currentSlot?.clip?.clipType || currentSlot?.clip?.type || 'video';

  // Filter media compatible with the current slot
  const compatibleMedia = mediaAssets.filter((asset) => {
    const mime = asset.mimeType.toLowerCase();
    if (clipType === 'video') return mime.startsWith('video/') || mime.startsWith('image/');
    if (clipType === 'audio') return mime.startsWith('audio/');
    if (clipType === 'image') return mime.startsWith('image/');
    return true;
  });

  const currentlyAssignedAsset = mediaAssets.find(
    (a) => a.id === currentSlot?.clip?.mediaAssetId
  );

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getMediaIcon = (mime: string) => {
    if (mime.startsWith('video/')) return <FileVideo className="w-4 h-4 text-[#C7C9CC]" />;
    if (mime.startsWith('audio/')) return <FileAudio className="w-4 h-4 text-[#92969C]" />;
    return <ImageIcon className="w-4 h-4 text-[#B4B6B9]" />;
  };

  const handleExecuteReplace = async () => {
    if (!accessToken || !projectId || !activeSlotKey || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/slots/${encodeURIComponent(activeSlotKey)}/replace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          mediaAssetId: selectedAssetId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to replace slot media.');
      }

      const data = await res.json();
      setSuccessMsg(`Successfully updated slot "${activeSlotKey}" with new media!`);
      onSuccess(data.project, data.timeline);

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error replacing slot media.');
    } finally {
      setIsSubmitting(false);
    }
  };

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

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 10 }}
          transition={{ duration: motionTokens.duration.component, ease: motionTokens.ease.expressiveOut }}
          className="relative w-full max-w-2xl max-h-[90vh] flex flex-col z-10"
        >
          <Surface level={2} className="flex-1 flex flex-col overflow-hidden rounded-xl border border-[#292B2D] bg-[#141516] shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#292B2D] flex items-center justify-between shrink-0 bg-[#0B0C0D]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#1B1C1E] border border-[#3A3C3F] text-[#C7C9CC]">
                  <Sparkles className="w-5 h-5 text-[#C7C9CC]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Replace Template Media
                  </h3>
                  <p className="text-xs text-[#92969C] mt-0.5">
                    Customize replaceable template slots with your own uploaded media assets
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#202123] transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {error && <FeedbackBanner variant="error" message={error} />}
              {successMsg && <FeedbackBanner variant="success" message={successMsg} />}

              {/* Slot Selector tabs if multiple slots */}
              {slots.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                    Select Slot to Customize
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => (
                      <button
                        key={s.slotKey}
                        type="button"
                        onClick={() => {
                          setActiveSlotKey(s.slotKey);
                          setSelectedAssetId(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-2 cursor-pointer border ${
                          s.slotKey === activeSlotKey
                            ? 'bg-[#252628] text-[#F2F2F0] border-[#3A3C3F] shadow-[0_1px_4px_rgba(0,0,0,0.6)] font-semibold'
                            : 'bg-[#080909] text-zinc-400 border-[#292B2D] hover:text-zinc-200 hover:bg-[#1B1C1E]'
                        }`}
                      >
                        <span className="text-zinc-500 font-bold">#</span>
                        <span>{s.slotKey}</span>
                        <Badge variant="outline" className="text-[9px] capitalize border-[#3A3C3F] text-zinc-400">
                          {s.clip.clipType || s.clip.type}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Current Slot Info Card */}
              {currentSlot && (
                <div className="p-4 rounded-lg bg-[#080909] border border-[#292B2D] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-white">
                        Slot: {currentSlot.slotKey}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-mono capitalize border-[#3A3C3F] text-[#C7C9CC]">
                        {clipType} Slot
                      </Badge>
                    </div>

                    <span className="text-xs text-zinc-400 font-mono">
                      Clip: "{currentSlot.clip.name}"
                    </span>
                  </div>

                  <div className="text-xs text-zinc-400 pt-2 border-t border-[#1B1C1E] flex items-center justify-between">
                    <span>Currently Assigned:</span>
                    {currentlyAssignedAsset ? (
                      <span className="font-mono text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {currentlyAssignedAsset.originalFilename}
                      </span>
                    ) : (
                      <span className="text-amber-400 font-mono">
                        Detached (No media assigned)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Available Media Assets Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Choose Replacement Media from Your Library
                  </label>
                  <span className="text-xs text-zinc-500 font-mono">
                    {compatibleMedia.length} {compatibleMedia.length === 1 ? 'asset' : 'assets'} available
                  </span>
                </div>

                {compatibleMedia.length === 0 ? (
                  <div className="p-8 text-center rounded-lg bg-[#080909] border border-[#292B2D]">
                    <EmptyState
                      icon={<Film className="w-8 h-8 text-zinc-600" />}
                      title="No compatible media assets found"
                      description={`Upload ${clipType} assets in the Media tab or drag them into the editor to use them as slot replacements.`}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                    {compatibleMedia.map((asset) => {
                      const isSelected = selectedAssetId === asset.id;
                      const isCurrent = currentSlot?.clip?.mediaAssetId === asset.id;

                      return (
                        <div
                          key={asset.id}
                          onClick={() => setSelectedAssetId(asset.id)}
                          className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-[#1F2022] border-[#C7C9CC] text-white shadow-md'
                              : isCurrent
                              ? 'bg-[#18191A] border-emerald-500/40 text-zinc-200'
                              : 'bg-[#080909] border-[#292B2D] hover:border-[#686B70] text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded bg-[#141516] border border-[#292B2D] shrink-0">
                              {getMediaIcon(asset.mimeType)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-white truncate max-w-[170px]" title={asset.originalFilename}>
                                {asset.originalFilename}
                              </div>
                              <div className="text-[10px] text-zinc-400 font-mono mt-0.5 flex items-center gap-2">
                                <span>{formatBytes(asset.fileSizeBytes)}</span>
                                {asset.durationMs && (
                                  <>
                                    <span>•</span>
                                    <span>{(asset.durationMs / 1000).toFixed(1)}s</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5">
                            {isCurrent && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">
                                Current
                              </span>
                            )}
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected
                                  ? 'border-[#C7C9CC] bg-[#C7C9CC] text-[#0B0C0D]'
                                  : 'border-[#3A3C3F] bg-[#141516]'
                              }`}
                            >
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#0B0C0D]" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#292B2D] flex items-center justify-between shrink-0 bg-[#0B0C0D]">
              <MotionButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={isSubmitting}
                className="text-zinc-400 hover:text-white"
              >
                Cancel
              </MotionButton>

              <div className="flex items-center gap-3">
                {currentlyAssignedAsset && (
                  <button
                    type="button"
                    onClick={() => setSelectedAssetId(null)}
                    className="text-xs text-zinc-400 hover:text-rose-400 underline transition-colors cursor-pointer mr-2"
                  >
                    Detach Media
                  </button>
                )}

                <MotionButton
                  type="button"
                  variant="silver"
                  size="sm"
                  onClick={handleExecuteReplace}
                  disabled={isSubmitting || (!selectedAssetId && !currentlyAssignedAsset)}
                  isLoading={isSubmitting}
                  leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                  className="font-medium text-xs px-4"
                >
                  {isSubmitting ? 'Replacing...' : 'Apply Replacement'}
                </MotionButton>
              </div>
            </div>
          </Surface>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
