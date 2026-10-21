import type { ExportResolution, RenderSettings, CanonicalRenderSpec } from '@/src/types/render';
import { normalizeClipCrop, DEFAULT_CLIP_CROP } from './clipCrop';
import { normalizeClipTransition } from './clipTransition';

export const VALID_EXPORT_RESOLUTIONS: readonly ExportResolution[] = ['720p', '1080p'] as const;
export const VALID_EXPORT_FPS: readonly (30 | 60)[] = [30, 60] as const;

/**
 * Validates that an export resolution is supported by V1 (720p or 1080p).
 * 4K and other resolutions are strictly rejected.
 */
export function validateExportResolution(res: unknown): res is ExportResolution {
  return typeof res === 'string' && (res === '720p' || res === '1080p');
}

/**
 * Validates that frame rate is supported by V1 (30 or 60 FPS).
 */
export function validateExportFps(fps: unknown): fps is 30 | 60 {
  return typeof fps === 'number' && (fps === 30 || fps === 60);
}

/**
 * Recursively sorts all object keys to produce deterministic, canonical JSON.
 * Ignores irrelevant key insertion order differences.
 */
export function canonicalizeJson(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => JSON.stringify(key) + ':' + canonicalizeJson(value[key]));
  return '{' + entries.join(',') + '}';
}

/**
 * Computes deterministic SHA-256 hash using Web Crypto (crypto.subtle)
 * or Node.js crypto module.
 */
export async function computeRenderSpecHash(spec: any): Promise<string> {
  const canonicalStr = canonicalizeJson(spec);

  // Modern browser & Node.js 18+ Web Crypto API
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalStr);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Node.js fallback
  try {
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto.createHash('sha256').update(canonicalStr).digest('hex');
  } catch {
    throw new Error('No crypto implementation available for SHA-256 hashing.');
  }
}

/**
 * Synchronous SHA-256 computation for Node.js / backend execution.
 */
export function computeRenderSpecHashSync(spec: any): string {
  const canonicalStr = canonicalizeJson(spec);

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('node:crypto');
    return nodeCrypto.createHash('sha256').update(canonicalStr).digest('hex');
  } catch {
    // Pure JS SHA-256 fallback if require is unavailable
    return fallbackSha256(canonicalStr);
  }
}

/**
 * Lightweight, dependency-free SHA-256 implementation as synchronous fallback.
 */
function fallbackSha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  const hash: number[] = [];
  const k: number[] = [];

  let primeCounter = 0;
  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = i >= 16 ? rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3) : 0;
      const s1 = i >= 16 ? rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10) : 0;
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp1 =
        hash[7] +
        (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) +
        ch +
        k[i] +
        (i < 16 ? (w[i] = w[i] | 0) : ((w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0) | 0));
      const temp2 =
        (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export interface BuildRenderSpecInput {
  project: {
    id: string;
    name?: string;
    aspectRatio?: string;
    resolution?: string;
    fps?: number;
    durationMs?: number;
    version?: number;
    templateVersionId?: string | null;
  };
  timeline: {
    tracks: Array<{
      id?: string;
      name?: string;
      trackType?: string;
      orderIndex?: number;
      isMuted?: boolean;
      volume?: number;
      clips?: any[];
      transitions?: any[];
    }>;
    transitions?: any[];
    totalDurationMs?: number;
  };
  mediaAssets?: Array<{
    id: string;
    updatedAt?: string;
    createdAt?: string;
    originalFilename?: string;
  }>;
  exportOptions?: {
    resolution?: ExportResolution;
    fps?: 30 | 60;
    watermark?: boolean;
    crf?: number;
    bitrateKbps?: number;
  };
}

/**
 * Validates a CanonicalRenderSpec data structure.
 */
export function validateCanonicalRenderSpec(spec: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: ['Render specification must be a non-null object.'] };
  }

  const s = spec as any;

  if (!s.projectId || typeof s.projectId !== 'string') {
    errors.push('Missing or invalid projectId.');
  }

  if (!s.renderSettings || typeof s.renderSettings !== 'object') {
    errors.push('Missing renderSettings.');
  } else {
    if (!validateExportResolution(s.renderSettings.resolution)) {
      errors.push(`Invalid resolution "${s.renderSettings.resolution}". Allowed: 720p, 1080p.`);
    }
    if (!validateExportFps(s.renderSettings.fps)) {
      errors.push(`Invalid FPS "${s.renderSettings.fps}". Allowed: 30, 60.`);
    }
  }

  if (typeof s.durationMs !== 'number' || s.durationMs < 0 || isNaN(s.durationMs)) {
    errors.push('Invalid timeline durationMs (must be a non-negative number).');
  }

  if (!Array.isArray(s.tracks)) {
    errors.push('Missing or invalid tracks array.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Builds the complete CanonicalRenderSpec from the real project and timeline state.
 */
export function buildCanonicalRenderSpec(input: BuildRenderSpecInput): CanonicalRenderSpec {
  const { project, timeline, mediaAssets = [], exportOptions = {} } = input;

  if (!project || !project.id) {
    throw new Error('Cannot generate render specification: Missing project or project ID.');
  }

  // Validate or set default resolution (strictly 720p or 1080p)
  const targetResolution = exportOptions.resolution || (project.resolution as ExportResolution) || '1080p';
  if (!validateExportResolution(targetResolution)) {
    throw new Error(
      `Unsupported export resolution "${targetResolution}". Only 720p and 1080p are supported in V1.`,
    );
  }

  // Validate or set default FPS (strictly 30 or 60)
  const targetFps = exportOptions.fps || (project.fps as 30 | 60) || 30;
  if (!validateExportFps(targetFps)) {
    throw new Error(
      `Unsupported frame rate "${targetFps}". Only 30 and 60 FPS are supported in V1.`,
    );
  }

  const renderSettings: RenderSettings = {
    resolution: targetResolution,
    fps: targetFps,
    watermark: Boolean(exportOptions.watermark),
    ...(exportOptions.crf !== undefined ? { crf: exportOptions.crf } : {}),
    ...(exportOptions.bitrateKbps !== undefined ? { bitrateKbps: exportOptions.bitrateKbps } : {}),
  };

  // Collect and sort transitions
  const allTransitionsByKey = new Map<string, any>();
  if (Array.isArray(timeline.transitions)) {
    for (const raw of timeline.transitions) {
      const norm = normalizeClipTransition(raw);
      if (norm) {
        allTransitionsByKey.set(`${norm.fromClipId}->${norm.toClipId}`, norm);
      }
    }
  }

  // Normalize and sort tracks and clips deterministically
  let maxClipEndMs = 0;
  const canonicalTracks = (timeline.tracks || [])
    .map((track, trackIdx) => {
      const sortedClips = (track.clips || [])
        .map((clip: any) => {
          const startTimeMs = Math.round(Number(clip.startTimeMs ?? clip.startMs ?? 0));
          const endTimeMs = Math.round(Number(clip.endTimeMs ?? clip.endMs ?? 0));
          if (endTimeMs > maxClipEndMs) {
            maxClipEndMs = endTimeMs;
          }

          const sourceStartMs = Math.round(Number(clip.sourceStartMs ?? clip.trimStartMs ?? 0));
          const sourceEndMs = Math.round(
            Number(clip.sourceEndMs ?? clip.trimEndMs ?? (endTimeMs - startTimeMs)),
          );

          return {
            id: String(clip.id || '').trim(),
            name: String(clip.name || 'Untitled Clip').trim(),
            clipType: String(clip.clipType || clip.type || 'video').trim(),
            startTimeMs,
            endTimeMs,
            sourceStartMs,
            sourceEndMs,
            mediaAssetId: clip.mediaAssetId ? String(clip.mediaAssetId) : null,
            transform: clip.transform
              ? {
                  positionX: Number(clip.transform.positionX ?? clip.transform.x ?? 0),
                  positionY: Number(clip.transform.positionY ?? clip.transform.y ?? 0),
                  scale: Number(clip.transform.scale ?? 1),
                  rotation: Number(clip.transform.rotation ?? 0),
                  opacity: Number(clip.transform.opacity ?? 1),
                }
              : {
                  positionX: 0,
                  positionY: 0,
                  scale: 1,
                  rotation: 0,
                  opacity: 1,
                },
            crop: clip.crop ? normalizeClipCrop(clip.crop) : { ...DEFAULT_CLIP_CROP },
            audioProperties:
              clip.audioProperties ||
              clip.clipType === 'audio' ||
              clip.volume !== undefined ||
              clip.muted !== undefined
                ? {
                    volume: Number(clip.audioProperties?.volume ?? clip.volume ?? 1),
                    muted: Boolean(clip.audioProperties?.muted ?? clip.muted ?? false),
                    fadeInMs: Number(clip.audioProperties?.fadeInMs ?? clip.fadeInMs ?? 0),
                    fadeOutMs: Number(clip.audioProperties?.fadeOutMs ?? clip.fadeOutMs ?? 0),
                  }
                : null,
            textProperties: clip.textProperties
              ? {
                  text: String(clip.textProperties.text || ''),
                  fontSize: Number(clip.textProperties.fontSize ?? 48),
                  fontFamily: String(clip.textProperties.fontFamily || 'Inter'),
                  fontWeight: String(clip.textProperties.fontWeight || 'bold'),
                  color: String(clip.textProperties.color || '#FFFFFF'),
                  backgroundColor: clip.textProperties.backgroundColor || null,
                  positionX: Number(clip.textProperties.positionX ?? 0),
                  positionY: Number(clip.textProperties.positionY ?? 0),
                }
              : null,
            captionProperties: clip.captionProperties || null,
          };
        })
        .sort((a, b) => a.startTimeMs - b.startTimeMs || a.id.localeCompare(b.id));

      return {
        id: String(track.id || `track-${trackIdx + 1}`),
        name: String(track.name || `Track ${trackIdx + 1}`).trim(),
        trackType: String(track.trackType || 'video').trim(),
        orderIndex: Number(track.orderIndex ?? trackIdx),
        isMuted: Boolean(track.isMuted),
        volume: Number(track.volume ?? 1),
        clips: sortedClips,
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));

  const canonicalTransitions = Array.from(allTransitionsByKey.values()).sort(
    (a, b) =>
      a.trackId.localeCompare(b.trackId) ||
      a.fromClipId.localeCompare(b.fromClipId) ||
      a.toClipId.localeCompare(b.toClipId),
  );

  const durationMs = Math.round(
    Number(timeline.totalDurationMs || project.durationMs || maxClipEndMs || 0),
  );

  // Referenced assets signatures
  const referencedAssetIds = new Set<string>();
  for (const track of canonicalTracks) {
    for (const clip of track.clips) {
      if (clip.mediaAssetId) {
        referencedAssetIds.add(clip.mediaAssetId);
      }
    }
  }

  const assetLookup = new Map(mediaAssets.map((a) => [a.id, a]));
  const sourceAssetSignatures = Array.from(referencedAssetIds)
    .sort()
    .map((assetId) => {
      const asset = assetLookup.get(assetId);
      return {
        assetId,
        updatedAt: asset?.updatedAt || asset?.createdAt || 'static-initial',
      };
    });

  // Calculate timeline hash from the pure composition
  const compositionState = {
    aspectRatio: project.aspectRatio || '16:9',
    durationMs,
    tracks: canonicalTracks,
    transitions: canonicalTransitions,
    sourceAssetSignatures,
  };
  const timelineHash = computeRenderSpecHashSync(compositionState);

  return {
    projectId: project.id,
    projectVersion: project.version ?? 1,
    timelineHash,
    sourceAssetSignatures,
    renderSettings,
    templateVersionId: project.templateVersionId || null,
    aspectRatio: project.aspectRatio || '16:9',
    durationMs,
    tracks: canonicalTracks,
    transitions: canonicalTransitions,
  };
}
