/**
 * Timing conversion and synchronization utilities for Phase 6C & Phase 9H-1:
 * Real Video Preview, Playback Synchronization & Multi-Clip Playback Foundation.
 */

import type { ClipType, TimelineClip, TrackType } from '@/src/types/timeline';
import { getEffectiveTimelineDurationMs } from './timelinePrecision';

export interface VideoClipTiming {
  startTimeMs: number;
  endTimeMs: number;
  sourceStartMs?: number;
  sourceEndMs?: number;
}

export interface PlayableClipTiming extends VideoClipTiming {
  id: string;
  trackId?: string;
  clipType?: ClipType | string;
  mediaAssetId?: string;
  name?: string;
}

export interface PlaybackTrackLike<T extends PlayableClipTiming = PlayableClipTiming> {
  id?: string;
  trackType?: TrackType | string;
  orderIndex?: number;
  isMuted?: boolean;
  clips?: readonly T[];
}

export interface PlaybackTimelineLike<T extends PlayableClipTiming = PlayableClipTiming> {
  totalDurationMs?: number | null;
  tracks?: readonly PlaybackTrackLike<T>[];
}

export type ClipsOrTimelineInput<T extends PlayableClipTiming = PlayableClipTiming> =
  | readonly T[]
  | PlaybackTimelineLike<T>
  | null
  | undefined;

export interface PlaybackQueryOptions {
  trackType?: TrackType | string;
  clipType?: ClipType | string;
}

export type TimelinePlaybackStateKind =
  | 'empty'
  | 'active-clip'
  | 'gap'
  | 'timeline-end';

export type TimelineBoundaryType =
  | 'clip-start'
  | 'clip-end'
  | 'timeline-end'
  | 'none';

export interface NextTimelineBoundary<T extends PlayableClipTiming = PlayableClipTiming> {
  boundaryTimeMs: number;
  boundaryType: TimelineBoundaryType;
  clip: T | null;
}

export interface TimelinePlaybackResolution<T extends PlayableClipTiming = PlayableClipTiming> {
  status: TimelinePlaybackStateKind;
  currentTimeMs: number;
  effectiveDurationMs: number;
  activeClip: T | null;
  sourceTimeSec: number | null;
  isGap: boolean;
  isAtStart: boolean;
  isTimelineEnded: boolean;
  isEmpty: boolean;
  nextBoundaryMs: number | null;
  nextClip: T | null;
}

/**
 * Converts timeline playhead position (in ms) to source video time (in seconds).
 * Returns isWithinClip: false if the playhead is outside the clip boundary.
 */
export function timelineToSourceSeconds(
  timelineTimeMs: number,
  clip: VideoClipTiming,
  mediaDurationSec?: number
): { sourceSec: number; isWithinClip: boolean } {
  const clipDurationMs = Math.max(0, clip.endTimeMs - clip.startTimeMs);
  const sourceOffsetMs = clip.sourceStartMs || 0;

  if (timelineTimeMs < clip.startTimeMs) {
    // Before clip starts: clamp to source start
    return {
      sourceSec: Math.max(0, sourceOffsetMs / 1000),
      isWithinClip: false,
    };
  }

  if (timelineTimeMs > clip.endTimeMs) {
    // After clip ends: clamp to source end / clip end
    const endSourceMs = clip.sourceEndMs || (sourceOffsetMs + clipDurationMs);
    return {
      sourceSec: Math.max(0, endSourceMs / 1000),
      isWithinClip: false,
    };
  }

  // Inside clip boundary
  const elapsedInClipMs = timelineTimeMs - clip.startTimeMs;
  let sourceMs = sourceOffsetMs + elapsedInClipMs;

  if (mediaDurationSec !== undefined && mediaDurationSec > 0) {
    sourceMs = Math.min(sourceMs, mediaDurationSec * 1000);
  }

  return {
    sourceSec: Math.max(0, sourceMs / 1000),
    isWithinClip: true,
  };
}

/**
 * Converts HTML5 video currentTime (in seconds) to timeline position (in ms).
 */
export function sourceSecondsToTimelineMs(
  sourceSec: number,
  clip: VideoClipTiming
): { timelineTimeMs: number; hasReachedClipEnd: boolean } {
  const sourceOffsetMs = clip.sourceStartMs || 0;
  const sourceCurrentMs = Math.max(0, sourceSec * 1000);
  const elapsedInClipMs = Math.max(0, sourceCurrentMs - sourceOffsetMs);

  const calculatedTimelineMs = clip.startTimeMs + elapsedInClipMs;

  if (calculatedTimelineMs >= clip.endTimeMs) {
    return {
      timelineTimeMs: clip.endTimeMs,
      hasReachedClipEnd: true,
    };
  }

  return {
    timelineTimeMs: Math.max(clip.startTimeMs, calculatedTimelineMs),
    hasReachedClipEnd: false,
  };
}

function normalizeTimeMs(timeMs: number): number {
  if (typeof timeMs !== 'number' || !Number.isFinite(timeMs)) {
    return 0;
  }
  return Math.max(0, timeMs);
}

function isValidPlayableClip<T extends PlayableClipTiming>(clip: T | null | undefined): clip is T {
  if (!clip || typeof clip !== 'object') return false;
  if (typeof clip.startTimeMs !== 'number' || !Number.isFinite(clip.startTimeMs)) return false;
  if (typeof clip.endTimeMs !== 'number' || !Number.isFinite(clip.endTimeMs)) return false;
  return clip.endTimeMs > clip.startTimeMs;
}

function isClipArray<T extends PlayableClipTiming>(
  input: ClipsOrTimelineInput<T>
): input is readonly T[] {
  return Array.isArray(input);
}

/**
 * Extracts and deterministically sorts playable clips without mutating input data.
 * Clips are ordered by startTimeMs ascending, then endTimeMs ascending, then id.
 */
export function getSortedPlayableClips<T extends PlayableClipTiming = TimelineClip>(
  clipsOrTimeline: ClipsOrTimelineInput<T>,
  options?: PlaybackQueryOptions
): T[] {
  if (!clipsOrTimeline) {
    return [];
  }

  const collected: T[] = [];

  if (isClipArray(clipsOrTimeline)) {
    for (const clip of clipsOrTimeline) {
      if (!isValidPlayableClip(clip)) continue;
      if (options?.clipType && clip.clipType && clip.clipType !== options.clipType) continue;
      collected.push(clip);
    }
  } else if (Array.isArray(clipsOrTimeline.tracks)) {
    const tracks = [...clipsOrTimeline.tracks].sort(
      (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
    );

    for (const track of tracks) {
      if (options?.trackType && track.trackType !== options.trackType) continue;
      for (const clip of track.clips ?? []) {
        if (!isValidPlayableClip(clip)) continue;
        if (options?.clipType && clip.clipType && clip.clipType !== options.clipType) continue;
        collected.push(clip);
      }
    }
  }

  return collected.sort((a, b) => {
    if (a.startTimeMs !== b.startTimeMs) {
      return a.startTimeMs - b.startTimeMs;
    }
    if (a.endTimeMs !== b.endTimeMs) {
      return a.endTimeMs - b.endTimeMs;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Checks whether a single clip is active at the given timeline time using a half-open interval:
 * clip.startTimeMs <= currentTimeMs < clip.endTimeMs
 */
export function isClipActiveAtTime(clip: VideoClipTiming, currentTimeMs: number): boolean {
  if (!clip || typeof currentTimeMs !== 'number' || !Number.isFinite(currentTimeMs)) {
    return false;
  }
  if (
    typeof clip.startTimeMs !== 'number' ||
    !Number.isFinite(clip.startTimeMs) ||
    typeof clip.endTimeMs !== 'number' ||
    !Number.isFinite(clip.endTimeMs) ||
    clip.endTimeMs <= clip.startTimeMs
  ) {
    return false;
  }
  return clip.startTimeMs <= currentTimeMs && currentTimeMs < clip.endTimeMs;
}

/**
 * A. Resolves the active clip at a given timeline time using half-open intervals:
 * clip.startTimeMs <= currentTimeMs < clip.endTimeMs.
 * Returns null if no clip is active at currentTimeMs or if the timeline is empty.
 */
export function resolveActiveClipAtTime<T extends PlayableClipTiming = TimelineClip>(
  clipsOrTimeline: ClipsOrTimelineInput<T>,
  currentTimeMs: number,
  options?: PlaybackQueryOptions
): T | null {
  if (typeof currentTimeMs !== 'number' || !Number.isFinite(currentTimeMs) || currentTimeMs < 0) {
    return null;
  }

  const clips = getSortedPlayableClips(clipsOrTimeline, options);
  for (const clip of clips) {
    if (isClipActiveAtTime(clip, currentTimeMs)) {
      return clip;
    }
  }

  return null;
}

/**
 * E. Determines whether the timeline has no playable clips.
 */
export function isEmptyTimeline<T extends PlayableClipTiming = TimelineClip>(
  clipsOrTimeline: ClipsOrTimelineInput<T>,
  options?: PlaybackQueryOptions
): boolean {
  return getSortedPlayableClips(clipsOrTimeline, options).length === 0;
}

/**
 * Computes the effective playable duration of the timeline in milliseconds.
 * Returns 0 when the timeline has no playable clips and no explicit positive duration.
 */
export function getPlayableTimelineDurationMs<T extends PlayableClipTiming = TimelineClip>(
  clipsOrTimeline: ClipsOrTimelineInput<T>,
  projectDurationMs?: number | null,
  options?: PlaybackQueryOptions
): number {
  const clips = getSortedPlayableClips(clipsOrTimeline, options);
  let maxClipEndMs = 0;

  for (const clip of clips) {
    if (clip.endTimeMs > maxClipEndMs) {
      maxClipEndMs = clip.endTimeMs;
    }
  }

  const explicitProjectDuration =
    typeof projectDurationMs === 'number' && Number.isFinite(projectDurationMs) && projectDurationMs > 0
      ? projectDurationMs
      : 0;

  const timelineTotalDuration =
    clipsOrTimeline &&
    !isClipArray(clipsOrTimeline) &&
    typeof clipsOrTimeline.totalDurationMs === 'number' &&
    Number.isFinite(clipsOrTimeline.totalDurationMs) &&
    clipsOrTimeline.totalDurationMs > 0
      ? clipsOrTimeline.totalDurationMs
      : 0;

  if (clips.length === 0 && explicitProjectDuration === 0 && timelineTotalDuration === 0) {
    return 0;
  }

  if (clipsOrTimeline && !isClipArray(clipsOrTimeline)) {
    const hasPositiveInput = maxClipEndMs > 0 || explicitProjectDuration > 0 || timelineTotalDuration > 0;
    if (hasPositiveInput) {
      return Math.max(
        maxClipEndMs,
        getEffectiveTimelineDurationMs(
          {
            totalDurationMs: timelineTotalDuration || maxClipEndMs,
            tracks: [{ clips }],
          },
          explicitProjectDuration || maxClipEndMs
        )
      );
    }
  }

  return Math.round(Math.max(maxClipEndMs, explicitProjectDuration, timelineTotalDuration));
}

/**
 * D. Determines whether the project timeline has reached or passed its end boundary.
 */
export function hasTimelineEnded<T extends PlayableClipTiming = TimelineClip>(
  clipsOrTimeline: ClipsOrTimelineInput<T>,
  currentTimeMs: number,
  projectDurationMs?: number | null,
  options?: PlaybackQueryOptions
): boolean {
  const safeCurrentTimeMs = normalizeTimeMs(currentTimeMs);
  const durationMs = getPlayableTimelineDurationMs(clipsOrTimeline, projectDurationMs, options);

  if (durationMs <= 0) {
    return false;
  }

  return safeCurrentTimeMs >= durationMs;
}

/**
 * B. Detects whether the playhead is currently inside a timeline gap
 * (within the playable timeline duration, non-empty timeline, and no clip is active).
 */
export function isTimelineGapAtTime<T extends PlayableClipTiming = TimelineClip>(
  clipsOrTimeline: ClipsOrTimelineInput<T>,
  currentTimeMs: number,
  projectDurationMs?: number | null,
  options?: PlaybackQueryOptions
): boolean {
  if (typeof currentTimeMs !== 'number' || !Number.isFinite(currentTimeMs) || currentTimeMs < 0) {
    return false;
  }

  const clips = getSortedPlayableClips(clipsOrTimeline, options);
  if (clips.length === 0) {
    return false;
  }

  const durationMs = getPlayableTimelineDurationMs(clipsOrTimeline, projectDurationMs, options);
  if (durationMs <= 0 || currentTimeMs >= durationMs) {
    return false;
  }

  return resolveActiveClipAtTime(clips, currentTimeMs) === null;
}

/**
 * C. Determines the next relevant timeline boundary (next clip start, active clip end, or timeline end)
 * strictly ahead of currentTimeMs without ever moving the playhead backwards.
 */
export function getNextTimelineBoundary<T extends PlayableClipTiming = TimelineClip>(
  clipsOrTimeline: ClipsOrTimelineInput<T>,
  currentTimeMs: number,
  projectDurationMs?: number | null,
  options?: PlaybackQueryOptions
): NextTimelineBoundary<T> {
  const safeCurrentTimeMs = normalizeTimeMs(currentTimeMs);
  const clips = getSortedPlayableClips(clipsOrTimeline, options);
  const durationMs = getPlayableTimelineDurationMs(clipsOrTimeline, projectDurationMs, options);

  if (clips.length === 0) {
    return {
      boundaryTimeMs: safeCurrentTimeMs,
      boundaryType: 'none',
      clip: null,
    };
  }

  let bestTimeMs = Infinity;
  let bestType: TimelineBoundaryType = 'none';
  let bestClip: T | null = null;

  for (const clip of clips) {
    // Candidate 1: Clip start strictly after currentTimeMs
    if (clip.startTimeMs > safeCurrentTimeMs && clip.startTimeMs < bestTimeMs) {
      bestTimeMs = clip.startTimeMs;
      bestType = 'clip-start';
      bestClip = clip;
    }

    // Candidate 2: Active (or future) clip end strictly after currentTimeMs
    if (clip.endTimeMs > safeCurrentTimeMs && clip.endTimeMs < bestTimeMs) {
      bestTimeMs = clip.endTimeMs;
      bestType = 'clip-end';
      bestClip = clip;
    }
  }

  if (Number.isFinite(bestTimeMs)) {
    return {
      boundaryTimeMs: Math.max(safeCurrentTimeMs, bestTimeMs),
      boundaryType: bestType,
      clip: bestClip,
    };
  }

  if (durationMs > safeCurrentTimeMs) {
    return {
      boundaryTimeMs: durationMs,
      boundaryType: 'timeline-end',
      clip: null,
    };
  }

  return {
    boundaryTimeMs: safeCurrentTimeMs,
    boundaryType: 'none',
    clip: null,
  };
}

/**
 * Resolves the complete deterministic playback state at a given timeline position,
 * distinguishing between:
 * - an empty timeline ('empty')
 * - an active clip ('active-clip')
 * - a gap between clips ('gap')
 * - the end of the timeline ('timeline-end')
 * as well as whether the playhead is at the beginning of the timeline (isAtStart).
 */
export function resolveTimelinePlaybackState<T extends PlayableClipTiming = TimelineClip>(
  clipsOrTimeline: ClipsOrTimelineInput<T>,
  currentTimeMs: number,
  projectDurationMs?: number | null,
  options?: PlaybackQueryOptions
): TimelinePlaybackResolution<T> {
  const safeCurrentTimeMs = normalizeTimeMs(currentTimeMs);
  const clips = getSortedPlayableClips(clipsOrTimeline, options);
  const effectiveDurationMs = getPlayableTimelineDurationMs(clipsOrTimeline, projectDurationMs, options);
  const isAtStart = safeCurrentTimeMs === 0;

  if (clips.length === 0) {
    return {
      status: 'empty',
      currentTimeMs: safeCurrentTimeMs,
      effectiveDurationMs: 0,
      activeClip: null,
      sourceTimeSec: null,
      isGap: false,
      isAtStart,
      isTimelineEnded: false,
      isEmpty: true,
      nextBoundaryMs: null,
      nextClip: null,
    };
  }

  if (effectiveDurationMs > 0 && safeCurrentTimeMs >= effectiveDurationMs) {
    return {
      status: 'timeline-end',
      currentTimeMs: safeCurrentTimeMs,
      effectiveDurationMs,
      activeClip: null,
      sourceTimeSec: null,
      isGap: false,
      isAtStart: false,
      isTimelineEnded: true,
      isEmpty: false,
      nextBoundaryMs: null,
      nextClip: null,
    };
  }

  const activeClip = resolveActiveClipAtTime(clips, safeCurrentTimeMs);
  const nextBoundary = getNextTimelineBoundary(clips, safeCurrentTimeMs, effectiveDurationMs);
  const nextClip =
    clips.find((clip) => clip.startTimeMs > safeCurrentTimeMs && clip.id !== activeClip?.id) ?? null;

  if (activeClip) {
    const { sourceSec } = timelineToSourceSeconds(safeCurrentTimeMs, activeClip);
    return {
      status: 'active-clip',
      currentTimeMs: safeCurrentTimeMs,
      effectiveDurationMs,
      activeClip,
      sourceTimeSec: sourceSec,
      isGap: false,
      isAtStart,
      isTimelineEnded: false,
      isEmpty: false,
      nextBoundaryMs: nextBoundary.boundaryType !== 'none' ? nextBoundary.boundaryTimeMs : null,
      nextClip,
    };
  }

  return {
    status: 'gap',
    currentTimeMs: safeCurrentTimeMs,
    effectiveDurationMs,
    activeClip: null,
    sourceTimeSec: null,
    isGap: true,
    isAtStart,
    isTimelineEnded: false,
    isEmpty: false,
    nextBoundaryMs: nextBoundary.boundaryType !== 'none' ? nextBoundary.boundaryTimeMs : null,
    nextClip,
  };
}

export interface TimelinePlaybackStepResult<T extends PlayableClipTiming = TimelineClip> {
  resolution: TimelinePlaybackResolution<T>;
  currentTimeMs: number;
  activeClip: T | null;
  sourceTimeSec: number | null;
  isGap: boolean;
  shouldStopPlayback: boolean;
  shouldDriveWithVideo: boolean;
  didSwitchClip: boolean;
  previousClipId: string | null;
}

export interface VideoClipTimeUpdateResult<T extends PlayableClipTiming = TimelineClip> {
  timelineTimeMs: number;
  hasReachedClipEnd: boolean;
  resolution: TimelinePlaybackResolution<T>;
  activeClip: T | null;
  sourceTimeSec: number | null;
  isGap: boolean;
  shouldStopPlayback: boolean;
  shouldDriveWithVideo: boolean;
  didSwitchClip: boolean;
}

/**
 * Phase 9H-2: Advances timeline playback by deltaMs (e.g. from the timeline clock during gaps or non-video ticks),
 * snapping cleanly onto intermediate clip start/end boundaries so adjacent or post-gap clips begin at their exact sourceStartMs.
 */
export function resolveTimelineStep<T extends PlayableClipTiming = TimelineClip>(
  clipsOrTimeline: ClipsOrTimelineInput<T>,
  currentTimeMs: number,
  deltaMs: number,
  projectDurationMs?: number | null,
  options?: PlaybackQueryOptions
): TimelinePlaybackStepResult<T> {
  const safeCurrentTimeMs = normalizeTimeMs(currentTimeMs);
  const safeDeltaMs = typeof deltaMs === 'number' && Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;

  const prevResolution = resolveTimelinePlaybackState(
    clipsOrTimeline,
    safeCurrentTimeMs,
    projectDurationMs,
    options
  );

  if (prevResolution.isEmpty) {
    return {
      resolution: prevResolution,
      currentTimeMs: safeCurrentTimeMs,
      activeClip: null,
      sourceTimeSec: null,
      isGap: false,
      shouldStopPlayback: true,
      shouldDriveWithVideo: false,
      didSwitchClip: false,
      previousClipId: null,
    };
  }

  const effectiveDurationMs = prevResolution.effectiveDurationMs;
  if (effectiveDurationMs > 0 && safeCurrentTimeMs >= effectiveDurationMs) {
    const endResolution = resolveTimelinePlaybackState(
      clipsOrTimeline,
      effectiveDurationMs,
      projectDurationMs,
      options
    );
    return {
      resolution: endResolution,
      currentTimeMs: effectiveDurationMs,
      activeClip: null,
      sourceTimeSec: null,
      isGap: false,
      shouldStopPlayback: true,
      shouldDriveWithVideo: false,
      didSwitchClip: prevResolution.activeClip !== null,
      previousClipId: prevResolution.activeClip?.id ?? null,
    };
  }

  let targetTimeMs = Math.round(safeCurrentTimeMs + safeDeltaMs);
  const nextBoundary = getNextTimelineBoundary(
    clipsOrTimeline,
    safeCurrentTimeMs,
    projectDurationMs,
    options
  );

  if (
    nextBoundary.boundaryType !== 'none' &&
    nextBoundary.boundaryTimeMs > safeCurrentTimeMs &&
    targetTimeMs >= nextBoundary.boundaryTimeMs
  ) {
    targetTimeMs = nextBoundary.boundaryTimeMs;
  }

  if (effectiveDurationMs > 0 && targetTimeMs >= effectiveDurationMs) {
    targetTimeMs = effectiveDurationMs;
  }

  const nextResolution = resolveTimelinePlaybackState(
    clipsOrTimeline,
    targetTimeMs,
    projectDurationMs,
    options
  );

  const shouldStopPlayback = nextResolution.isTimelineEnded || nextResolution.isEmpty;
  const shouldDriveWithVideo =
    nextResolution.status === 'active-clip' && nextResolution.activeClip !== null;

  return {
    resolution: nextResolution,
    currentTimeMs: nextResolution.currentTimeMs,
    activeClip: nextResolution.activeClip,
    sourceTimeSec: nextResolution.sourceTimeSec,
    isGap: nextResolution.isGap,
    shouldStopPlayback,
    shouldDriveWithVideo,
    didSwitchClip: (prevResolution.activeClip?.id ?? null) !== (nextResolution.activeClip?.id ?? null),
    previousClipId: prevResolution.activeClip?.id ?? null,
  };
}

/**
 * Phase 9H-2: Resolves timeline state from an HTML5 video element's currentTime (in seconds)
 * for the currently playing clip, handling seamless transition to an adjacent clip,
 * transition into a gap, or stopping at the effective timeline end.
 */
export function resolveVideoClipTimeUpdate<T extends PlayableClipTiming = TimelineClip>(
  clipsOrTimeline: ClipsOrTimelineInput<T>,
  currentActiveClip: T | null | undefined,
  videoCurrentTimeSec: number,
  projectDurationMs?: number | null,
  options?: PlaybackQueryOptions
): VideoClipTimeUpdateResult<T> {
  if (!currentActiveClip) {
    const fallbackTimelineTimeMs = Math.max(
      0,
      Math.round(
        (typeof videoCurrentTimeSec === 'number' && Number.isFinite(videoCurrentTimeSec)
          ? videoCurrentTimeSec
          : 0) * 1000
      )
    );
    const resolution = resolveTimelinePlaybackState(
      clipsOrTimeline,
      fallbackTimelineTimeMs,
      projectDurationMs,
      options
    );
    const shouldStopPlayback = resolution.isTimelineEnded || resolution.isEmpty;
    const shouldDriveWithVideo =
      !shouldStopPlayback && resolution.status === 'active-clip' && resolution.activeClip !== null;

    return {
      timelineTimeMs: resolution.currentTimeMs,
      hasReachedClipEnd: false,
      resolution,
      activeClip: resolution.activeClip,
      sourceTimeSec: resolution.sourceTimeSec,
      isGap: resolution.isGap,
      shouldStopPlayback,
      shouldDriveWithVideo,
      didSwitchClip: resolution.activeClip !== null,
    };
  }

  const { timelineTimeMs, hasReachedClipEnd } = sourceSecondsToTimelineMs(
    videoCurrentTimeSec,
    currentActiveClip
  );

  const targetTimeMs = hasReachedClipEnd ? currentActiveClip.endTimeMs : timelineTimeMs;
  const resolution = resolveTimelinePlaybackState(
    clipsOrTimeline,
    targetTimeMs,
    projectDurationMs,
    options
  );

  const shouldStopPlayback = resolution.isTimelineEnded || resolution.isEmpty;
  const shouldDriveWithVideo =
    !shouldStopPlayback && resolution.status === 'active-clip' && resolution.activeClip !== null;

  return {
    timelineTimeMs: resolution.currentTimeMs,
    hasReachedClipEnd,
    resolution,
    activeClip: resolution.activeClip,
    sourceTimeSec: resolution.sourceTimeSec,
    isGap: resolution.isGap,
    shouldStopPlayback,
    shouldDriveWithVideo,
    didSwitchClip: (resolution.activeClip?.id ?? null) !== currentActiveClip.id,
  };
}

/**
 * Phase 9H-2: Resolves a user or programmatic timeline seek request, clamping to valid bounds
 * and computing the active clip and its exact source time (or gap/end state without arbitrary clip fallback).
 */
export function resolveTimelineSeek<T extends PlayableClipTiming = TimelineClip>(
  clipsOrTimeline: ClipsOrTimelineInput<T>,
  requestedTimeMs: number,
  projectDurationMs?: number | null,
  mediaDurationSec?: number,
  options?: PlaybackQueryOptions
): TimelinePlaybackResolution<T> {
  const rawClampedMs = Math.max(
    0,
    Math.round(typeof requestedTimeMs === 'number' && Number.isFinite(requestedTimeMs) ? requestedTimeMs : 0)
  );
  const playableDurationMs = getPlayableTimelineDurationMs(clipsOrTimeline, projectDurationMs, options);
  const clampedTimeMs =
    playableDurationMs > 0 ? Math.min(rawClampedMs, playableDurationMs) : rawClampedMs;

  const state = resolveTimelinePlaybackState(
    clipsOrTimeline,
    clampedTimeMs,
    projectDurationMs,
    options
  );

  if (state.activeClip) {
    const { sourceSec } = timelineToSourceSeconds(
      clampedTimeMs,
      state.activeClip,
      mediaDurationSec
    );
    return {
      ...state,
      sourceTimeSec: sourceSec,
    };
  }

  return state;
}

