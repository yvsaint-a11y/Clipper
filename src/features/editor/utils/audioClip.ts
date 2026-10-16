import type { AudioProperties } from '@/src/types/timeline';

export const MIN_AUDIO_VOLUME = 0;
export const MAX_AUDIO_VOLUME = 2;
export const DEFAULT_AUDIO_VOLUME = 1;

export interface AudioClipUpdate {
  volume?: number;
  muted?: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
}

export const DEFAULT_AUDIO_PROPERTIES: AudioProperties = {
  volume: DEFAULT_AUDIO_VOLUME,
  fadeInMs: 0,
  fadeOutMs: 0,
  muted: false,
};

function roundVolume(val: number): number {
  return Math.round(val * 10000) / 10000;
}

function clampVolume(val: unknown, fallback = DEFAULT_AUDIO_VOLUME): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return fallback;
  }
  return roundVolume(Math.max(MIN_AUDIO_VOLUME, Math.min(MAX_AUDIO_VOLUME, val)));
}

function clampFadeMs(val: unknown, maxDurationMs?: number, fallback = 0): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return fallback;
  }
  const clampedMin = Math.max(0, Math.round(val));
  if (typeof maxDurationMs === 'number' && Number.isFinite(maxDurationMs) && maxDurationMs > 0) {
    return Math.min(clampedMin, Math.round(maxDurationMs));
  }
  return clampedMin;
}

/**
 * Normalizes any clip or audioProperties object into a deterministic AudioProperties structure.
 */
export function normalizeAudioClipProperties(
  clipOrProps?: any,
  clipDurationMs?: number,
): AudioProperties {
  if (!clipOrProps || typeof clipOrProps !== 'object') {
    return { ...DEFAULT_AUDIO_PROPERTIES };
  }

  const ap =
    clipOrProps.audioProperties && typeof clipOrProps.audioProperties === 'object'
      ? clipOrProps.audioProperties
      : clipOrProps;

  const durationMs =
    clipDurationMs !== undefined
      ? clipDurationMs
      : typeof clipOrProps.endTimeMs === 'number' && typeof clipOrProps.startTimeMs === 'number'
      ? Math.max(0, clipOrProps.endTimeMs - clipOrProps.startTimeMs)
      : undefined;

  const volume = clampVolume(ap.volume ?? clipOrProps.volume, DEFAULT_AUDIO_PROPERTIES.volume);
  const muted = Boolean(ap.muted ?? clipOrProps.muted ?? DEFAULT_AUDIO_PROPERTIES.muted);
  const fadeInMs = clampFadeMs(ap.fadeInMs ?? clipOrProps.fadeInMs, durationMs, 0);
  const fadeOutMs = clampFadeMs(ap.fadeOutMs ?? clipOrProps.fadeOutMs, durationMs, 0);

  return {
    volume,
    muted,
    fadeInMs,
    fadeOutMs,
  };
}

/**
 * Merges partial audio property updates onto an existing clip or AudioProperties object.
 */
export function mergeAudioClipProperties(
  existing: any,
  updates: AudioClipUpdate,
  clipDurationMs?: number,
): AudioProperties {
  const base = normalizeAudioClipProperties(existing, clipDurationMs);

  const volume =
    updates.volume !== undefined
      ? clampVolume(updates.volume, base.volume)
      : base.volume;

  const muted =
    updates.muted !== undefined
      ? Boolean(updates.muted)
      : base.muted;

  const fadeInMs =
    updates.fadeInMs !== undefined
      ? clampFadeMs(updates.fadeInMs, clipDurationMs, base.fadeInMs)
      : base.fadeInMs;

  const fadeOutMs =
    updates.fadeOutMs !== undefined
      ? clampFadeMs(updates.fadeOutMs, clipDurationMs, base.fadeOutMs)
      : base.fadeOutMs;

  return {
    volume,
    muted,
    fadeInMs,
    fadeOutMs,
  };
}

/**
 * Applies partial audio property updates directly onto a canonical timeline clip.
 */
export function applyAudioClipUpdates(clip: any, updates: AudioClipUpdate): void {
  const clipDurationMs =
    typeof clip.endTimeMs === 'number' && typeof clip.startTimeMs === 'number'
      ? Math.max(0, clip.endTimeMs - clip.startTimeMs)
      : undefined;

  const merged = mergeAudioClipProperties(clip, updates, clipDurationMs);
  clip.audioProperties = merged;
  clip.volume = merged.volume;
  clip.muted = merged.muted;
  clip.fadeInMs = merged.fadeInMs;
  clip.fadeOutMs = merged.fadeOutMs;
}

/**
 * Resets a clip's audio properties back to canonical defaults (volume=1, muted=false, fadeInMs=0, fadeOutMs=0).
 */
export function resetAudioClipProperties(clip: any): void {
  clip.audioProperties = { ...DEFAULT_AUDIO_PROPERTIES };
  clip.volume = DEFAULT_AUDIO_PROPERTIES.volume;
  clip.muted = DEFAULT_AUDIO_PROPERTIES.muted;
  clip.fadeInMs = DEFAULT_AUDIO_PROPERTIES.fadeInMs;
  clip.fadeOutMs = DEFAULT_AUDIO_PROPERTIES.fadeOutMs;
}

/**
 * Deterministically calculates the effective playback volume at currentTimeMs based on:
 * - current timeline time (currentTimeMs)
 * - clip start/end (startTimeMs, endTimeMs)
 * - fadeInMs
 * - fadeOutMs
 * - volume
 * - muted (and optional trackMuted)
 */
export function calculateEffectiveAudioVolume(
  clip: {
    startTimeMs: number;
    endTimeMs: number;
    audioProperties?: Partial<AudioProperties> | null;
    volume?: number;
    muted?: boolean;
    fadeInMs?: number;
    fadeOutMs?: number;
  } | null | undefined,
  currentTimeMs: number,
  trackMuted: boolean = false,
): number {
  if (!clip || trackMuted) return 0;
  if (typeof currentTimeMs !== 'number' || !Number.isFinite(currentTimeMs)) return 0;

  const startMs = Number(clip.startTimeMs ?? 0);
  const endMs = Number(clip.endTimeMs ?? 0);
  const durationMs = Math.max(0, endMs - startMs);
  if (durationMs <= 0) return 0;

  // Outside clip bounds -> 0 output
  if (currentTimeMs < startMs || currentTimeMs > endMs) {
    return 0;
  }

  const props = normalizeAudioClipProperties(clip, durationMs);
  if (props.muted || props.volume <= 0) {
    return 0;
  }

  const elapsedMs = currentTimeMs - startMs;
  const remainingMs = endMs - currentTimeMs;

  let fadeFactor = 1;

  if (props.fadeInMs > 0 && elapsedMs < props.fadeInMs) {
    fadeFactor = Math.min(fadeFactor, Math.max(0, elapsedMs / props.fadeInMs));
  }

  if (props.fadeOutMs > 0 && remainingMs < props.fadeOutMs) {
    fadeFactor = Math.min(fadeFactor, Math.max(0, remainingMs / props.fadeOutMs));
  }

  return roundVolume(props.volume * fadeFactor);
}

/**
 * Clamps effective audio volume into the [0, 1] range required by HTMLMediaElement.volume.
 */
export function toHtmlMediaElementVolume(effectiveVolume: number): number {
  if (typeof effectiveVolume !== 'number' || !Number.isFinite(effectiveVolume)) {
    return 0;
  }
  return Math.max(0, Math.min(1, roundVolume(effectiveVolume)));
}
