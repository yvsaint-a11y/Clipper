import type { TextStyle } from '@/src/types/timeline';
import {
  type CanonicalClipTransform,
  DEFAULT_CLIP_TRANSFORM,
  mergeClipTransform,
  normalizeClipTransform,
} from './clipTransform';
import { DEFAULT_CLIP_CROP, normalizeClipCrop } from './clipCrop';

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 240;
export const DEFAULT_TEXT_DURATION_MS = 5000;

export type TextAlignment = 'left' | 'center' | 'right';

export interface CanonicalTextProperties extends TextStyle {
  textContent: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  color: string;
  textAlign: TextAlignment;
  alignment: TextAlignment;
}

export interface TextClipUpdate {
  textContent?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  textAlign?: TextAlignment;
  alignment?: TextAlignment;
  color?: string;
  x?: number;
  y?: number;
  positionX?: number;
  positionY?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
}

export const DEFAULT_TEXT_PROPERTIES: CanonicalTextProperties = {
  textContent: 'Headline Text',
  fontFamily: 'Inter',
  fontSize: 48,
  fontWeight: 700,
  color: '#FFFFFF',
  textAlign: 'center',
  alignment: 'center',
};

function clampFontSize(size: unknown, fallback = DEFAULT_TEXT_PROPERTIES.fontSize): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    return fallback;
  }
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(size)));
}

function normalizeAlignment(align: unknown, fallback: TextAlignment = 'center'): TextAlignment {
  if (align === 'left' || align === 'center' || align === 'right') {
    return align;
  }
  return fallback;
}

function normalizeFontWeight(
  weight: unknown,
  fallback: number | string = DEFAULT_TEXT_PROPERTIES.fontWeight,
): number | string {
  if (typeof weight === 'number' && Number.isFinite(weight)) {
    return Math.max(100, Math.min(900, Math.round(weight / 100) * 100));
  }
  if (typeof weight === 'string' && weight.trim().length > 0) {
    return weight.trim();
  }
  return fallback;
}

function normalizeColor(color: unknown, fallback = DEFAULT_TEXT_PROPERTIES.color): string {
  if (typeof color === 'string' && color.trim().length > 0) {
    return color.trim();
  }
  return fallback;
}

/**
 * Normalizes any clip's text properties/style into a deterministic CanonicalTextProperties object.
 */
export function normalizeTextClipProperties(clipOrProps?: any): CanonicalTextProperties {
  if (!clipOrProps || typeof clipOrProps !== 'object') {
    return { ...DEFAULT_TEXT_PROPERTIES };
  }

  const tp = clipOrProps.textProperties || {};
  const st = clipOrProps.style || {};

  const rawContent =
    clipOrProps.textContent !== undefined
      ? String(clipOrProps.textContent)
      : tp.textContent !== undefined
      ? String(tp.textContent)
      : clipOrProps.text !== undefined
      ? String(clipOrProps.text)
      : DEFAULT_TEXT_PROPERTIES.textContent;

  const fontFamily =
    typeof st.fontFamily === 'string' && st.fontFamily.trim()
      ? st.fontFamily.trim()
      : typeof tp.fontFamily === 'string' && tp.fontFamily.trim()
      ? tp.fontFamily.trim()
      : typeof clipOrProps.fontFamily === 'string' && clipOrProps.fontFamily.trim()
      ? clipOrProps.fontFamily.trim()
      : DEFAULT_TEXT_PROPERTIES.fontFamily;

  const fontSize = clampFontSize(
    clipOrProps.fontSize ?? tp.fontSize ?? st.fontSize,
    DEFAULT_TEXT_PROPERTIES.fontSize,
  );

  const fontWeight = normalizeFontWeight(
    clipOrProps.fontWeight ?? tp.fontWeight ?? st.fontWeight,
    DEFAULT_TEXT_PROPERTIES.fontWeight,
  );

  const textAlign = normalizeAlignment(
    clipOrProps.textAlign ??
      clipOrProps.alignment ??
      tp.textAlign ??
      tp.alignment ??
      st.textAlign,
    DEFAULT_TEXT_PROPERTIES.textAlign,
  );

  const color = normalizeColor(
    clipOrProps.color ?? tp.color ?? st.color,
    DEFAULT_TEXT_PROPERTIES.color,
  );

  return {
    textContent: rawContent,
    fontFamily,
    fontSize,
    fontWeight,
    color,
    textAlign,
    alignment: textAlign,
  };
}

/**
 * Merges partial text clip updates (both style/content and transform position/opacity) onto an existing text clip.
 */
export function applyTextClipUpdates(clip: any, updates: TextClipUpdate): void {
  const currentProps = normalizeTextClipProperties(clip);

  const nextContent =
    updates.textContent !== undefined
      ? String(updates.textContent)
      : updates.text !== undefined
      ? String(updates.text)
      : currentProps.textContent;

  const nextFontFamily =
    updates.fontFamily !== undefined && updates.fontFamily.trim()
      ? updates.fontFamily.trim()
      : currentProps.fontFamily;

  const nextFontSize =
    updates.fontSize !== undefined
      ? clampFontSize(updates.fontSize, currentProps.fontSize)
      : currentProps.fontSize;

  const nextFontWeight =
    updates.fontWeight !== undefined
      ? normalizeFontWeight(updates.fontWeight, currentProps.fontWeight)
      : currentProps.fontWeight;

  const nextAlign =
    updates.textAlign !== undefined || updates.alignment !== undefined
      ? normalizeAlignment(updates.textAlign ?? updates.alignment, currentProps.textAlign)
      : currentProps.textAlign;

  const nextColor =
    updates.color !== undefined
      ? normalizeColor(updates.color, currentProps.color)
      : currentProps.color;

  const mergedProps: CanonicalTextProperties = {
    textContent: nextContent,
    fontFamily: nextFontFamily,
    fontSize: nextFontSize,
    fontWeight: nextFontWeight,
    color: nextColor,
    textAlign: nextAlign,
    alignment: nextAlign,
  };

  clip.textContent = mergedProps.textContent;
  clip.fontSize = mergedProps.fontSize;
  clip.fontWeight = mergedProps.fontWeight;
  clip.textAlign = mergedProps.textAlign;
  clip.alignment = mergedProps.alignment;
  clip.color = mergedProps.color;
  clip.style = {
    fontFamily: mergedProps.fontFamily,
    fontSize: mergedProps.fontSize,
    fontWeight: mergedProps.fontWeight,
    color: mergedProps.color,
    textAlign: mergedProps.textAlign,
  };
  clip.textProperties = { ...mergedProps };

  // If position/scale/rotation/opacity updates were included, merge into clip.transform
  if (
    updates.x !== undefined ||
    updates.y !== undefined ||
    updates.positionX !== undefined ||
    updates.positionY !== undefined ||
    updates.scale !== undefined ||
    updates.rotation !== undefined ||
    updates.opacity !== undefined
  ) {
    clip.transform = mergeClipTransform(clip.transform, {
      x: updates.x,
      y: updates.y,
      positionX: updates.positionX,
      positionY: updates.positionY,
      scale: updates.scale,
      rotation: updates.rotation,
      opacity: updates.opacity,
    });
  } else if (!clip.transform) {
    clip.transform = { ...DEFAULT_CLIP_TRANSFORM };
  }
}

/**
 * Builds a complete canonical text clip object ready for insertion into a timeline track.
 */
export function createCanonicalTextClip(params: {
  id?: string;
  trackId: string;
  name?: string;
  startTimeMs?: number;
  endTimeMs?: number;
  durationMs?: number;
  textContent?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  textAlign?: TextAlignment;
  alignment?: TextAlignment;
  color?: string;
  x?: number;
  y?: number;
  positionX?: number;
  positionY?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
}): any {
  const rand = Math.random().toString(36).substring(2, 7);
  const id = params.id || `clip-text-${Date.now()}-${rand}`;
  const startTimeMs = Math.max(0, Math.round(params.startTimeMs ?? 0));
  const durationMs = Math.max(100, Math.round(params.durationMs ?? DEFAULT_TEXT_DURATION_MS));
  const endTimeMs =
    params.endTimeMs !== undefined && params.endTimeMs > startTimeMs
      ? Math.round(params.endTimeMs)
      : startTimeMs + durationMs;

  const transform: CanonicalClipTransform = mergeClipTransform(DEFAULT_CLIP_TRANSFORM, {
    x: params.x,
    y: params.y,
    positionX: params.positionX,
    positionY: params.positionY,
    scale: params.scale,
    rotation: params.rotation,
    opacity: params.opacity,
  });

  const clip: any = {
    id,
    trackId: params.trackId,
    name: params.name || 'Text Overlay',
    clipType: 'text',
    startTimeMs,
    endTimeMs,
    sourceStartMs: 0,
    sourceEndMs: endTimeMs - startTimeMs,
    mediaAssetId: null,
    transform,
    crop: { ...normalizeClipCrop(DEFAULT_CLIP_CROP) },
    audioProperties: null,
    textProperties: { ...DEFAULT_TEXT_PROPERTIES },
    style: {
      fontFamily: DEFAULT_TEXT_PROPERTIES.fontFamily,
      fontSize: DEFAULT_TEXT_PROPERTIES.fontSize,
      fontWeight: DEFAULT_TEXT_PROPERTIES.fontWeight,
      color: DEFAULT_TEXT_PROPERTIES.color,
      textAlign: DEFAULT_TEXT_PROPERTIES.textAlign,
    },
    textContent: DEFAULT_TEXT_PROPERTIES.textContent,
    fontSize: DEFAULT_TEXT_PROPERTIES.fontSize,
    fontWeight: DEFAULT_TEXT_PROPERTIES.fontWeight,
    textAlign: DEFAULT_TEXT_PROPERTIES.textAlign,
    alignment: DEFAULT_TEXT_PROPERTIES.alignment,
    color: DEFAULT_TEXT_PROPERTIES.color,
    captionProperties: null,
    transitions: null,
    effects: [],
    animations: [],
    slotBinding: null,
  };

  applyTextClipUpdates(clip, {
    textContent: params.textContent,
    fontFamily: params.fontFamily,
    fontSize: params.fontSize,
    fontWeight: params.fontWeight,
    textAlign: params.textAlign,
    alignment: params.alignment,
    color: params.color,
  });

  return clip;
}

/**
 * Checks whether a text clip is visible at the given timeline playhead position:
 * startTimeMs <= currentTimeMs < endTimeMs
 */
export function isTextClipVisibleAtTime(clip: any, currentTimeMs: number): boolean {
  if (!clip || clip.clipType !== 'text') return false;
  if (typeof currentTimeMs !== 'number' || !Number.isFinite(currentTimeMs)) return false;
  const start = Number(clip.startTimeMs ?? 0);
  const end = Number(clip.endTimeMs ?? 0);
  return currentTimeMs >= start && currentTimeMs < end;
}

/**
 * Returns all text clips across unmuted timeline tracks that are visible at currentTimeMs.
 */
export function getActiveTextClipsAtTime(
  timeline?: { tracks?: Array<{ isMuted?: boolean; clips?: any[] }> } | null,
  currentTimeMs: number = 0,
): any[] {
  if (!timeline?.tracks) return [];
  const active: any[] = [];
  for (const track of timeline.tracks) {
    if (track.isMuted) continue;
    for (const clip of track.clips || []) {
      if (isTextClipVisibleAtTime(clip, currentTimeMs)) {
        active.push({
          ...clip,
          textProperties: normalizeTextClipProperties(clip),
          transform: normalizeClipTransform(clip.transform),
        });
      }
    }
  }
  return active;
}
