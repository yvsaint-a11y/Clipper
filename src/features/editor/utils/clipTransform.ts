import type { Transform2D } from '@/src/types/timeline';

export const MIN_CLIP_SCALE = 0.01;
export const MIN_CLIP_OPACITY = 0;
export const MAX_CLIP_OPACITY = 1;

export interface CanonicalClipTransform extends Transform2D {
  x: number;
  y: number;
  positionX: number;
  positionY: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export interface ClipTransformUpdate {
  x?: number;
  y?: number;
  positionX?: number;
  positionY?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
}

export const DEFAULT_CLIP_TRANSFORM: CanonicalClipTransform = {
  x: 0,
  y: 0,
  positionX: 0,
  positionY: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
};

/**
 * Normalizes any clip transform representation into a deterministic CanonicalClipTransform
 * with sensible defaults and clamped scale (>= 0.01) and opacity (0..1).
 */
export function normalizeClipTransform(raw?: any): CanonicalClipTransform {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CLIP_TRANSFORM };
  }

  const rawX =
    typeof raw.positionX === 'number' && Number.isFinite(raw.positionX)
      ? raw.positionX
      : typeof raw.x === 'number' && Number.isFinite(raw.x)
      ? raw.x
      : typeof raw.position?.x === 'number' && Number.isFinite(raw.position.x)
      ? raw.position.x
      : DEFAULT_CLIP_TRANSFORM.x;

  const rawY =
    typeof raw.positionY === 'number' && Number.isFinite(raw.positionY)
      ? raw.positionY
      : typeof raw.y === 'number' && Number.isFinite(raw.y)
      ? raw.y
      : typeof raw.position?.y === 'number' && Number.isFinite(raw.position.y)
      ? raw.position.y
      : DEFAULT_CLIP_TRANSFORM.y;

  let rawScale = DEFAULT_CLIP_TRANSFORM.scale;
  if (typeof raw.scale === 'number' && Number.isFinite(raw.scale)) {
    rawScale = Math.max(MIN_CLIP_SCALE, raw.scale);
  } else if (typeof raw.scale?.x === 'number' && Number.isFinite(raw.scale.x)) {
    rawScale = Math.max(MIN_CLIP_SCALE, raw.scale.x);
  }

  const rawRotation =
    typeof raw.rotation === 'number' && Number.isFinite(raw.rotation)
      ? raw.rotation
      : DEFAULT_CLIP_TRANSFORM.rotation;

  const rawOpacity =
    typeof raw.opacity === 'number' && Number.isFinite(raw.opacity)
      ? Math.max(MIN_CLIP_OPACITY, Math.min(MAX_CLIP_OPACITY, raw.opacity))
      : DEFAULT_CLIP_TRANSFORM.opacity;

  return {
    x: rawX,
    y: rawY,
    positionX: rawX,
    positionY: rawY,
    scale: rawScale,
    rotation: rawRotation,
    opacity: rawOpacity,
  };
}

/**
 * Applies partial transform updates onto an existing transform with deterministic clamping.
 */
export function mergeClipTransform(
  existing: any,
  updates: ClipTransformUpdate,
): CanonicalClipTransform {
  const base = normalizeClipTransform(existing);

  let nextX = base.x;
  if (updates.positionX !== undefined && typeof updates.positionX === 'number' && Number.isFinite(updates.positionX)) {
    nextX = updates.positionX;
  } else if (updates.x !== undefined && typeof updates.x === 'number' && Number.isFinite(updates.x)) {
    nextX = updates.x;
  }

  let nextY = base.y;
  if (updates.positionY !== undefined && typeof updates.positionY === 'number' && Number.isFinite(updates.positionY)) {
    nextY = updates.positionY;
  } else if (updates.y !== undefined && typeof updates.y === 'number' && Number.isFinite(updates.y)) {
    nextY = updates.y;
  }

  let nextScale = base.scale;
  if (updates.scale !== undefined && typeof updates.scale === 'number' && Number.isFinite(updates.scale)) {
    nextScale = Math.max(MIN_CLIP_SCALE, updates.scale);
  }

  let nextRotation = base.rotation;
  if (updates.rotation !== undefined && typeof updates.rotation === 'number' && Number.isFinite(updates.rotation)) {
    nextRotation = updates.rotation;
  }

  let nextOpacity = base.opacity;
  if (updates.opacity !== undefined && typeof updates.opacity === 'number' && Number.isFinite(updates.opacity)) {
    nextOpacity = Math.max(MIN_CLIP_OPACITY, Math.min(MAX_CLIP_OPACITY, updates.opacity));
  }

  return {
    x: nextX,
    y: nextY,
    positionX: nextX,
    positionY: nextY,
    scale: nextScale,
    rotation: nextRotation,
    opacity: nextOpacity,
  };
}

/**
 * Builds inline CSS transform and opacity styles for the browser preview canvas.
 */
export function buildClipTransformStyle(raw?: any): {
  transform: string;
  opacity: number;
} {
  const t = normalizeClipTransform(raw);
  return {
    transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale}) rotate(${t.rotation}deg)`,
    opacity: t.opacity,
  };
}
