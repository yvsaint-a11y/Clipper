import React from 'react';
import { Surface, Badge } from '@/src/components/ui';
import { useEditorStore, EditorMediaAsset } from '../stores/useEditorStore';
import {
  type ClipTransformUpdate,
  MIN_CLIP_SCALE,
  normalizeClipTransform,
} from '../utils/clipTransform';
import {
  type ClipCropUpdate,
  MAX_COMBINED_AXIS_CROP,
  normalizeClipCrop,
} from '../utils/clipCrop';
import {
  type TextClipUpdate,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  normalizeTextClipProperties,
} from '../utils/textClip';
import {
  type AudioClipUpdate,
  MIN_AUDIO_VOLUME,
  MAX_AUDIO_VOLUME,
  normalizeAudioClipProperties,
} from '../utils/audioClip';
import type { BasicTransitionType, ClipTransition } from '@/src/types/timeline';
import {
  type ClipTransitionUpdate,
  collectTimelineTransitions,
  getMaxTransitionDurationMs,
} from '../utils/clipTransition';
import {
  Settings,
  Info,
  FileVideo,
  FileAudio,
  Image as ImageIcon,
  Clock,
  HardDrive,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  RotateCcw,
  Move,
  Crop,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Volume2,
  VolumeX,
  ArrowRightLeft,
  Trash2,
} from 'lucide-react';

export interface EditorInspectorProps {
  selectedAsset: EditorMediaAsset | null;
  selectedClip?: any | null;
  selectedTrack?: any | null;
  selectedTransition?: ClipTransition | null;
  projectMetadata: {
    name: string;
    aspectRatio: string;
    resolution: string;
    fps: number;
    id: string;
  };
  onClipTimingChange?: (clipId: string, startTimeMs: number, endTimeMs: number) => void;
  onClipTransformChange?: (clipId: string, updates: ClipTransformUpdate) => void;
  onClipTransformReset?: (clipId: string) => void;
  onClipCropChange?: (clipId: string, updates: ClipCropUpdate) => void;
  onClipCropReset?: (clipId: string) => void;
  onTextClipChange?: (clipId: string, updates: TextClipUpdate) => void;
  onAudioClipChange?: (clipId: string, updates: AudioClipUpdate) => void;
  onAudioClipReset?: (clipId: string) => void;
  onTransitionChange?: (transitionId: string, updates: ClipTransitionUpdate) => void;
  onTransitionRemove?: (transitionId: string) => void;
  onClipDelete?: (clipId: string) => void;
  onProjectAspectChange?: (aspectRatio: string) => void;
  onOpenReplaceSlotMedia?: (slotKey: string) => void;
}

export const EditorInspector: React.FC<EditorInspectorProps> = ({
  selectedAsset,
  selectedClip,
  selectedTrack,
  selectedTransition: selectedTransitionProp,
  projectMetadata,
  onClipTimingChange,
  onClipTransformChange,
  onClipTransformReset,
  onClipCropChange,
  onClipCropReset,
  onTextClipChange,
  onAudioClipChange,
  onAudioClipReset,
  onTransitionChange,
  onTransitionRemove,
  onClipDelete,
  onProjectAspectChange,
  onOpenReplaceSlotMedia,
}) => {
  const storeUpdateTransform = useEditorStore((s) => s.updateClipTransform);
  const storeResetTransform = useEditorStore((s) => s.resetClipTransform);
  const storeUpdateCrop = useEditorStore((s) => s.updateClipCrop);
  const storeResetCrop = useEditorStore((s) => s.resetClipCrop);
  const storeUpdateTextClip = useEditorStore((s) => s.updateTextClip);
  const storeUpdateAudioClip = useEditorStore((s) => s.updateAudioClip);
  const storeResetAudioClip = useEditorStore((s) => s.resetAudioClipAudioSettings);
  const storeDeleteClip = useEditorStore((s) => s.deleteClip);
  const storeTimeline = useEditorStore((s) => s.timeline);
  const storeSelectedTransitionId = useEditorStore((s) => s.selectedTransitionId);
  const storeUpdateTransition = useEditorStore((s) => s.updateTransition);
  const storeRemoveTransition = useEditorStore((s) => s.removeTransition);

  const selectedTransition = React.useMemo(() => {
    if (selectedTransitionProp) return selectedTransitionProp;
    if (!storeSelectedTransitionId || !storeTimeline) return null;
    const all = collectTimelineTransitions(storeTimeline);
    return all.find((t) => t.id === storeSelectedTransitionId) || null;
  }, [selectedTransitionProp, storeSelectedTransitionId, storeTimeline]);

  const [pendingTransitionType, setPendingTransitionType] = React.useState<BasicTransitionType>('crossfade');
  const [pendingDurationMs, setPendingDurationMs] = React.useState<number>(500);

  React.useEffect(() => {
    if (selectedTransition) {
      setPendingTransitionType(selectedTransition.type);
      setPendingDurationMs(selectedTransition.durationMs);
    }
  }, [selectedTransition?.id, selectedTransition?.type, selectedTransition?.durationMs]);

  const applyTransformUpdate = (updates: ClipTransformUpdate) => {
    if (!selectedClip) return;
    if (onClipTransformChange) {
      onClipTransformChange(selectedClip.id, updates);
    } else {
      storeUpdateTransform(selectedClip.id, updates);
    }
  };

  const handleResetTransform = () => {
    if (!selectedClip) return;
    if (onClipTransformReset) {
      onClipTransformReset(selectedClip.id);
    } else {
      storeResetTransform(selectedClip.id);
    }
  };

  const applyCropUpdate = (updates: ClipCropUpdate) => {
    if (!selectedClip) return;
    if (onClipCropChange) {
      onClipCropChange(selectedClip.id, updates);
    } else {
      storeUpdateCrop(selectedClip.id, updates);
    }
  };

  const handleResetCrop = () => {
    if (!selectedClip) return;
    if (onClipCropReset) {
      onClipCropReset(selectedClip.id);
    } else {
      storeResetCrop(selectedClip.id);
    }
  };

  const applyTextUpdate = (updates: TextClipUpdate) => {
    if (!selectedClip) return;
    if (onTextClipChange) {
      onTextClipChange(selectedClip.id, updates);
    } else {
      storeUpdateTextClip(selectedClip.id, updates);
    }
  };

  const applyAudioUpdate = (updates: AudioClipUpdate) => {
    if (!selectedClip) return;
    if (onAudioClipChange) {
      onAudioClipChange(selectedClip.id, updates);
    } else {
      storeUpdateAudioClip(selectedClip.id, updates);
    }
  };

  const handleResetAudio = () => {
    if (!selectedClip) return;
    if (onAudioClipReset) {
      onAudioClipReset(selectedClip.id);
    } else {
      storeResetAudioClip(selectedClip.id);
    }
  };

  const handleDeleteClip = () => {
    if (!selectedClip) return;
    if (onClipDelete) {
      onClipDelete(selectedClip.id);
    } else {
      storeDeleteClip(selectedClip.id);
    }
  };

  const applyTransitionUpdate = (updates: ClipTransitionUpdate) => {
    if (!selectedTransition) return;
    if (onTransitionChange) {
      onTransitionChange(selectedTransition.id, updates);
    } else {
      storeUpdateTransition(selectedTransition.id, updates);
    }
  };

  const handleRemoveTransition = () => {
    if (!selectedTransition) return;
    if (onTransitionRemove) {
      onTransitionRemove(selectedTransition.id);
    } else {
      storeRemoveTransition(selectedTransition.id);
    }
  };

  const transitionPairInfo = React.useMemo(() => {
    if (!selectedTransition || !storeTimeline?.tracks) return null;
    for (const track of storeTimeline.tracks) {
      const fromClip = (track.clips || []).find((c) => c.id === selectedTransition.fromClipId);
      const toClip = (track.clips || []).find((c) => c.id === selectedTransition.toClipId);
      if (fromClip && toClip) {
        return {
          fromClip,
          toClip,
          maxDurationMs: getMaxTransitionDurationMs(fromClip, toClip),
        };
      }
    }
    return null;
  }, [selectedTransition, storeTimeline]);

  const clipTransform = selectedClip ? normalizeClipTransform(selectedClip.transform) : null;
  const clipCrop = selectedClip ? normalizeClipCrop(selectedClip.crop) : null;
  const clipTextProps =
    selectedClip && selectedClip.clipType === 'text'
      ? normalizeTextClipProperties(selectedClip)
      : null;
  const clipDurationMs = selectedClip
    ? Math.max(0, Number(selectedClip.endTimeMs ?? 0) - Number(selectedClip.startTimeMs ?? 0))
    : 0;
  const clipAudioProps =
    selectedClip && selectedClip.clipType === 'audio'
      ? normalizeAudioClipProperties(selectedClip, clipDurationMs)
      : null;
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const handleStartSecChange = (valStr: string) => {
    if (!selectedClip || !onClipTimingChange) return;
    const valSec = parseFloat(valStr);
    if (!isNaN(valSec) && valSec >= 0) {
      const newStartMs = Math.round(valSec * 1000);
      const durationMs = Math.max(500, selectedClip.endTimeMs - selectedClip.startTimeMs);
      onClipTimingChange(selectedClip.id, newStartMs, newStartMs + durationMs);
    }
  };

  const handleEndSecChange = (valStr: string) => {
    if (!selectedClip || !onClipTimingChange) return;
    const valSec = parseFloat(valStr);
    if (!isNaN(valSec)) {
      const newEndMs = Math.max(selectedClip.startTimeMs + 200, Math.round(valSec * 1000));
      onClipTimingChange(selectedClip.id, selectedClip.startTimeMs, newEndMs);
    }
  };

  return (
    <Surface level={2} className="h-full flex flex-col border-l border-[#292B2D] overflow-y-auto select-none bg-[#0B0C0D]">
      {/* Inspector Header */}
      <div className="p-3.5 border-b border-[#292B2D] flex items-center gap-2 shrink-0">
        <Settings className="w-4 h-4 text-[#C7C9CC]" />
        <h3 className="text-xs font-semibold text-white tracking-tight">Inspector</h3>
      </div>

      <div className="p-4 space-y-5 flex-1">
        {selectedTransition ? (
          <div
            data-testid="inspector-transition-section"
            className="space-y-4"
          >
            <div>
              <div className="text-[10px] font-mono text-[#C7C9CC] uppercase tracking-wider mb-1">
                Clip Transition
              </div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-[#C7C9CC]" />
                <span className="capitalize">{selectedTransition.type}</span>
              </h4>
              <div className="text-[10px] font-mono text-zinc-400 mt-1">
                {transitionPairInfo
                  ? `${transitionPairInfo.fromClip.name} → ${transitionPairInfo.toClip.name}`
                  : `${selectedTransition.fromClipId} → ${selectedTransition.toClipId}`}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#141516] border border-[#292B2D] space-y-3.5 text-xs">
              {/* Transition Type: Cut / Crossfade */}
              <div className="space-y-1.5">
                <span className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  Transition Type
                </span>
                <div className="grid grid-cols-2 gap-1.5 bg-[#080909] p-1 rounded border border-[#292B2D]">
                  {(['cut', 'crossfade'] as const).map((tType) => {
                    const isActive = pendingTransitionType === tType;
                    return (
                      <button
                        key={tType}
                        type="button"
                        data-testid={`transition-type-${tType}-btn`}
                        onClick={() => {
                          setPendingTransitionType(tType);
                          applyTransitionUpdate({ type: tType });
                        }}
                        className={`py-1.5 px-2 rounded text-[11px] font-mono capitalize transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#252628] text-white border border-[#3A3C3F] font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {tType === 'cut' ? 'Cut' : 'Crossfade'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration in milliseconds */}
              <label className="block space-y-1">
                <div className="flex justify-between items-center text-zinc-400">
                  <span className="text-[11px]">Duration (ms)</span>
                  <input
                    type="number"
                    min="1"
                    max={transitionPairInfo?.maxDurationMs || 10000}
                    step="50"
                    data-testid="transition-duration-input"
                    value={pendingDurationMs}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!Number.isNaN(val)) {
                        setPendingDurationMs(val);
                        applyTransitionUpdate({ durationMs: val });
                      }
                    }}
                    className="w-24 px-2 py-1 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                  />
                </div>
                {transitionPairInfo && (
                  <div className="text-[10px] font-mono text-zinc-500 text-right">
                    Max boundary: {transitionPairInfo.maxDurationMs}ms
                  </div>
                )}
              </label>

              {/* Actions: Update & Remove */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#292B2D]">
                <button
                  type="button"
                  data-testid="transition-update-btn"
                  onClick={() =>
                    applyTransitionUpdate({
                      type: pendingTransitionType,
                      durationMs: pendingDurationMs,
                    })
                  }
                  className="py-1.5 px-2.5 rounded bg-[#252628] hover:bg-[#2D2E30] text-[#F2F2F0] border border-[#3A3C3F] hover:border-[#686B70] text-xs font-medium transition-colors cursor-pointer"
                >
                  Update
                </button>
                <button
                  type="button"
                  data-testid="transition-remove-btn"
                  onClick={handleRemoveTransition}
                  className="py-1.5 px-2.5 rounded bg-[#141516] hover:bg-rose-950/30 text-rose-400 hover:text-rose-300 border border-rose-900/40 text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          </div>
        ) : selectedClip ? (
          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-mono text-[#C7C9CC] uppercase tracking-wider mb-1">
                Timeline Clip
              </div>
              <h4 className="text-xs font-bold text-white break-words" title={selectedClip.name}>
                {selectedClip.name}
              </h4>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-[10px] font-mono border-[#3A3C3F] bg-[#141516] text-[#C7C9CC] capitalize">
                  {selectedClip.clipType}
                </Badge>
                {selectedTrack && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1B1C1E] text-[#C7C9CC] border border-[#3A3C3F]">
                    Track: {selectedTrack.name}
                  </span>
                )}
              </div>
            </div>

            {/* Template Slot Binding & Quick Replacement */}
            {selectedClip.slotBinding && (
              <div className="p-3 rounded-lg bg-[#141516] border border-[#3A3C3F] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Template Slot
                  </span>
                  <span className="text-[10px] font-mono text-[#C7C9CC] bg-[#1B1C1E] px-1.5 py-0.5 rounded border border-[#292B2D]">
                    {selectedClip.slotBinding}
                  </span>
                </div>

                <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                  <span>Assigned Media:</span>
                  <span className="font-mono text-zinc-300">
                    {selectedClip.mediaAssetId ? 'Asset Attached' : 'Unassigned'}
                  </span>
                </div>

                {onOpenReplaceSlotMedia && (
                  <button
                    type="button"
                    onClick={() => onOpenReplaceSlotMedia(selectedClip.slotBinding)}
                    className="w-full py-1.5 px-2.5 rounded bg-[#252628] hover:bg-[#2D2E30] text-[#F2F2F0] border border-[#3A3C3F] hover:border-[#686B70] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#C7C9CC]" />
                    <span>Replace Slot Media</span>
                  </button>
                )}
              </div>
            )}

            <div className="p-3 rounded-lg bg-[#141516] border border-[#292B2D] space-y-3 text-xs">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-500" /> Start (sec):
                </span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={(selectedClip.startTimeMs / 1000).toFixed(2)}
                  key={`start-${selectedClip.id}-${selectedClip.startTimeMs}`}
                  onBlur={(e) => handleStartSecChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleStartSecChange((e.target as HTMLInputElement).value);
                  }}
                  className="w-20 px-2 py-0.5 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                />
              </div>
              <div className="flex justify-between items-center text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-500" /> End (sec):
                </span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  defaultValue={(selectedClip.endTimeMs / 1000).toFixed(2)}
                  key={`end-${selectedClip.id}-${selectedClip.endTimeMs}`}
                  onBlur={(e) => handleEndSecChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEndSecChange((e.target as HTMLInputElement).value);
                  }}
                  className="w-20 px-2 py-0.5 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                />
              </div>
              <div className="flex justify-between items-center text-zinc-400 pt-1 border-t border-[#292B2D]">
                <span>Duration:</span>
                <span className="font-mono text-zinc-200">
                  {((selectedClip.endTimeMs - selectedClip.startTimeMs) / 1000).toFixed(2)}s
                </span>
              </div>
            </div>

            {/* Phase 9E: Text Clip Inspector Controls */}
            {clipTextProps && selectedClip.clipType === 'text' && (
              <div
                data-testid="inspector-text-section"
                className="p-3 rounded-lg bg-[#141516] border border-[#292B2D] space-y-3 text-xs"
              >
                <div className="flex items-center justify-between pb-1 border-b border-[#292B2D]">
                  <span className="text-[10px] font-mono text-[#C7C9CC] uppercase tracking-wider flex items-center gap-1.5">
                    <Type className="w-3 h-3 text-[#C7C9CC]" />
                    Text Overlay
                  </span>
                </div>

                {/* Text Content */}
                <label className="block space-y-1">
                  <span className="block text-[10px] text-zinc-400 font-mono">Text Content</span>
                  <textarea
                    rows={2}
                    data-testid="text-content-input"
                    value={clipTextProps.textContent}
                    onChange={(e) => applyTextUpdate({ textContent: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs text-zinc-100 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70] resize-none"
                  />
                </label>

                {/* Font Size & Font Weight */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Font Size (px)</span>
                    <input
                      type="number"
                      min={MIN_FONT_SIZE}
                      max={MAX_FONT_SIZE}
                      step="1"
                      data-testid="text-font-size-input"
                      value={clipTextProps.fontSize}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyTextUpdate({ fontSize: val });
                      }}
                      className="w-full px-2 py-1 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Font Weight</span>
                    <select
                      data-testid="text-font-weight-select"
                      value={String(clipTextProps.fontWeight)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = Number(raw);
                        applyTextUpdate({ fontWeight: Number.isNaN(num) ? raw : num });
                      }}
                      className="w-full px-2 py-1 font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    >
                      <option value="400">400 Regular</option>
                      <option value="500">500 Medium</option>
                      <option value="600">600 Semibold</option>
                      <option value="700">700 Bold</option>
                      <option value="800">800 ExtraBold</option>
                    </select>
                  </label>
                </div>

                {/* Alignment & Color */}
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Alignment</span>
                    <div className="flex items-center gap-1 bg-[#080909] border border-[#3A3C3F] rounded p-0.5">
                      {(['left', 'center', 'right'] as const).map((align) => (
                        <button
                          key={align}
                          type="button"
                          data-testid={`text-align-${align}-btn`}
                          onClick={() => applyTextUpdate({ textAlign: align, alignment: align })}
                          aria-label={`Align text ${align}`}
                          className={`flex-1 py-1 rounded flex items-center justify-center transition-colors cursor-pointer ${
                            clipTextProps.textAlign === align
                              ? 'bg-[#252628] text-white'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {align === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                          {align === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                          {align === 'right' && <AlignRight className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Color</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        data-testid="text-color-picker"
                        value={clipTextProps.color.startsWith('#') ? clipTextProps.color : '#FFFFFF'}
                        onChange={(e) => applyTextUpdate({ color: e.target.value })}
                        className="w-7 h-7 rounded bg-[#080909] border border-[#3A3C3F] cursor-pointer p-0.5 shrink-0"
                      />
                      <input
                        type="text"
                        data-testid="text-color-input"
                        value={clipTextProps.color}
                        onChange={(e) => applyTextUpdate({ color: e.target.value })}
                        className="w-full px-1.5 py-1 font-mono text-[11px] text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                      />
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Phase 9C: Clip Transform Controls */}
            {clipTransform && selectedClip.clipType !== 'audio' && (
              <div
                data-testid="inspector-transform-section"
                className="p-3 rounded-lg bg-[#141516] border border-[#292B2D] space-y-3 text-xs"
              >
                <div className="flex items-center justify-between pb-1 border-b border-[#292B2D]">
                  <span className="text-[10px] font-mono text-[#C7C9CC] uppercase tracking-wider flex items-center gap-1.5">
                    <Move className="w-3 h-3 text-[#C7C9CC]" />
                    Transform
                  </span>
                  <button
                    type="button"
                    data-testid="inspector-reset-transform-btn"
                    onClick={handleResetTransform}
                    title="Reset Position, Scale, Rotation, and Opacity"
                    className="px-2 py-0.5 rounded bg-[#1B1C1E] hover:bg-[#252628] border border-[#3A3C3F] text-[10px] font-mono text-[#C7C9CC] hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset Transform</span>
                  </button>
                </div>

                {/* Position X & Position Y */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Position X (px)</span>
                    <input
                      type="number"
                      step="1"
                      data-testid="transform-position-x-input"
                      value={clipTransform.x}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyTransformUpdate({ x: val, positionX: val });
                      }}
                      className="w-full px-2 py-1 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Position Y (px)</span>
                    <input
                      type="number"
                      step="1"
                      data-testid="transform-position-y-input"
                      value={clipTransform.y}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyTransformUpdate({ y: val, positionY: val });
                      }}
                      className="w-full px-2 py-1 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </label>
                </div>

                {/* Scale */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span className="text-[11px]">Scale</span>
                    <input
                      type="number"
                      step="0.05"
                      min={MIN_CLIP_SCALE}
                      data-testid="transform-scale-input"
                      value={clipTransform.scale}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyTransformUpdate({ scale: val });
                      }}
                      className="w-20 px-2 py-0.5 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.05"
                    aria-label="Clip Scale"
                    value={Math.min(3, Math.max(0.1, clipTransform.scale))}
                    onChange={(e) => applyTransformUpdate({ scale: parseFloat(e.target.value) })}
                    className="w-full accent-[#C7C9CC] cursor-pointer h-1.5 bg-[#080909] rounded-lg"
                  />
                </div>

                {/* Rotation */}
                <div className="flex justify-between items-center text-zinc-400">
                  <span className="text-[11px]">Rotation (deg)</span>
                  <input
                    type="number"
                    step="1"
                    data-testid="transform-rotation-input"
                    value={clipTransform.rotation}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!Number.isNaN(val)) applyTransformUpdate({ rotation: val });
                    }}
                    className="w-20 px-2 py-0.5 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                  />
                </div>

                {/* Opacity */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span className="text-[11px]">Opacity</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      data-testid="transform-opacity-input"
                      value={clipTransform.opacity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyTransformUpdate({ opacity: val });
                      }}
                      className="w-20 px-2 py-0.5 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    aria-label="Clip Opacity"
                    value={clipTransform.opacity}
                    onChange={(e) => applyTransformUpdate({ opacity: parseFloat(e.target.value) })}
                    className="w-full accent-[#C7C9CC] cursor-pointer h-1.5 bg-[#080909] rounded-lg"
                  />
                </div>
              </div>
            )}

            {/* Phase 9D: Clip Crop & Visual Framing Controls */}
            {clipCrop && selectedClip.clipType !== 'audio' && (
              <div
                data-testid="inspector-crop-section"
                className="p-3 rounded-lg bg-[#141516] border border-[#292B2D] space-y-3 text-xs"
              >
                <div className="flex items-center justify-between pb-1 border-b border-[#292B2D]">
                  <span className="text-[10px] font-mono text-[#C7C9CC] uppercase tracking-wider flex items-center gap-1.5">
                    <Crop className="w-3 h-3 text-[#C7C9CC]" />
                    Crop
                  </span>
                  <button
                    type="button"
                    data-testid="inspector-reset-crop-btn"
                    onClick={handleResetCrop}
                    title="Reset Crop Top, Right, Bottom, and Left to 0"
                    className="px-2 py-0.5 rounded bg-[#1B1C1E] hover:bg-[#252628] border border-[#3A3C3F] text-[10px] font-mono text-[#C7C9CC] hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset Crop</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Top (0–1)</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max={MAX_COMBINED_AXIS_CROP}
                      data-testid="crop-top-input"
                      value={clipCrop.top}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyCropUpdate({ top: val });
                      }}
                      className="w-full px-2 py-1 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Right (0–1)</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max={MAX_COMBINED_AXIS_CROP}
                      data-testid="crop-right-input"
                      value={clipCrop.right}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyCropUpdate({ right: val });
                      }}
                      className="w-full px-2 py-1 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Bottom (0–1)</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max={MAX_COMBINED_AXIS_CROP}
                      data-testid="crop-bottom-input"
                      value={clipCrop.bottom}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyCropUpdate({ bottom: val });
                      }}
                      className="w-full px-2 py-1 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Left (0–1)</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max={MAX_COMBINED_AXIS_CROP}
                      data-testid="crop-left-input"
                      value={clipCrop.left}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyCropUpdate({ left: val });
                      }}
                      className="w-full px-2 py-1 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Phase 9F: Audio Clip Inspector Controls */}
            {clipAudioProps && selectedClip.clipType === 'audio' && (
              <div
                data-testid="inspector-audio-section"
                className="p-3 rounded-lg bg-[#141516] border border-[#292B2D] space-y-3 text-xs"
              >
                <div className="flex items-center justify-between pb-1 border-b border-[#292B2D]">
                  <span className="text-[10px] font-mono text-[#C7C9CC] uppercase tracking-wider flex items-center gap-1.5">
                    {clipAudioProps.muted ? (
                      <VolumeX className="w-3 h-3 text-rose-400" />
                    ) : (
                      <Volume2 className="w-3 h-3 text-[#C7C9CC]" />
                    )}
                    Audio
                  </span>
                  <button
                    type="button"
                    data-testid="inspector-reset-audio-btn"
                    onClick={handleResetAudio}
                    title="Reset Audio Volume, Mute, Fade In, and Fade Out"
                    className="px-2 py-0.5 rounded bg-[#1B1C1E] hover:bg-[#252628] border border-[#3A3C3F] text-[10px] font-mono text-[#C7C9CC] hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset Audio Settings</span>
                  </button>
                </div>

                {/* Volume Control */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span className="text-[11px]">Volume</span>
                    <input
                      type="number"
                      step="0.05"
                      min={MIN_AUDIO_VOLUME}
                      max={MAX_AUDIO_VOLUME}
                      data-testid="audio-volume-input"
                      value={clipAudioProps.volume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyAudioUpdate({ volume: val });
                      }}
                      className="w-20 px-2 py-0.5 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </div>
                  <input
                    type="range"
                    min={MIN_AUDIO_VOLUME}
                    max={MAX_AUDIO_VOLUME}
                    step="0.05"
                    data-testid="audio-volume-slider"
                    aria-label="Audio Clip Volume"
                    value={clipAudioProps.volume}
                    onChange={(e) => applyAudioUpdate({ volume: parseFloat(e.target.value) })}
                    className="w-full accent-[#C7C9CC] cursor-pointer h-1.5 bg-[#080909] rounded-lg"
                  />
                </div>

                {/* Mute Toggle */}
                <div className="flex justify-between items-center text-zinc-400">
                  <span className="text-[11px]">Mute Audio</span>
                  <button
                    type="button"
                    data-testid="audio-mute-toggle"
                    aria-pressed={clipAudioProps.muted}
                    onClick={() => applyAudioUpdate({ muted: !clipAudioProps.muted })}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono border flex items-center gap-1.5 transition-colors cursor-pointer ${
                      clipAudioProps.muted
                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                        : 'bg-[#080909] border-[#3A3C3F] text-zinc-300 hover:border-[#686B70]'
                    }`}
                  >
                    {clipAudioProps.muted ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Muted</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Unmuted</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Fade In & Fade Out (ms) */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Fade In (ms)</span>
                    <input
                      type="number"
                      step="100"
                      min="0"
                      max={clipDurationMs > 0 ? clipDurationMs : undefined}
                      data-testid="audio-fade-in-input"
                      value={clipAudioProps.fadeInMs}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyAudioUpdate({ fadeInMs: val });
                      }}
                      className="w-full px-2 py-1 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="block text-[10px] text-zinc-400 font-mono">Fade Out (ms)</span>
                    <input
                      type="number"
                      step="100"
                      min="0"
                      max={clipDurationMs > 0 ? clipDurationMs : undefined}
                      data-testid="audio-fade-out-input"
                      value={clipAudioProps.fadeOutMs}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) applyAudioUpdate({ fadeOutMs: val });
                      }}
                      className="w-full px-2 py-1 text-right font-mono text-zinc-200 bg-[#080909] border border-[#3A3C3F] rounded outline-none focus:border-[#686B70]"
                    />
                  </label>
                </div>
              </div>
            )}

            <button
              type="button"
              data-testid="inspector-delete-clip-btn"
              onClick={handleDeleteClip}
              aria-label={`Delete clip ${selectedClip.name}`}
              className="w-full py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-rose-900/40 rounded transition-colors cursor-pointer"
            >
              Delete Clip
            </button>
          </div>
        ) : selectedAsset ? (
          <div className="space-y-4">
            {/* Selected Asset Header */}
            <div>
              <div className="text-[10px] font-mono text-[#C7C9CC] uppercase tracking-wider mb-1">
                Asset Metadata
              </div>
              <h4 className="text-xs font-bold text-white break-words" title={selectedAsset.originalFilename}>
                {selectedAsset.originalFilename}
              </h4>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-[10px] font-mono border-[#3A3C3F] bg-[#141516] text-[#C7C9CC]">
                  {selectedAsset.mimeType}
                </Badge>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">
                  {selectedAsset.ingestionStatus}
                </span>
              </div>
            </div>

            {/* Factual Technical Parameters */}
            <div className="p-3 rounded-lg bg-[#141516] border border-[#292B2D] space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-zinc-500" /> File Size:
                </span>
                <span className="font-mono text-zinc-200">{formatBytes(selectedAsset.fileSizeBytes)}</span>
              </div>

              {selectedAsset.durationMs !== undefined && selectedAsset.durationMs !== null && (
                <div className="flex justify-between items-center text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" /> Duration:
                  </span>
                  <span className="font-mono text-zinc-200">{(selectedAsset.durationMs / 1000).toFixed(2)}s</span>
                </div>
              )}

              {selectedAsset.width && selectedAsset.height && (
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Dimensions:</span>
                  <span className="font-mono text-zinc-200">{selectedAsset.width} × {selectedAsset.height}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-zinc-400">
                <span>Audio Track:</span>
                <span className="font-mono text-zinc-200">{selectedAsset.hasAudio ? 'Yes' : 'No'}</span>
              </div>

              <div className="flex justify-between items-center text-zinc-400">
                <span>Created:</span>
                <span className="font-mono text-[11px] text-zinc-300">
                  {new Date(selectedAsset.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#141516] border border-[#292B2D] space-y-1 text-[11px]">
              <div className="text-zinc-500 font-mono text-[10px]">Storage Key:</div>
              <div className="text-zinc-400 font-mono break-all text-[10px]">
                {selectedAsset.storageKey}
              </div>
            </div>
          </div>
        ) : (
          /* Empty Asset Selection - Show Project Defaults */
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-[#141516] border border-[#292B2D] space-y-2 text-center text-zinc-500">
              <Info className="w-5 h-5 mx-auto text-zinc-600" />
              <div className="text-xs font-medium text-zinc-400">No Asset Selected</div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Select an asset in the media library to inspect technical parameters.
              </p>
            </div>

            <div>
              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
                Project Parameters
              </div>
              <div className="p-3 rounded-lg bg-[#141516] border border-[#292B2D] space-y-2 text-xs">
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Target Format:</span>
                  {onProjectAspectChange ? (
                    <select
                      value={projectMetadata.aspectRatio}
                      onChange={(e) => onProjectAspectChange(e.target.value)}
                      className="bg-[#080909] text-zinc-200 border border-[#3A3C3F] rounded px-1.5 py-0.5 text-xs outline-none focus:border-[#686B70]"
                    >
                      <option value="16:9">16:9 Landscape</option>
                      <option value="9:16">9:16 Vertical</option>
                      <option value="1:1">1:1 Square</option>
                    </select>
                  ) : (
                    <span className="font-mono text-zinc-200">{projectMetadata.aspectRatio}</span>
                  )}
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Resolution:</span>
                  <span className="font-mono text-zinc-200">{projectMetadata.resolution}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Timeline Rate:</span>
                  <span className="font-mono text-zinc-200">{projectMetadata.fps} fps</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-[#292B2D] text-[10px] text-zinc-500 bg-[#080909] shrink-0">
        <span>Factual metadata from PostgreSQL + R2</span>
      </div>
    </Surface>
  );
};
