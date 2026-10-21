import type { CanonicalRenderSpec, ExportResolution } from '@/src/types/render';

/**
 * Converts milliseconds to Remotion frame number based on frame rate.
 * Uses Math.round to maintain deterministic frame boundaries.
 */
export function msToFrames(ms: number, fps: number): number {
  if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return 0;
  return Math.round((ms / 1000) * fps);
}

/**
 * Converts Remotion frame number back to milliseconds.
 */
export function framesToMs(frames: number, fps: number): number {
  if (typeof frames !== 'number' || isNaN(frames) || frames < 0) return 0;
  return Math.round((frames / fps) * 1000);
}

export interface CompositionDimensions {
  width: number;
  height: number;
}

/**
 * Calculates deterministic pixel dimensions for a composition based on aspect ratio
 * and target resolution ceiling (bounded strictly to 720p or 1080p).
 */
export function getCompositionDimensions(
  aspectRatio: string = '16:9',
  resolution: ExportResolution = '1080p',
): CompositionDimensions {
  const is1080p = resolution === '1080p';

  switch (aspectRatio) {
    case '9:16':
      return is1080p ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
    case '1:1':
      return is1080p ? { width: 1080, height: 1080 } : { width: 720, height: 720 };
    case '16:9':
    default:
      return is1080p ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
  }
}

export interface FeatureSupportReport {
  isFullySupported: boolean;
  supportedFeatures: string[];
  unsupportedFeatures: string[];
  warnings: string[];
}

export function calculateFrameAudioVolume(
  frame: number,
  durationFrames: number,
  baseVolume: number,
  isMuted: boolean,
  fadeInFrames: number,
  fadeOutFrames: number,
): number {
  if (isMuted || baseVolume <= 0 || durationFrames <= 0) return 0;

  let inFactor = 1;
  if (fadeInFrames > 0) {
    inFactor = Math.min(1, Math.max(0, frame / fadeInFrames));
  }

  let outFactor = 1;
  if (fadeOutFrames > 0) {
    outFactor = Math.min(1, Math.max(0, (durationFrames - frame) / fadeOutFrames));
  }

  const fadeFactor = Math.min(inFactor, outFactor);
  return Math.round(Math.max(0, Math.min(1, baseVolume * fadeFactor)) * 10000) / 10000;
}

/**
 * Validates which features in a CanonicalRenderSpec are supported by the V1 First Slice:
 * - Single/sequential video clips on video tracks
 * - Source timing (startFrom / endAt)
 * - Basic transforms (position, scale, opacity)
 * - Solid background
 * - Basic text overlays
 * - Independent audio tracks and volume fade envelopes
 *
 * Explicitly flags complex features that await subsequent iterations (e.g. shader transitions).
 */
export function checkRenderSpecFeatureSupport(spec: CanonicalRenderSpec): FeatureSupportReport {
  const supportedFeatures: string[] = [
    'Resolution & FPS configuration (720p/1080p, 30/60fps)',
    'Timeline frame calculation & duration',
    'Sequential video tracks and clip layout',
    'Sequential video and image clips on tracks',
    'Independent audio tracks with volume control and fade envelopes',
    'Source trim timing (sourceStartMs, sourceEndMs)',
    'Visual transforms (positionX, positionY, scale, rotation, opacity, crop)',
    'Embedded clip audio volume and mute control',
    'Solid background rendering',
    'Single and multi-line text clip overlays',
  ];

  const unsupportedFeatures: string[] = [];
  const warnings: string[] = [];

  // Check for complex transitions
  if (Array.isArray(spec.transitions) && spec.transitions.length > 0) {
    warnings.push(
      `${spec.transitions.length} transition(s) detected. Slice 1 uses standard cut sequencing; advanced shader blending will be applied in Phase 10C.`,
    );
  }

  // Check for audio-only separate tracks
  const hasAudioOnlyTracks = (spec.tracks || []).some((t) => t.trackType === 'audio');
  if (hasAudioOnlyTracks) {
    warnings.push(
      'Separate background audio tracks detected and mixed into export. Advanced audio DSP (EQ, compression, EBU R128 loudness normalization) is deferred.',
    );
  }

  return {
    isFullySupported: unsupportedFeatures.length === 0,
    supportedFeatures,
    unsupportedFeatures,
    warnings,
  };
}
