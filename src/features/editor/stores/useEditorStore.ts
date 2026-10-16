import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Project, Timeline } from '@/src/types';
import { buildClientCanonicalSnapshot, computeClientStateString } from '../utils/projectSnapshot';
import {
  DEFAULT_SNAP_THRESHOLD_MS,
  MIN_CLIP_DURATION_MS,
  clampPlayheadMs,
  collectSnapTargetsMs,
  getEffectiveTimelineDurationMs,
  getPixelsPerSecond,
  snapClipMoveMs,
  snapTimeMs,
} from '../utils/timelinePrecision';
import {
  type ClipTransformUpdate,
  DEFAULT_CLIP_TRANSFORM,
  mergeClipTransform,
  normalizeClipTransform,
} from '../utils/clipTransform';
import {
  type ClipCropUpdate,
  DEFAULT_CLIP_CROP,
  mergeClipCrop,
  normalizeClipCrop,
} from '../utils/clipCrop';
import {
  type TextClipUpdate,
  applyTextClipUpdates,
  createCanonicalTextClip,
  DEFAULT_TEXT_DURATION_MS,
} from '../utils/textClip';
import {
  type AudioClipUpdate,
  applyAudioClipUpdates,
  resetAudioClipProperties,
} from '../utils/audioClip';
import type { BasicTransitionType, ClipTransition } from '@/src/types/timeline';
import {
  type ClipTransitionInput,
  type ClipTransitionUpdate,
  DEFAULT_TRANSITION_DURATION_MS,
  collectTimelineTransitions,
  isValidTransitionType,
  syncAndPruneTimelineTransitions,
  validateAdjacentClipTransition,
} from '../utils/clipTransition';

export interface TimelineEditOptions {
  snap?: boolean;
  snapThresholdMs?: number;
}

export interface EditorMediaAsset {
  id: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  ingestionStatus: string;
  hasAudio: boolean;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  thumbnailUrl?: string | null;
  waveformUrl?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
  previewUrl?: string | null;
  proxyPreviewUrl?: string | null;
  originalPreviewUrl?: string | null;
  thumbnailSignedUrl?: string | null;
  waveformData?: {
    assetId: string;
    sampleCount: number;
    durationMs: number;
    samples: number[];
  } | null;
  isSignedUrlLoading?: boolean;
}

export interface EditorState {
  // Project & Timeline Data (Persistent Authority: PostgreSQL)
  currentProject: any | null;
  timeline: Timeline | null;

  // Media Management
  projectMedia: EditorMediaAsset[];
  selectedMediaAsset: EditorMediaAsset | null;
  isMediaLoading: boolean;
  mediaError: string | null;

  // Persistence & Save State
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  lastSaveError: string | null;
  savedSnapshotString: string | null;

  // Playhead & Playback (Phase 6A foundations)
  currentTimeMs: number;
  isPlaying: boolean;
  playbackRate: number;
  isVideoDrivenPlayback: boolean;

  // UI & Selection Placeholders
  zoomLevel: number;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  selectedTransitionId: string | null;
  isSnappingEnabled: boolean;
  snapThresholdMs: number;

  // Actions
  setProject: (project: any, timeline?: any) => void;
  updateProjectMetadata: (updates: { name?: string; description?: string; aspectRatio?: string }) => void;
  setProjectMedia: (media: EditorMediaAsset[]) => void;
  selectMediaAsset: (asset: EditorMediaAsset | null) => void;
  updateMediaAssetPreviewUrl: (assetId: string, previewUrl: string) => void;
  updateMediaAssetDerivativeUrls: (
    assetId: string,
    urls: {
      previewUrl?: string | null;
      proxyPreviewUrl?: string | null;
      originalPreviewUrl?: string | null;
      thumbnailSignedUrl?: string | null;
    },
  ) => void;
  updateMediaAssetWaveform: (assetId: string, waveformData: EditorMediaAsset['waveformData']) => void;
  setMediaLoading: (loading: boolean) => void;
  setMediaError: (error: string | null) => void;
  markDirty: (dirty?: boolean) => void;
  setSaving: (saving: boolean) => void;
  setSaveError: (error: string | null) => void;
  recordSaved: (savedStateString?: string) => void;
  addClipToTrack: (trackId: string, clipData: any) => void;
  addTextClip: (options?: Partial<Parameters<typeof createCanonicalTextClip>[0]>) => string | null;
  updateTextClip: (clipIdOrUpdates: string | TextClipUpdate, updates?: TextClipUpdate) => void;
  updateAudioClip: (clipIdOrUpdates: string | AudioClipUpdate, updates?: AudioClipUpdate) => void;
  resetAudioClipAudioSettings: (clipId?: string) => void;
  updateClipTiming: (clipId: string, startTimeMs: number, endTimeMs: number) => void;
  updateClipTransform: (clipIdOrUpdates: string | ClipTransformUpdate, updates?: ClipTransformUpdate) => void;
  resetClipTransform: (clipId?: string) => void;
  updateClipCrop: (clipIdOrUpdates: string | ClipCropUpdate, updates?: ClipCropUpdate) => void;
  resetClipCrop: (clipId?: string) => void;
  moveClip: (clipId: string, newStartTimeMs: number, options?: TimelineEditOptions) => void;
  trimClipStart: (clipId: string, newStartTimeMs: number, options?: TimelineEditOptions) => void;
  trimClipEnd: (clipId: string, newEndTimeMs: number, options?: TimelineEditOptions) => void;
  splitClip: (clipId?: string, splitTimeMs?: number) => void;
  deleteClip: (clipId?: string) => void;
  removeClip: (clipId: string) => void;
  addTransition: (
    inputOrFromClipId: ClipTransitionInput | string,
    toClipId?: string,
    type?: BasicTransitionType,
    durationMs?: number,
  ) => string | null;
  updateTransition: (
    transitionIdOrUpdates: string | ClipTransitionUpdate,
    updates?: ClipTransitionUpdate,
  ) => boolean;
  removeTransition: (transitionId?: string) => void;
  resetTransition: (transitionId?: string) => void;
  selectTransition: (transitionId: string | null) => void;
  setCurrentTimeMs: (timeMs: number) => void;
  togglePlayback: () => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setIsVideoDrivenPlayback: (driven: boolean) => void;
  setZoomLevel: (zoom: number) => void;
  selectClip: (clipId: string | null) => void;
  selectTrack: (trackId: string | null) => void;
  selectClipAndTrack: (clipId: string | null, trackId: string | null) => void;
  toggleSnapping: () => void;
  setSnapThresholdMs: (thresholdMs: number) => void;
  resetEditor: () => void;
}

function calculateCurrentSnapshotString(state: any): string | null {
  if (!state.currentProject) return null;
  const snapshot = buildClientCanonicalSnapshot({
    projectId: state.currentProject.id,
    name: state.currentProject.name,
    aspectRatio: state.currentProject.aspectRatio,
    resolution: state.currentProject.resolution || '1080p',
    fps: state.currentProject.fps || 30,
    durationMs: state.timeline?.totalDurationMs || state.currentProject.durationMs || 0,
    tracks: state.timeline?.tracks || [],
    transitions: state.timeline?.transitions || [],
  });
  return computeClientStateString(snapshot);
}

export const useEditorStore = create<EditorState>()(
  immer((set, get) => ({
    currentProject: null,
    timeline: null,
    projectMedia: [],
    selectedMediaAsset: null,
    isMediaLoading: false,
    mediaError: null,
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
    lastSaveError: null,
    savedSnapshotString: null,
    currentTimeMs: 0,
    isPlaying: false,
    playbackRate: 1.0,
    isVideoDrivenPlayback: false,
    zoomLevel: 50,
    selectedTrackId: null,
    selectedClipId: null,
    selectedTransitionId: null,
    isSnappingEnabled: true,
    snapThresholdMs: DEFAULT_SNAP_THRESHOLD_MS,

    setProject: (project, timeline = null) => {
      set((state) => {
        state.currentProject = project ? JSON.parse(JSON.stringify(project)) : null;
        state.timeline = timeline ? JSON.parse(JSON.stringify(timeline)) : null;
        if (state.timeline) {
          syncAndPruneTimelineTransitions(state.timeline);
        }
        state.selectedMediaAsset = null;
        state.isDirty = false;
        state.isSaving = false;
        state.lastSaveError = null;
        state.currentTimeMs = 0;
        state.isPlaying = false;
        state.isVideoDrivenPlayback = false;
        state.selectedClipId = null;
        state.selectedTrackId = null;
        state.selectedTransitionId = null;
        state.savedSnapshotString = calculateCurrentSnapshotString(state);
      });
    },

    updateProjectMetadata: (updates) => {
      set((state) => {
        if (!state.currentProject) return;
        if (updates.name !== undefined) state.currentProject.name = updates.name.trim();
        if (updates.description !== undefined) state.currentProject.description = updates.description;
        if (updates.aspectRatio !== undefined) state.currentProject.aspectRatio = updates.aspectRatio;

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    setProjectMedia: (media) => {
      set((state) => {
        // Preserve already-fetched signed URLs and waveform data across refreshes
        const existingById = new Map(state.projectMedia.map((m) => [m.id, m]));
        state.projectMedia = media.map((incoming) => {
          const prev = existingById.get(incoming.id);
          if (!prev) return incoming;
          return {
            ...incoming,
            previewUrl: incoming.previewUrl ?? prev.previewUrl ?? null,
            proxyPreviewUrl: incoming.proxyPreviewUrl ?? prev.proxyPreviewUrl ?? null,
            originalPreviewUrl: incoming.originalPreviewUrl ?? prev.originalPreviewUrl ?? null,
            thumbnailSignedUrl: incoming.thumbnailSignedUrl ?? prev.thumbnailSignedUrl ?? null,
            waveformData: incoming.waveformData ?? prev.waveformData ?? null,
          };
        });
        // Keep selectedMediaAsset reference in sync if it exists
        if (state.selectedMediaAsset) {
          const matched = state.projectMedia.find((m) => m.id === state.selectedMediaAsset?.id);
          if (matched) {
            state.selectedMediaAsset = matched;
          }
        }
      });
    },

    selectMediaAsset: (asset) => {
      set((state) => {
        state.selectedMediaAsset = asset;
      });
    },

    updateMediaAssetPreviewUrl: (assetId, previewUrl) => {
      set((state) => {
        const asset = state.projectMedia.find((m) => m.id === assetId);
        if (asset) {
          asset.previewUrl = previewUrl;
          if (!asset.originalPreviewUrl) asset.originalPreviewUrl = previewUrl;
          asset.isSignedUrlLoading = false;
        }
        if (state.selectedMediaAsset?.id === assetId) {
          state.selectedMediaAsset.previewUrl = previewUrl;
          if (!state.selectedMediaAsset.originalPreviewUrl) {
            state.selectedMediaAsset.originalPreviewUrl = previewUrl;
          }
          state.selectedMediaAsset.isSignedUrlLoading = false;
        }
      });
    },

    updateMediaAssetDerivativeUrls: (assetId, urls) => {
      set((state) => {
        const applyUrls = (target: EditorMediaAsset) => {
          if (urls.previewUrl !== undefined) target.previewUrl = urls.previewUrl;
          if (urls.proxyPreviewUrl !== undefined) target.proxyPreviewUrl = urls.proxyPreviewUrl;
          if (urls.originalPreviewUrl !== undefined) target.originalPreviewUrl = urls.originalPreviewUrl;
          if (urls.thumbnailSignedUrl !== undefined) target.thumbnailSignedUrl = urls.thumbnailSignedUrl;
          target.isSignedUrlLoading = false;
        };
        const asset = state.projectMedia.find((m) => m.id === assetId);
        if (asset) applyUrls(asset);
        if (state.selectedMediaAsset?.id === assetId) applyUrls(state.selectedMediaAsset);
      });
    },

    updateMediaAssetWaveform: (assetId, waveformData) => {
      set((state) => {
        const asset = state.projectMedia.find((m) => m.id === assetId);
        if (asset) asset.waveformData = waveformData;
        if (state.selectedMediaAsset?.id === assetId) {
          state.selectedMediaAsset.waveformData = waveformData;
        }
      });
    },

    setMediaLoading: (loading) => {
      set((state) => {
        state.isMediaLoading = loading;
      });
    },

    setMediaError: (error) => {
      set((state) => {
        state.mediaError = error;
      });
    },

    markDirty: (dirty = true) => {
      set((state) => {
        state.isDirty = dirty;
      });
    },

    setSaving: (saving) => {
      set((state) => {
        state.isSaving = saving;
        if (saving) {
          state.lastSaveError = null;
        }
      });
    },

    setSaveError: (error) => {
      set((state) => {
        state.isSaving = false;
        state.lastSaveError = error;
      });
    },

    recordSaved: (savedStateString?: string) => {
      set((state) => {
        state.isSaving = false;
        state.lastSaveError = null;
        state.lastSavedAt = new Date().toISOString();

        if (savedStateString) {
          state.savedSnapshotString = savedStateString;
          // Check if user made concurrent changes while save was in-flight
          const currentStr = calculateCurrentSnapshotString(state);
          state.isDirty = currentStr !== savedStateString;
        } else {
          state.savedSnapshotString = calculateCurrentSnapshotString(state);
          state.isDirty = false;
        }
      });
    },

    addClipToTrack: (trackId: string, clipData: any) => {
      set((state) => {
        if (!state.timeline) return;
        const track = state.timeline.tracks.find((t) => t.id === trackId);
        if (!track) return;

        const newClip = {
          id: clipData.id || `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          trackId,
          name: clipData.name || 'New Clip',
          clipType: clipData.clipType || 'video',
          startTimeMs: clipData.startTimeMs ?? 0,
          endTimeMs: clipData.endTimeMs ?? ((clipData.startTimeMs ?? 0) + 5000),
          sourceStartMs: clipData.sourceStartMs ?? 0,
          sourceEndMs: clipData.sourceEndMs ?? 5000,
          mediaAssetId: clipData.mediaAssetId || null,
          transform: clipData.transform
            ? normalizeClipTransform(clipData.transform)
            : { ...DEFAULT_CLIP_TRANSFORM },
          crop: clipData.crop
            ? normalizeClipCrop(clipData.crop)
            : { ...DEFAULT_CLIP_CROP },
          audioProperties: clipData.audioProperties || null,
          textProperties: clipData.textProperties || null,
          captionProperties: clipData.captionProperties || null,
          transitions: clipData.transitions || null,
          effects: clipData.effects || [],
          animations: clipData.animations || [],
          slotBinding: clipData.slotBinding || null,
        };

        if (!track.clips) track.clips = [];
        track.clips.push(newClip as any);

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    addTextClip: (options) => {
      let createdId: string | null = null;
      set((state) => {
        if (!state.timeline) return;
        const tracks = state.timeline.tracks || [];

        // 1. Resolve target track using existing track system
        let targetTrack =
          options?.trackId
            ? tracks.find((t) => t.id === options.trackId && !t.isLocked)
            : undefined;

        if (!targetTrack) {
          targetTrack = tracks.find(
            (t) => (t.trackType === 'text' || t.trackType === 'overlay') && !t.isLocked,
          );
        }
        if (!targetTrack && state.selectedTrackId) {
          const selected = tracks.find((t) => t.id === state.selectedTrackId);
          if (selected && !selected.isLocked && selected.trackType !== 'audio') {
            targetTrack = selected;
          }
        }
        if (!targetTrack) {
          targetTrack = tracks.find((t) => !t.isLocked && t.trackType !== 'audio');
        }
        if (!targetTrack) {
          targetTrack = tracks.find((t) => !t.isLocked);
        }
        if (!targetTrack) return;

        const startTimeMs =
          options?.startTimeMs !== undefined
            ? Math.max(0, Math.round(options.startTimeMs))
            : Math.max(0, Math.round(state.currentTimeMs || 0));

        const durationMs =
          options?.durationMs !== undefined
            ? Math.max(100, Math.round(options.durationMs))
            : DEFAULT_TEXT_DURATION_MS;

        const newClip = createCanonicalTextClip({
          ...options,
          trackId: targetTrack.id,
          startTimeMs,
          durationMs,
        });

        if (!targetTrack.clips) targetTrack.clips = [];
        targetTrack.clips.push(newClip);
        targetTrack.clips.sort(
          (a, b) => a.startTimeMs - b.startTimeMs || String(a.id).localeCompare(String(b.id)),
        );

        state.selectedClipId = newClip.id;
        state.selectedTrackId = targetTrack.id;
        createdId = newClip.id;

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
      return createdId;
    },

    updateTextClip: (clipIdOrUpdates: string | TextClipUpdate, updates?: TextClipUpdate) => {
      set((state) => {
        if (!state.timeline) return;
        const targetClipId =
          typeof clipIdOrUpdates === 'string' ? clipIdOrUpdates : state.selectedClipId;
        const textUpdates =
          typeof clipIdOrUpdates === 'string' ? updates : clipIdOrUpdates;

        if (!targetClipId || !textUpdates) return;

        for (const track of state.timeline.tracks) {
          const clip = (track.clips || []).find((c) => c.id === targetClipId) as any;
          if (clip) {
            if (track.isLocked) return;
            applyTextClipUpdates(clip, textUpdates);
            break;
          }
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    updateAudioClip: (clipIdOrUpdates: string | AudioClipUpdate, updates?: AudioClipUpdate) => {
      set((state) => {
        if (!state.timeline) return;
        const targetClipId =
          typeof clipIdOrUpdates === 'string' ? clipIdOrUpdates : state.selectedClipId;
        const audioUpdates =
          typeof clipIdOrUpdates === 'string' ? updates : clipIdOrUpdates;

        if (!targetClipId || !audioUpdates) return;

        for (const track of state.timeline.tracks) {
          const clip = (track.clips || []).find((c) => c.id === targetClipId) as any;
          if (clip) {
            if (track.isLocked) return;
            applyAudioClipUpdates(clip, audioUpdates);
            break;
          }
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    resetAudioClipAudioSettings: (clipId?: string) => {
      set((state) => {
        if (!state.timeline) return;
        const targetClipId = clipId ?? state.selectedClipId;
        if (!targetClipId) return;

        for (const track of state.timeline.tracks) {
          const clip = (track.clips || []).find((c) => c.id === targetClipId) as any;
          if (clip) {
            if (track.isLocked) return;
            resetAudioClipProperties(clip);
            break;
          }
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    updateClipTiming: (clipId: string, startTimeMs: number, endTimeMs: number) => {
      set((state) => {
        if (!state.timeline) return;
        for (const track of state.timeline.tracks) {
          const clip = (track.clips || []).find((c) => c.id === clipId) as any;
          if (clip) {
            if (track.isLocked) return;
            clip.startTimeMs = Math.max(0, Math.round(startTimeMs));
            clip.endTimeMs = Math.max(clip.startTimeMs + 100, Math.round(endTimeMs));
            const sourceStart = Number(clip.sourceStartMs ?? 0);
            clip.sourceStartMs = sourceStart;
            clip.sourceEndMs = sourceStart + (clip.endTimeMs - clip.startTimeMs);
            track.clips.sort(
              (a, b) => a.startTimeMs - b.startTimeMs || String(a.id).localeCompare(String(b.id)),
            );
            break;
          }
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    updateClipTransform: (
      clipIdOrUpdates: string | ClipTransformUpdate,
      updates?: ClipTransformUpdate,
    ) => {
      set((state) => {
        if (!state.timeline) return;
        const targetClipId =
          typeof clipIdOrUpdates === 'string' ? clipIdOrUpdates : state.selectedClipId;
        const transformUpdates =
          typeof clipIdOrUpdates === 'string' ? updates : clipIdOrUpdates;

        if (!targetClipId || !transformUpdates) return;

        for (const track of state.timeline.tracks) {
          const clip = (track.clips || []).find((c) => c.id === targetClipId) as any;
          if (clip) {
            if (track.isLocked) return;
            clip.transform = mergeClipTransform(clip.transform, transformUpdates);
            break;
          }
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    resetClipTransform: (clipId?: string) => {
      set((state) => {
        if (!state.timeline) return;
        const targetClipId = clipId ?? state.selectedClipId;
        if (!targetClipId) return;

        for (const track of state.timeline.tracks) {
          const clip = (track.clips || []).find((c) => c.id === targetClipId) as any;
          if (clip) {
            if (track.isLocked) return;
            clip.transform = { ...DEFAULT_CLIP_TRANSFORM };
            break;
          }
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    updateClipCrop: (
      clipIdOrUpdates: string | ClipCropUpdate,
      updates?: ClipCropUpdate,
    ) => {
      set((state) => {
        if (!state.timeline) return;
        const targetClipId =
          typeof clipIdOrUpdates === 'string' ? clipIdOrUpdates : state.selectedClipId;
        const cropUpdates =
          typeof clipIdOrUpdates === 'string' ? updates : clipIdOrUpdates;

        if (!targetClipId || !cropUpdates) return;

        for (const track of state.timeline.tracks) {
          const clip = (track.clips || []).find((c) => c.id === targetClipId) as any;
          if (clip) {
            if (track.isLocked) return;
            clip.crop = mergeClipCrop(clip.crop, cropUpdates);
            break;
          }
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    resetClipCrop: (clipId?: string) => {
      set((state) => {
        if (!state.timeline) return;
        const targetClipId = clipId ?? state.selectedClipId;
        if (!targetClipId) return;

        for (const track of state.timeline.tracks) {
          const clip = (track.clips || []).find((c) => c.id === targetClipId) as any;
          if (clip) {
            if (track.isLocked) return;
            clip.crop = { ...DEFAULT_CLIP_CROP };
            break;
          }
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    moveClip: (clipId: string, newStartTimeMs: number, options?: TimelineEditOptions) => {
      set((state) => {
        if (!state.timeline || typeof newStartTimeMs !== 'number' || Number.isNaN(newStartTimeMs)) return;
        const projectEndMs = Math.max(
          0,
          Number(state.timeline.totalDurationMs) || 0,
          Number(state.currentProject?.durationMs) || 0,
        );
        const shouldSnap = options?.snap ?? state.isSnappingEnabled;
        const thresholdMs = shouldSnap
          ? (options?.snapThresholdMs ?? state.snapThresholdMs ?? DEFAULT_SNAP_THRESHOLD_MS)
          : 0;
        const snapTargets = shouldSnap
          ? collectSnapTargetsMs({
              tracks: state.timeline.tracks,
              activeClipId: clipId,
              playheadMs: state.currentTimeMs,
              projectEndMs: projectEndMs > 0 ? projectEndMs : undefined,
            })
          : [];

        for (const track of state.timeline.tracks) {
          const clip = (track.clips || []).find((c) => c.id === clipId);
          if (clip) {
            if (track.isLocked) return;
            const durationMs = Math.max(MIN_CLIP_DURATION_MS, clip.endTimeMs - clip.startTimeMs);
            const snapped = snapClipMoveMs(
              newStartTimeMs,
              durationMs,
              snapTargets,
              thresholdMs,
              projectEndMs > 0 ? projectEndMs : undefined,
            );
            clip.startTimeMs = snapped.startTimeMs;
            clip.endTimeMs = snapped.endTimeMs;
            track.clips.sort(
              (a, b) => a.startTimeMs - b.startTimeMs || String(a.id).localeCompare(String(b.id)),
            );
            break;
          }
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    trimClipStart: (clipId: string, newStartTimeMs: number, options?: TimelineEditOptions) => {
      set((state) => {
        if (!state.timeline || typeof newStartTimeMs !== 'number' || Number.isNaN(newStartTimeMs)) return;
        const projectEndMs = Math.max(
          0,
          Number(state.timeline.totalDurationMs) || 0,
          Number(state.currentProject?.durationMs) || 0,
        );
        const shouldSnap = options?.snap ?? state.isSnappingEnabled;
        const thresholdMs = shouldSnap
          ? (options?.snapThresholdMs ?? state.snapThresholdMs ?? DEFAULT_SNAP_THRESHOLD_MS)
          : 0;
        const snapTargets = shouldSnap
          ? collectSnapTargetsMs({
              tracks: state.timeline.tracks,
              activeClipId: clipId,
              playheadMs: state.currentTimeMs,
              projectEndMs: projectEndMs > 0 ? projectEndMs : undefined,
            })
          : [];

        for (const track of state.timeline.tracks) {
          const clip = (track.clips || []).find((c) => c.id === clipId) as any;
          if (clip) {
            if (track.isLocked) return;
            const oldStartMs = Number(clip.startTimeMs ?? 0);
            const endMs = Number(clip.endTimeMs ?? oldStartMs + MIN_CLIP_DURATION_MS);
            const oldSourceStartMs = Number(clip.sourceStartMs ?? 0);

            // Prevent negative timeline start, prevent negative source start, and enforce minimum 100ms duration
            const minAllowedStartMs = Math.max(0, oldStartMs - oldSourceStartMs);
            const maxAllowedStartMs = Math.max(minAllowedStartMs, endMs - MIN_CLIP_DURATION_MS);

            const snapCandidate = shouldSnap
              ? snapTimeMs(newStartTimeMs, snapTargets, thresholdMs).snappedMs
              : Math.round(newStartTimeMs);

            const clampedStartMs = Math.min(
              maxAllowedStartMs,
              Math.max(minAllowedStartMs, Math.round(snapCandidate)),
            );
            const deltaMs = clampedStartMs - oldStartMs;

            clip.startTimeMs = clampedStartMs;
            clip.sourceStartMs = Math.max(0, oldSourceStartMs + deltaMs);
            clip.sourceEndMs = clip.sourceStartMs + (clip.endTimeMs - clip.startTimeMs);

            track.clips.sort(
              (a, b) => a.startTimeMs - b.startTimeMs || String(a.id).localeCompare(String(b.id)),
            );
            break;
          }
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    trimClipEnd: (clipId: string, newEndTimeMs: number, options?: TimelineEditOptions) => {
      set((state) => {
        if (!state.timeline || typeof newEndTimeMs !== 'number' || Number.isNaN(newEndTimeMs)) return;
        const projectEndMs = Math.max(
          0,
          Number(state.timeline.totalDurationMs) || 0,
          Number(state.currentProject?.durationMs) || 0,
        );
        const shouldSnap = options?.snap ?? state.isSnappingEnabled;
        const thresholdMs = shouldSnap
          ? (options?.snapThresholdMs ?? state.snapThresholdMs ?? DEFAULT_SNAP_THRESHOLD_MS)
          : 0;
        const snapTargets = shouldSnap
          ? collectSnapTargetsMs({
              tracks: state.timeline.tracks,
              activeClipId: clipId,
              playheadMs: state.currentTimeMs,
              projectEndMs: projectEndMs > 0 ? projectEndMs : undefined,
            })
          : [];

        for (const track of state.timeline.tracks) {
          const clip = (track.clips || []).find((c) => c.id === clipId) as any;
          if (clip) {
            if (track.isLocked) return;
            const startMs = Number(clip.startTimeMs ?? 0);
            const sourceStartMs = Number(clip.sourceStartMs ?? 0);
            const minAllowedEndMs = startMs + MIN_CLIP_DURATION_MS;

            const snapCandidate = shouldSnap
              ? snapTimeMs(newEndTimeMs, snapTargets, thresholdMs).snappedMs
              : Math.round(newEndTimeMs);

            let clampedEndMs = Math.max(minAllowedEndMs, Math.round(snapCandidate));

            // Respect known project end boundary when valid
            if (projectEndMs >= minAllowedEndMs) {
              clampedEndMs = Math.min(clampedEndMs, projectEndMs);
            }

            // If linked to a known media asset with finite duration, respect source media bounds
            if (clip.mediaAssetId && (clip.clipType === 'video' || clip.clipType === 'audio')) {
              const linkedAsset = state.projectMedia.find((m) => m.id === clip.mediaAssetId);
              if (linkedAsset?.durationMs && linkedAsset.durationMs > sourceStartMs) {
                const maxBySourceMs = startMs + (linkedAsset.durationMs - sourceStartMs);
                clampedEndMs = Math.max(minAllowedEndMs, Math.min(clampedEndMs, maxBySourceMs));
              }
            }

            const newDurationMs = clampedEndMs - startMs;
            clip.endTimeMs = clampedEndMs;
            clip.sourceStartMs = sourceStartMs;
            clip.sourceEndMs = sourceStartMs + newDurationMs;
            break;
          }
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    splitClip: (clipId?: string, splitTimeMs?: number) => {
      set((state) => {
        if (!state.timeline) return;
        const targetClipId = clipId ?? state.selectedClipId;
        if (!targetClipId) return;

        const splitAtMs = Math.round(splitTimeMs ?? state.currentTimeMs);
        if (typeof splitAtMs !== 'number' || Number.isNaN(splitAtMs)) return;

        for (const track of state.timeline.tracks) {
          const clips = track.clips || [];
          const idx = clips.findIndex((c) => c.id === targetClipId);
          if (idx === -1) continue;

          if (track.isLocked) return;
          const clip = clips[idx] as any;

          // Playhead must be strictly inside the clip with at least 100ms on each side
          if (splitAtMs <= clip.startTimeMs || splitAtMs >= clip.endTimeMs) {
            return;
          }
          if (splitAtMs - clip.startTimeMs < 100 || clip.endTimeMs - splitAtMs < 100) {
            return;
          }

          const firstDurationMs = splitAtMs - clip.startTimeMs;
          const secondDurationMs = clip.endTimeMs - splitAtMs;
          const origSourceStartMs = Number(clip.sourceStartMs ?? 0);

          const randA = Math.random().toString(36).substring(2, 7);
          const randB = Math.random().toString(36).substring(2, 7);
          const firstClipId = `clip-${Date.now()}-${randA}-1`;
          const secondClipId = `clip-${Date.now()}-${randB}-2`;

          const baseClone = JSON.parse(JSON.stringify(clip));

          const firstClip = {
            ...baseClone,
            id: firstClipId,
            trackId: track.id,
            startTimeMs: clip.startTimeMs,
            endTimeMs: splitAtMs,
            sourceStartMs: origSourceStartMs,
            sourceEndMs: origSourceStartMs + firstDurationMs,
          };

          const secondClip = {
            ...baseClone,
            id: secondClipId,
            trackId: track.id,
            startTimeMs: splitAtMs,
            endTimeMs: clip.endTimeMs,
            sourceStartMs: origSourceStartMs + firstDurationMs,
            sourceEndMs: origSourceStartMs + firstDurationMs + secondDurationMs,
          };

          clips.splice(idx, 1, firstClip, secondClip);
          clips.sort((a, b) => a.startTimeMs - b.startTimeMs || String(a.id).localeCompare(String(b.id)));
          state.selectedClipId = secondClip.id;
          state.selectedTrackId = track.id;
          break;
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    deleteClip: (clipId?: string) => {
      set((state) => {
        if (!state.timeline) return;
        const targetId = clipId ?? state.selectedClipId;
        if (!targetId) return;

        for (const track of state.timeline.tracks) {
          if (track.isLocked) continue;
          const beforeLen = (track.clips || []).length;
          track.clips = (track.clips || []).filter((c) => c.id !== targetId);
          if (track.clips.length !== beforeLen) {
            break;
          }
        }
        if (state.selectedClipId === targetId) {
          state.selectedClipId = null;
        }
        syncAndPruneTimelineTransitions(state.timeline);
        if (
          state.selectedTransitionId &&
          !(state.timeline.transitions || []).some((t) => t.id === state.selectedTransitionId)
        ) {
          state.selectedTransitionId = null;
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    removeClip: (clipId: string) => {
      get().deleteClip(clipId);
    },

    addTransition: (inputOrFromClipId, toClipIdArg, typeArg, durationMsArg) => {
      let createdId: string | null = null;
      set((state) => {
        if (!state.timeline) return;

        const input: ClipTransitionInput =
          typeof inputOrFromClipId === 'string'
            ? {
                fromClipId: inputOrFromClipId,
                toClipId: toClipIdArg || '',
                type: typeArg,
                durationMs: durationMsArg,
              }
            : inputOrFromClipId;

        const check = validateAdjacentClipTransition({
          timeline: state.timeline,
          fromClipId: input.fromClipId,
          toClipId: input.toClipId,
          type: input.type ?? 'crossfade',
          durationMs: input.durationMs,
        });

        if (!check.valid || !check.track || !check.maxDurationMs) {
          return;
        }

        const transitionType: BasicTransitionType = isValidTransitionType(input.type)
          ? input.type
          : 'crossfade';

        const durationMs =
          input.durationMs !== undefined
            ? Math.round(Number(input.durationMs))
            : Math.min(DEFAULT_TRANSITION_DURATION_MS, check.maxDurationMs);

        const existingTransitions = collectTimelineTransitions(state.timeline);
        const existingBetweenPair = existingTransitions.find(
          (t) => t.fromClipId === input.fromClipId && t.toClipId === input.toClipId,
        );

        const rand = Math.random().toString(36).substring(2, 7);
        const transitionId =
          input.id || existingBetweenPair?.id || `transition-${Date.now()}-${rand}`;

        const newTransition: ClipTransition = {
          id: transitionId,
          type: transitionType,
          durationMs,
          fromClipId: input.fromClipId,
          toClipId: input.toClipId,
          trackId: check.track.id,
        };

        const filteredTrackTransitions = (check.track.transitions || []).filter(
          (t: ClipTransition) =>
            !(t.fromClipId === input.fromClipId && t.toClipId === input.toClipId) &&
            t.id !== transitionId,
        );
        filteredTrackTransitions.push(newTransition);
        check.track.transitions = filteredTrackTransitions;

        syncAndPruneTimelineTransitions(state.timeline);
        state.selectedTransitionId = transitionId;
        state.selectedClipId = null;
        state.selectedTrackId = check.track.id;
        createdId = transitionId;

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
      return createdId;
    },

    updateTransition: (transitionIdOrUpdates, updatesArg) => {
      let updated = false;
      set((state) => {
        if (!state.timeline) return;
        const targetId =
          typeof transitionIdOrUpdates === 'string'
            ? transitionIdOrUpdates
            : transitionIdOrUpdates.id ?? state.selectedTransitionId;
        const updates: ClipTransitionUpdate | undefined =
          typeof transitionIdOrUpdates === 'string' ? updatesArg : transitionIdOrUpdates;

        if (!targetId || !updates) return;

        const existingList = collectTimelineTransitions(state.timeline);
        const current = existingList.find((t) => t.id === targetId);
        if (!current) return;

        const nextType = updates.type !== undefined ? updates.type : current.type;
        const nextDurationMs =
          updates.durationMs !== undefined ? updates.durationMs : current.durationMs;

        const check = validateAdjacentClipTransition({
          timeline: state.timeline,
          fromClipId: current.fromClipId,
          toClipId: current.toClipId,
          type: nextType,
          durationMs: nextDurationMs,
        });

        if (!check.valid || !check.track) {
          return;
        }

        const updatedTransition: ClipTransition = {
          ...current,
          type: nextType as BasicTransitionType,
          durationMs: Math.round(Number(nextDurationMs)),
          trackId: check.track.id,
        };

        check.track.transitions = (check.track.transitions || []).map((t: ClipTransition) =>
          t.id === targetId ? updatedTransition : t,
        );
        if (!(check.track.transitions || []).some((t: ClipTransition) => t.id === targetId)) {
          check.track.transitions = [...(check.track.transitions || []), updatedTransition];
        }

        syncAndPruneTimelineTransitions(state.timeline);
        updated = true;

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
      return updated;
    },

    removeTransition: (transitionId?: string) => {
      set((state) => {
        if (!state.timeline) return;
        const targetId = transitionId ?? state.selectedTransitionId;
        if (!targetId) return;

        for (const track of state.timeline.tracks) {
          if (track.isLocked) continue;
          if (Array.isArray(track.transitions)) {
            track.transitions = track.transitions.filter((t) => t.id !== targetId);
          }
        }
        if (Array.isArray(state.timeline.transitions)) {
          state.timeline.transitions = state.timeline.transitions.filter((t) => t.id !== targetId);
        }

        syncAndPruneTimelineTransitions(state.timeline);
        if (state.selectedTransitionId === targetId) {
          state.selectedTransitionId = null;
        }

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    resetTransition: (transitionId?: string) => {
      set((state) => {
        if (!state.timeline) return;
        const targetId = transitionId ?? state.selectedTransitionId;
        if (!targetId) return;

        const existingList = collectTimelineTransitions(state.timeline);
        const current = existingList.find((t) => t.id === targetId);
        if (!current) return;

        const check = validateAdjacentClipTransition({
          timeline: state.timeline,
          fromClipId: current.fromClipId,
          toClipId: current.toClipId,
          type: 'crossfade',
          durationMs: 1,
        });
        if (!check.valid || !check.track || !check.maxDurationMs) return;

        const defaultDuration = Math.min(DEFAULT_TRANSITION_DURATION_MS, check.maxDurationMs);
        const resetObj: ClipTransition = {
          ...current,
          type: 'crossfade',
          durationMs: defaultDuration,
          trackId: check.track.id,
        };

        check.track.transitions = (check.track.transitions || []).map((t: ClipTransition) =>
          t.id === targetId ? resetObj : t,
        );
        syncAndPruneTimelineTransitions(state.timeline);

        const currentStr = calculateCurrentSnapshotString(state);
        state.isDirty = currentStr !== state.savedSnapshotString;
      });
    },

    selectTransition: (transitionId: string | null) => {
      set((state) => {
        state.selectedTransitionId = transitionId;
        if (transitionId) {
          state.selectedClipId = null;
          const all = collectTimelineTransitions(state.timeline);
          const found = all.find((t) => t.id === transitionId);
          if (found?.trackId) {
            state.selectedTrackId = found.trackId;
          }
        }
      });
    },

    setCurrentTimeMs: (timeMs: number) => {
      set((state) => {
        const maxDuration = getEffectiveTimelineDurationMs(
          state.timeline,
          state.currentProject?.durationMs,
        );
        state.currentTimeMs = clampPlayheadMs(timeMs, maxDuration);
      });
    },

    togglePlayback: () => {
      set((state) => {
        state.isPlaying = !state.isPlaying;
      });
    },

    setIsPlaying: (isPlaying: boolean) => {
      set((state) => {
        state.isPlaying = isPlaying;
      });
    },

    setPlaybackRate: (rate: number) => {
      set((state) => {
        state.playbackRate = Math.max(0.25, Math.min(rate, 4.0));
      });
    },

    setIsVideoDrivenPlayback: (driven: boolean) => {
      set((state) => {
        state.isVideoDrivenPlayback = driven;
      });
    },

    setZoomLevel: (zoom: number) => {
      set((state) => {
        state.zoomLevel = getPixelsPerSecond(zoom);
      });
    },

    selectClip: (clipId: string | null) => {
      set((state) => {
        state.selectedClipId = clipId;
        if (clipId) {
          state.selectedTransitionId = null;
        }
        if (clipId && state.timeline?.tracks) {
          for (const track of state.timeline.tracks) {
            if ((track.clips || []).some((c) => c.id === clipId)) {
              state.selectedTrackId = track.id;
              break;
            }
          }
        }
      });
    },

    selectTrack: (trackId: string | null) => {
      set((state) => {
        state.selectedTrackId = trackId;
      });
    },

    selectClipAndTrack: (clipId: string | null, trackId: string | null) => {
      set((state) => {
        state.selectedClipId = clipId;
        state.selectedTrackId = trackId;
        if (clipId) {
          state.selectedTransitionId = null;
        }
      });
    },

    toggleSnapping: () => {
      set((state) => {
        state.isSnappingEnabled = !state.isSnappingEnabled;
      });
    },

    setSnapThresholdMs: (thresholdMs: number) => {
      set((state) => {
        if (typeof thresholdMs === 'number' && !Number.isNaN(thresholdMs)) {
          state.snapThresholdMs = Math.max(0, Math.round(thresholdMs));
        }
      });
    },

    resetEditor: () => {
      set((state) => {
        state.currentProject = null;
        state.timeline = null;
        state.projectMedia = [];
        state.selectedMediaAsset = null;
        state.isMediaLoading = false;
        state.mediaError = null;
        state.isDirty = false;
        state.isSaving = false;
        state.lastSavedAt = null;
        state.lastSaveError = null;
        state.savedSnapshotString = null;
        state.currentTimeMs = 0;
        state.isPlaying = false;
        state.selectedClipId = null;
        state.selectedTrackId = null;
        state.selectedTransitionId = null;
        state.isSnappingEnabled = true;
        state.snapThresholdMs = DEFAULT_SNAP_THRESHOLD_MS;
      });
    },
  }))
);
