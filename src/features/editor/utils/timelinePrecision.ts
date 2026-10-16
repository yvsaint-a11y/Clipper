/**
 * Phase 9B: Timeline Precision & Interaction Utilities
 *
 * Single authoritative conversion and snapping utilities for the timeline:
 * - Deterministic ms ↔ pixel conversion using canonical zoomLevel
 * - Playhead precision and clamping
 * - Basic clip snapping (timeline start 0ms, project end, neighboring clip start/end, playhead)
 * - Drag and trim boundary clamping
 */

export const MIN_ZOOM_LEVEL = 10;
export const MAX_ZOOM_LEVEL = 300;
export const DEFAULT_ZOOM_LEVEL = 50;
export const MIN_CLIP_DURATION_MS = 100;
export const DEFAULT_SNAP_THRESHOLD_MS = 150;

export interface SnapResult {
  snappedMs: number;
  didSnap: boolean;
  targetMs: number | null;
}

export interface ClipMoveSnapResult {
  startTimeMs: number;
  endTimeMs: number;
  didSnap: boolean;
  snappedEdge: 'start' | 'end' | null;
  targetMs: number | null;
}

export interface SnapTargetsInput {
  tracks?: Array<{
    id?: string;
    clips?: Array<{
      id: string;
      startTimeMs: number;
      endTimeMs: number;
    }>;
  }> | null;
  activeClipId?: string | null;
  playheadMs?: number | null;
  projectEndMs?: number | null;
}

/**
 * Normalizes zoomLevel into deterministic pixels-per-second scale.
 * 10% zoom = 10px/s, 50% zoom = 50px/s, 100% zoom = 100px/s, 300% zoom = 300px/s.
 */
export function getPixelsPerSecond(zoomLevel: number): number {
  if (typeof zoomLevel !== 'number' || Number.isNaN(zoomLevel) || !Number.isFinite(zoomLevel)) {
    return DEFAULT_ZOOM_LEVEL;
  }
  return Math.max(MIN_ZOOM_LEVEL, Math.min(MAX_ZOOM_LEVEL, zoomLevel));
}

/**
 * Deterministically converts canonical timeline milliseconds into visual pixel offset.
 * Avoids negative pixel offsets.
 */
export function msToPx(timeMs: number, zoomLevel: number): number {
  const safeMs = typeof timeMs === 'number' && Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  const pps = getPixelsPerSecond(zoomLevel);
  return Math.round(((safeMs * pps) / 1000) * 10000) / 10000;
}

/**
 * Deterministically converts visual pixel position into integer timeline milliseconds.
 * Rounds to integer milliseconds to eliminate floating-point drift and optionally clamps to maxDurationMs.
 */
export function pxToMs(px: number, zoomLevel: number, maxDurationMs?: number): number {
  const safePx = typeof px === 'number' && Number.isFinite(px) ? Math.max(0, px) : 0;
  const pps = getPixelsPerSecond(zoomLevel);
  const rawMs = Math.round((safePx / pps) * 1000);

  if (typeof maxDurationMs === 'number' && Number.isFinite(maxDurationMs) && maxDurationMs > 0) {
    return Math.max(0, Math.min(rawMs, Math.round(maxDurationMs)));
  }

  return Math.max(0, rawMs);
}

/**
 * Converts a horizontal drag delta in pixels into integer milliseconds.
 */
export function deltaPxToDeltaMs(deltaPx: number, zoomLevel: number): number {
  if (typeof deltaPx !== 'number' || !Number.isFinite(deltaPx)) return 0;
  const pps = getPixelsPerSecond(zoomLevel);
  return Math.round((deltaPx / pps) * 1000);
}

/**
 * Computes the effective timeline boundary in milliseconds from timeline, project metadata, and clips.
 */
export function getEffectiveTimelineDurationMs(
  timeline?: { totalDurationMs?: number | null; tracks?: Array<{ clips?: Array<{ endTimeMs: number }> }> } | null,
  projectDurationMs?: number | null,
): number {
  let maxDuration = Math.max(
    0,
    Number(timeline?.totalDurationMs) || 0,
    Number(projectDurationMs) || 0,
  );

  if (timeline?.tracks) {
    for (const track of timeline.tracks) {
      for (const clip of track.clips || []) {
        if (typeof clip.endTimeMs === 'number' && clip.endTimeMs > maxDuration) {
          maxDuration = clip.endTimeMs;
        }
      }
    }
  }

  if (maxDuration <= 0) {
    maxDuration = 60000;
  }

  return Math.round(maxDuration);
}

/**
 * Clamps a playhead timestamp in milliseconds to [0, maxDurationMs] as an integer.
 */
export function clampPlayheadMs(timeMs: number, maxDurationMs: number): number {
  if (typeof timeMs !== 'number' || !Number.isFinite(timeMs)) return 0;
  const safeMax =
    typeof maxDurationMs === 'number' && Number.isFinite(maxDurationMs) && maxDurationMs > 0
      ? Math.round(maxDurationMs)
      : 60000;
  return Math.max(0, Math.min(Math.round(timeMs), safeMax));
}

/**
 * Collects canonical snap targets in milliseconds:
 * - timeline start (0ms)
 * - project end (if > 0)
 * - playhead position
 * - neighboring clip start & end across tracks (excluding activeClipId)
 */
export function collectSnapTargetsMs(input: SnapTargetsInput): number[] {
  const targets = new Set<number>([0]);

  if (typeof input.projectEndMs === 'number' && Number.isFinite(input.projectEndMs) && input.projectEndMs > 0) {
    targets.add(Math.round(input.projectEndMs));
  }

  if (typeof input.playheadMs === 'number' && Number.isFinite(input.playheadMs) && input.playheadMs >= 0) {
    targets.add(Math.round(input.playheadMs));
  }

  if (input.tracks) {
    for (const track of input.tracks) {
      for (const clip of track.clips || []) {
        if (input.activeClipId && clip.id === input.activeClipId) continue;
        if (typeof clip.startTimeMs === 'number' && Number.isFinite(clip.startTimeMs) && clip.startTimeMs >= 0) {
          targets.add(Math.round(clip.startTimeMs));
        }
        if (typeof clip.endTimeMs === 'number' && Number.isFinite(clip.endTimeMs) && clip.endTimeMs >= 0) {
          targets.add(Math.round(clip.endTimeMs));
        }
      }
    }
  }

  return Array.from(targets).sort((a, b) => a - b);
}

/**
 * Snaps a single timeline timestamp (such as trim-start or trim-end) to the nearest target within thresholdMs.
 */
export function snapTimeMs(
  candidateMs: number,
  targetsMs: number[],
  thresholdMs: number = DEFAULT_SNAP_THRESHOLD_MS,
): SnapResult {
  const roundedCandidate = Math.round(candidateMs);
  const safeThreshold = typeof thresholdMs === 'number' && thresholdMs >= 0 ? thresholdMs : 0;

  if (safeThreshold <= 0 || !targetsMs || targetsMs.length === 0) {
    return {
      snappedMs: roundedCandidate,
      didSnap: false,
      targetMs: null,
    };
  }

  let bestTarget: number | null = null;
  let bestDistance = Infinity;

  for (const target of targetsMs) {
    if (typeof target !== 'number' || !Number.isFinite(target)) continue;
    const roundedTarget = Math.round(target);
    const distance = Math.abs(roundedCandidate - roundedTarget);
    if (distance <= safeThreshold && distance < bestDistance) {
      bestDistance = distance;
      bestTarget = roundedTarget;
    }
  }

  if (bestTarget !== null) {
    return {
      snappedMs: bestTarget,
      didSnap: true,
      targetMs: bestTarget,
    };
  }

  return {
    snappedMs: roundedCandidate,
    didSnap: false,
    targetMs: null,
  };
}

/**
 * Snaps a moving clip (evaluating both its start edge and end edge against snap targets)
 * and clamps the resulting clip position to valid non-negative bounds (and optional maxEndMs).
 */
export function snapClipMoveMs(
  candidateStartMs: number,
  clipDurationMs: number,
  targetsMs: number[],
  thresholdMs: number = DEFAULT_SNAP_THRESHOLD_MS,
  maxEndMs?: number,
): ClipMoveSnapResult {
  const safeDuration = Math.max(MIN_CLIP_DURATION_MS, Math.round(clipDurationMs));
  const maxAllowedStartMs =
    typeof maxEndMs === 'number' && Number.isFinite(maxEndMs) && maxEndMs >= safeDuration
      ? Math.round(maxEndMs) - safeDuration
      : Infinity;

  const clampedRawStart = Math.min(maxAllowedStartMs, Math.max(0, Math.round(candidateStartMs)));
  const clampedRawEnd = clampedRawStart + safeDuration;

  const startSnap = snapTimeMs(clampedRawStart, targetsMs, thresholdMs);
  const endSnap = snapTimeMs(clampedRawEnd, targetsMs, thresholdMs);

  let chosenStartMs = clampedRawStart;
  let didSnap = false;
  let snappedEdge: 'start' | 'end' | null = null;
  let targetMs: number | null = null;

  const startDist = startSnap.didSnap && startSnap.targetMs !== null ? Math.abs(clampedRawStart - startSnap.targetMs) : Infinity;
  const endDist = endSnap.didSnap && endSnap.targetMs !== null ? Math.abs(clampedRawEnd - endSnap.targetMs) : Infinity;

  if (startSnap.didSnap && startDist <= endDist && startSnap.snappedMs >= 0 && startSnap.snappedMs <= maxAllowedStartMs) {
    chosenStartMs = startSnap.snappedMs;
    didSnap = true;
    snappedEdge = 'start';
    targetMs = startSnap.targetMs;
  } else if (endSnap.didSnap && endSnap.snappedMs - safeDuration >= 0 && endSnap.snappedMs - safeDuration <= maxAllowedStartMs) {
    chosenStartMs = endSnap.snappedMs - safeDuration;
    didSnap = true;
    snappedEdge = 'end';
    targetMs = endSnap.targetMs;
  }

  const finalStartMs = Math.min(maxAllowedStartMs, Math.max(0, Math.round(chosenStartMs)));
  return {
    startTimeMs: finalStartMs,
    endTimeMs: finalStartMs + safeDuration,
    didSnap,
    snappedEdge,
    targetMs,
  };
}
