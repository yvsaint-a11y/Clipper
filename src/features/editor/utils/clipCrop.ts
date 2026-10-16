import type { CropBox } from '@/src/types/timeline';

export const MIN_CROP_EDGE = 0;
export const MAX_CROP_EDGE = 1;
export const MIN_VISIBLE_CROP_SPAN = 0.05; // At least 5% of width/height must remain visible
export const MAX_COMBINED_AXIS_CROP = 1 - MIN_VISIBLE_CROP_SPAN; // 0.95

export interface CanonicalClipCrop extends CropBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ClipCropUpdate {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export const DEFAULT_CLIP_CROP: CanonicalClipCrop = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

function roundCropValue(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clampSingleEdge(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return roundCropValue(Math.max(MIN_CROP_EDGE, Math.min(MAX_COMBINED_AXIS_CROP, value)));
}

/**
 * Normalizes any clip crop representation into a deterministic CanonicalClipCrop
 * with values in [0, 1] and prevents combined opposite edges from removing 100% of the visual area.
 */
export function normalizeClipCrop(raw?: any): CanonicalClipCrop {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CLIP_CROP };
  }

  let top = clampSingleEdge(raw.top ?? raw.y, 0);
  let left = clampSingleEdge(raw.left ?? raw.x, 0);

  let right = 0;
  if (typeof raw.right === 'number' && Number.isFinite(raw.right)) {
    right = clampSingleEdge(raw.right, 0);
  } else if (typeof raw.width === 'number' && Number.isFinite(raw.width)) {
    right = clampSingleEdge(1 - left - raw.width, 0);
  }

  let bottom = 0;
  if (typeof raw.bottom === 'number' && Number.isFinite(raw.bottom)) {
    bottom = clampSingleEdge(raw.bottom, 0);
  } else if (typeof raw.height === 'number' && Number.isFinite(raw.height)) {
    bottom = clampSingleEdge(1 - top - raw.height, 0);
  }

  if (top + bottom > MAX_COMBINED_AXIS_CROP) {
    bottom = roundCropValue(Math.max(0, MAX_COMBINED_AXIS_CROP - top));
  }

  if (left + right > MAX_COMBINED_AXIS_CROP) {
    right = roundCropValue(Math.max(0, MAX_COMBINED_AXIS_CROP - left));
  }

  return {
    top,
    right,
    bottom,
    left,
  };
}

/**
 * Merges partial crop edge updates onto an existing crop state, clamping each edge to [0, 1]
 * and preventing combined top+bottom or left+right from removing the entire visual frame.
 */
export function mergeClipCrop(
  existing: any,
  updates: ClipCropUpdate,
): CanonicalClipCrop {
  const base = normalizeClipCrop(existing);

  let top =
    updates.top !== undefined && typeof updates.top === 'number' && Number.isFinite(updates.top)
      ? clampSingleEdge(updates.top, base.top)
      : base.top;

  let bottom =
    updates.bottom !== undefined && typeof updates.bottom === 'number' && Number.isFinite(updates.bottom)
      ? clampSingleEdge(updates.bottom, base.bottom)
      : base.bottom;

  let left =
    updates.left !== undefined && typeof updates.left === 'number' && Number.isFinite(updates.left)
      ? clampSingleEdge(updates.left, base.left)
      : base.left;

  let right =
    updates.right !== undefined && typeof updates.right === 'number' && Number.isFinite(updates.right)
      ? clampSingleEdge(updates.right, base.right)
      : base.right;

  // Enforce vertical minimum visible span (top + bottom <= 0.95)
  if (top + bottom > MAX_COMBINED_AXIS_CROP) {
    if (updates.top !== undefined && updates.bottom === undefined) {
      top = roundCropValue(Math.max(0, MAX_COMBINED_AXIS_CROP - bottom));
    } else {
      bottom = roundCropValue(Math.max(0, MAX_COMBINED_AXIS_CROP - top));
    }
  }

  // Enforce horizontal minimum visible span (left + right <= 0.95)
  if (left + right > MAX_COMBINED_AXIS_CROP) {
    if (updates.left !== undefined && updates.right === undefined) {
      left = roundCropValue(Math.max(0, MAX_COMBINED_AXIS_CROP - right));
    } else {
      right = roundCropValue(Math.max(0, MAX_COMBINED_AXIS_CROP - left));
    }
  }

  return {
    top,
    right,
    bottom,
    left,
  };
}

/**
 * Builds CSS clip-path inset string for visual preview in the browser canvas.
 */
export function buildClipCropCss(raw?: any): string {
  const c = normalizeClipCrop(raw);
  const topPct = roundCropValue(c.top * 100);
  const rightPct = roundCropValue(c.right * 100);
  const bottomPct = roundCropValue(c.bottom * 100);
  const leftPct = roundCropValue(c.left * 100);
  return `inset(${topPct}% ${rightPct}% ${bottomPct}% ${leftPct}%)`;
}
