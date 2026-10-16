import type { BasicTransitionType, ClipTransition } from '@/src/types/timeline';
import { normalizeClipTransform } from './clipTransform';

export const SUPPORTED_TRANSITION_TYPES: readonly BasicTransitionType[] = ['cut', 'crossfade'] as const;
export const DEFAULT_TRANSITION_DURATION_MS = 500;
export const MIN_TRANSITION_DURATION_MS = 1;
export const MAX_ADJACENT_GAP_MS = 50;

export interface ClipTransitionInput {
  id?: string;
  fromClipId: string;
  toClipId: string;
  type?: BasicTransitionType;
  durationMs?: number;
}

export interface ClipTransitionUpdate {
  id?: string;
  type?: BasicTransitionType;
  durationMs?: number;
}

export interface TransitionValidationResult {
  valid: boolean;
  reason?: string;
  track?: any;
  fromClip?: any;
  toClip?: any;
  maxDurationMs?: number;
  boundaryMs?: number;
}

export interface TransitionEvaluationState {
  transitionId: string;
  type: BasicTransitionType;
  fromClipId: string;
  toClipId: string;
  boundaryMs: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  isInTransition: boolean;
  progress: number;
  activeClipId: string;
  outgoingOpacity: number;
  incomingOpacity: number;
  outgoingAudioFactor: number;
  incomingAudioFactor: number;
}

function round4(val: number): number {
  return Math.round(val * 10000) / 10000;
}

export function isValidTransitionType(type: unknown): type is BasicTransitionType {
  return type === 'cut' || type === 'crossfade';
}

export function getClipDurationMs(clip: any): number {
  if (!clip || typeof clip !== 'object') return 0;
  const start = Number(clip.startTimeMs ?? 0);
  const end = Number(clip.endTimeMs ?? 0);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round(end - start));
}

export function getMaxTransitionDurationMs(fromClip: any, toClip: any): number {
  const fromDuration = getClipDurationMs(fromClip);
  const toDuration = getClipDurationMs(toClip);
  if (fromDuration <= 0 || toDuration <= 0) return 0;
  return Math.min(fromDuration, toDuration);
}

function isCompatibleTransitionClip(clip: any): boolean {
  if (!clip || typeof clip !== 'object') return false;
  const type = clip.clipType || clip.type || 'video';
  return type === 'video' || type === 'image';
}

export function getSortedTrackClips(track: any): any[] {
  const clips = Array.isArray(track?.clips) ? [...track.clips] : [];
  return clips.sort(
    (a, b) =>
      Number(a.startTimeMs ?? 0) - Number(b.startTimeMs ?? 0) ||
      String(a.id || '').localeCompare(String(b.id || '')),
  );
}

/**
 * Validates whether two clips can have a transition with the given type and durationMs.
 */
export function validateAdjacentClipTransition(params: {
  timeline: any;
  fromClipId: string;
  toClipId: string;
  type?: unknown;
  durationMs?: unknown;
}): TransitionValidationResult {
  const { timeline, fromClipId, toClipId } = params;
  if (!timeline || !Array.isArray(timeline.tracks)) {
    return { valid: false, reason: 'Timeline is missing or invalid.' };
  }
  if (!fromClipId || !toClipId || fromClipId === toClipId) {
    return { valid: false, reason: 'fromClipId and toClipId must be distinct clip identifiers.' };
  }

  const transitionType = params.type ?? 'crossfade';
  if (!isValidTransitionType(transitionType)) {
    return { valid: false, reason: 'Transition type must be cut or crossfade.' };
  }

  let foundFromTrack: any = null;
  let foundToTrack: any = null;
  let fromClip: any = null;
  let toClip: any = null;

  for (const track of timeline.tracks) {
    for (const clip of track.clips || []) {
      if (clip.id === fromClipId) {
        foundFromTrack = track;
        fromClip = clip;
      }
      if (clip.id === toClipId) {
        foundToTrack = track;
        toClip = clip;
      }
    }
  }

  if (!fromClip || !toClip) {
    return { valid: false, reason: 'Both clips must exist on the timeline.' };
  }

  if (foundFromTrack.id !== foundToTrack.id) {
    return { valid: false, reason: 'Both clips must be on the same track.' };
  }

  if (foundFromTrack.isLocked) {
    return { valid: false, reason: 'Cannot modify transitions on a locked track.' };
  }

  if (!isCompatibleTransitionClip(fromClip) || !isCompatibleTransitionClip(toClip)) {
    return { valid: false, reason: 'Transitions are only supported between compatible video clips.' };
  }

  const sortedClips = getSortedTrackClips(foundFromTrack);
  const fromIdx = sortedClips.findIndex((c) => c.id === fromClipId);
  const toIdx = sortedClips.findIndex((c) => c.id === toClipId);

  if (fromIdx === -1 || toIdx === -1 || toIdx !== fromIdx + 1) {
    return { valid: false, reason: 'Clips must be immediately adjacent on the same track.' };
  }

  const fromStart = Number(fromClip.startTimeMs ?? 0);
  const fromEnd = Number(fromClip.endTimeMs ?? 0);
  const toStart = Number(toClip.startTimeMs ?? 0);
  const toEnd = Number(toClip.endTimeMs ?? 0);

  if (toStart < fromStart || toEnd <= fromEnd) {
    return { valid: false, reason: 'Clips do not have compatible sequential timeline positions.' };
  }

  const gapMs = Math.abs(toStart - fromEnd);
  if (gapMs > MAX_ADJACENT_GAP_MS) {
    return {
      valid: false,
      reason: `Clips are separated by ${gapMs}ms and are not adjacent.`,
    };
  }

  const maxDurationMs = getMaxTransitionDurationMs(fromClip, toClip);
  if (maxDurationMs <= 0) {
    return { valid: false, reason: 'Clips must have positive duration.' };
  }

  const requestedDuration =
    params.durationMs !== undefined
      ? Number(params.durationMs)
      : Math.min(DEFAULT_TRANSITION_DURATION_MS, maxDurationMs);

  if (!Number.isFinite(requestedDuration) || requestedDuration <= 0) {
    return { valid: false, reason: 'Transition durationMs must be greater than 0.' };
  }

  const roundedDurationMs = Math.round(requestedDuration);
  if (roundedDurationMs <= 0) {
    return { valid: false, reason: 'Transition durationMs must be at least 1ms.' };
  }

  if (roundedDurationMs > maxDurationMs) {
    return {
      valid: false,
      reason: `Transition duration (${roundedDurationMs}ms) exceeds maximum available boundary (${maxDurationMs}ms).`,
    };
  }

  const boundaryMs = Math.round((fromEnd + toStart) / 2);

  return {
    valid: true,
    track: foundFromTrack,
    fromClip,
    toClip,
    maxDurationMs,
    boundaryMs,
  };
}

/**
 * Normalizes a raw transition object into a canonical ClipTransition.
 */
export function normalizeClipTransition(raw: any, fallbackTrackId = ''): ClipTransition | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.fromClipId || !raw.toClipId) return null;
  const type: BasicTransitionType = isValidTransitionType(raw.type) ? raw.type : 'crossfade';
  const durationMs = Math.max(1, Math.round(Number(raw.durationMs ?? DEFAULT_TRANSITION_DURATION_MS)));
  return {
    id: String(raw.id || `tr-${raw.fromClipId}-${raw.toClipId}`),
    type,
    durationMs,
    fromClipId: String(raw.fromClipId),
    toClipId: String(raw.toClipId),
    trackId: String(raw.trackId || fallbackTrackId),
  };
}

/**
 * Collects all transitions across timeline.transitions and track.transitions without duplicates.
 */
export function collectTimelineTransitions(timeline: any): ClipTransition[] {
  if (!timeline || typeof timeline !== 'object') return [];
  const byKey = new Map<string, ClipTransition>();

  if (Array.isArray(timeline.transitions)) {
    for (const raw of timeline.transitions) {
      const norm = normalizeClipTransition(raw);
      if (norm) {
        byKey.set(`${norm.fromClipId}->${norm.toClipId}`, norm);
      }
    }
  }

  if (Array.isArray(timeline.tracks)) {
    for (const track of timeline.tracks) {
      if (Array.isArray(track.transitions)) {
        for (const raw of track.transitions) {
          const norm = normalizeClipTransition(raw, track.id);
          if (norm) {
            byKey.set(`${norm.fromClipId}->${norm.toClipId}`, norm);
          }
        }
      }
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) =>
      a.trackId.localeCompare(b.trackId) ||
      a.fromClipId.localeCompare(b.fromClipId) ||
      a.toClipId.localeCompare(b.toClipId) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Prunes any transitions whose clips were deleted or are no longer adjacent,
 * and synchronizes track.transitions and timeline.transitions.
 */
export function syncAndPruneTimelineTransitions(timeline: any): ClipTransition[] {
  if (!timeline || !Array.isArray(timeline.tracks)) return [];
  const existing = collectTimelineTransitions(timeline);
  const validTransitions: ClipTransition[] = [];

  for (const tr of existing) {
    const check = validateAdjacentClipTransition({
      timeline,
      fromClipId: tr.fromClipId,
      toClipId: tr.toClipId,
      type: tr.type,
      durationMs: Math.min(tr.durationMs, 1), // check adjacency first
    });
    if (check.valid && check.track && check.maxDurationMs) {
      const clampedDurationMs = Math.max(1, Math.min(tr.durationMs, check.maxDurationMs));
      validTransitions.push({
        id: tr.id,
        type: tr.type,
        durationMs: clampedDurationMs,
        fromClipId: tr.fromClipId,
        toClipId: tr.toClipId,
        trackId: check.track.id,
      });
    }
  }

  for (const track of timeline.tracks) {
    track.transitions = validTransitions.filter((t) => t.trackId === track.id);
  }
  timeline.transitions = validTransitions;
  return validTransitions;
}

/**
 * Finds all adjacent compatible clip pairs on a track and any transition currently attached between them.
 */
export function getTrackAdjacentClipPairs(
  track: any,
  timeline: any,
): Array<{
  fromClip: any;
  toClip: any;
  boundaryMs: number;
  maxDurationMs: number;
  transition: ClipTransition | null;
}> {
  if (!track || !Array.isArray(track.clips) || track.clips.length < 2) return [];
  const sorted = getSortedTrackClips(track);
  const allTransitions = collectTimelineTransitions(timeline);
  const pairs: Array<{
    fromClip: any;
    toClip: any;
    boundaryMs: number;
    maxDurationMs: number;
    transition: ClipTransition | null;
  }> = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const fromClip = sorted[i];
    const toClip = sorted[i + 1];
    const check = validateAdjacentClipTransition({
      timeline,
      fromClipId: fromClip.id,
      toClipId: toClip.id,
      type: 'crossfade',
      durationMs: 1,
    });
    if (check.valid && check.maxDurationMs && check.boundaryMs !== undefined) {
      const existing =
        allTransitions.find(
          (t) => t.fromClipId === fromClip.id && t.toClipId === toClip.id,
        ) || null;
      pairs.push({
        fromClip,
        toClip,
        boundaryMs: check.boundaryMs,
        maxDurationMs: check.maxDurationMs,
        transition: existing,
      });
    }
  }

  return pairs;
}

/**
 * Deterministically evaluates the transition progress, active clip, effective opacity, and audio contribution
 * at any timeline timestamp currentTimeMs.
 */
export function evaluateTransitionAtTime(
  transition: Pick<ClipTransition, 'id' | 'type' | 'durationMs' | 'fromClipId' | 'toClipId'>,
  fromClip: any,
  toClip: any,
  currentTimeMs: number,
): TransitionEvaluationState {
  const fromEnd = Number(fromClip?.endTimeMs ?? 0);
  const toStart = Number(toClip?.startTimeMs ?? fromEnd);
  const boundaryMs = Math.round((fromEnd + toStart) / 2);
  const maxDurationMs = getMaxTransitionDurationMs(fromClip, toClip);
  const durationMs = Math.max(
    1,
    maxDurationMs > 0
      ? Math.min(Math.round(Number(transition.durationMs || DEFAULT_TRANSITION_DURATION_MS)), maxDurationMs)
      : Math.round(Number(transition.durationMs || DEFAULT_TRANSITION_DURATION_MS)),
  );

  const halfDuration = durationMs / 2;
  const startMs = Math.round(boundaryMs - halfDuration);
  const endMs = startMs + durationMs;

  const fromBaseOpacity = normalizeClipTransform(fromClip?.transform).opacity;
  const toBaseOpacity = normalizeClipTransform(toClip?.transform).opacity;

  const activeClipId = currentTimeMs < boundaryMs ? String(fromClip?.id || transition.fromClipId) : String(toClip?.id || transition.toClipId);

  if (transition.type === 'cut') {
    const isBeforeCut = currentTimeMs < boundaryMs;
    const isInTransition = currentTimeMs >= startMs && currentTimeMs <= endMs;
    const progress =
      currentTimeMs <= startMs
        ? 0
        : currentTimeMs >= endMs
        ? 1
        : round4((currentTimeMs - startMs) / durationMs);

    return {
      transitionId: transition.id,
      type: 'cut',
      fromClipId: transition.fromClipId,
      toClipId: transition.toClipId,
      boundaryMs,
      startMs,
      endMs,
      durationMs,
      isInTransition,
      progress,
      activeClipId,
      outgoingOpacity: isBeforeCut ? fromBaseOpacity : 0,
      incomingOpacity: isBeforeCut ? 0 : toBaseOpacity,
      outgoingAudioFactor: isBeforeCut ? 1 : 0,
      incomingAudioFactor: isBeforeCut ? 0 : 1,
    };
  }

  // Crossfade
  if (currentTimeMs < startMs) {
    return {
      transitionId: transition.id,
      type: 'crossfade',
      fromClipId: transition.fromClipId,
      toClipId: transition.toClipId,
      boundaryMs,
      startMs,
      endMs,
      durationMs,
      isInTransition: false,
      progress: 0,
      activeClipId,
      outgoingOpacity: fromBaseOpacity,
      incomingOpacity: 0,
      outgoingAudioFactor: 1,
      incomingAudioFactor: 0,
    };
  }

  if (currentTimeMs > endMs) {
    return {
      transitionId: transition.id,
      type: 'crossfade',
      fromClipId: transition.fromClipId,
      toClipId: transition.toClipId,
      boundaryMs,
      startMs,
      endMs,
      durationMs,
      isInTransition: false,
      progress: 1,
      activeClipId,
      outgoingOpacity: 0,
      incomingOpacity: toBaseOpacity,
      outgoingAudioFactor: 0,
      incomingAudioFactor: 1,
    };
  }

  const progress = round4(Math.max(0, Math.min(1, (currentTimeMs - startMs) / durationMs)));
  const outgoingWeight = round4(1 - progress);
  const incomingWeight = progress;

  return {
    transitionId: transition.id,
    type: 'crossfade',
    fromClipId: transition.fromClipId,
    toClipId: transition.toClipId,
    boundaryMs,
    startMs,
    endMs,
    durationMs,
    isInTransition: true,
    progress,
    activeClipId,
    outgoingOpacity: round4(fromBaseOpacity * outgoingWeight),
    incomingOpacity: round4(toBaseOpacity * incomingWeight),
    outgoingAudioFactor: outgoingWeight,
    incomingAudioFactor: incomingWeight,
  };
}

/**
 * Resolves any active transition affecting a given clip at currentTimeMs in the timeline.
 */
export function getActiveTransitionStateForClip(
  timeline: any,
  clipId: string | null | undefined,
  currentTimeMs: number,
): {
  evaluation: TransitionEvaluationState;
  role: 'outgoing' | 'incoming';
  effectiveOpacity: number;
  effectiveAudioFactor: number;
} | null {
  if (!timeline || !clipId) return null;
  const transitions = collectTimelineTransitions(timeline);
  if (transitions.length === 0) return null;

  const clipMap = new Map<string, any>();
  for (const track of timeline.tracks || []) {
    for (const clip of track.clips || []) {
      clipMap.set(clip.id, clip);
    }
  }

  for (const tr of transitions) {
    if (tr.fromClipId !== clipId && tr.toClipId !== clipId) continue;
    const fromClip = clipMap.get(tr.fromClipId);
    const toClip = clipMap.get(tr.toClipId);
    if (!fromClip || !toClip) continue;

    const evaluation = evaluateTransitionAtTime(tr, fromClip, toClip, currentTimeMs);
    if (!evaluation.isInTransition) continue;

    const role = tr.fromClipId === clipId ? 'outgoing' : 'incoming';
    return {
      evaluation,
      role,
      effectiveOpacity:
        role === 'outgoing' ? evaluation.outgoingOpacity : evaluation.incomingOpacity,
      effectiveAudioFactor:
        role === 'outgoing' ? evaluation.outgoingAudioFactor : evaluation.incomingAudioFactor,
    };
  }

  return null;
}
