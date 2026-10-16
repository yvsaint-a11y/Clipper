import crypto from 'crypto';
import type {
  CanonicalTemplateSnapshot,
  CanonicalTemplateTrack,
  CanonicalTemplateClip,
  CanonicalTemplateSlotDefinition,
  TemplateSlotType,
} from '../../src/types/template';
import type { AspectRatio } from '../../src/types/project';

export interface RawTemplateSlotInput {
  slotKey: string;
  label: string;
  type: string;
  description?: string | null;
  targetClipId: string;
  defaultValue?: any;
  constraints?: Record<string, any>;
  displayOrder?: number;
}

export interface RawTemplateSnapshotInput {
  templateId?: string;
  name: string;
  category?: string;
  aspectRatio?: string;
  resolution?: string;
  fps?: number;
  durationMs?: number;
  tracks?: any[];
  slots?: RawTemplateSlotInput[];
}

const VALID_SLOT_TYPES: TemplateSlotType[] = [
  'video',
  'image',
  'audio',
  'text',
  'caption',
  'logo',
  'color',
];

const VALID_ASPECT_RATIOS: AspectRatio[] = ['16:9', '9:16', '1:1'];

/**
 * Builds a deterministic, canonical snapshot of a template recipe.
 * - Strips all transient state (selection, playhead, zoom, presigned URLs, errors).
 * - Sorts tracks by orderIndex and clips by startTimeMs to ensure stable hash comparisons.
 * - Sorts slots by displayOrder and slotKey.
 */
export function buildCanonicalTemplateSnapshot(input: RawTemplateSnapshotInput): CanonicalTemplateSnapshot {
  const allClipsFound: string[] = [];

  const sortedTracks: CanonicalTemplateTrack[] = (input.tracks || [])
    .map((track: any, trackIdx: number) => {
      const sortedClips: CanonicalTemplateClip[] = (track.clips || [])
        .map((clip: any, clipIdx: number) => {
          const clipId = String(clip.id || `clip-${trackIdx}-${clipIdx}`).trim();
          allClipsFound.push(clipId);

          const startMs = Number(clip.startTimeMs ?? clip.startMs ?? 0);
          const endMs = Number(clip.endTimeMs ?? clip.endMs ?? startMs + 5000);

          return {
            id: clipId,
            name: String(clip.name || 'Untitled Clip').trim(),
            clipType: String(clip.clipType || clip.type || 'video').trim(),
            startTimeMs: Math.max(0, startMs),
            endTimeMs: Math.max(startMs + 100, endMs),
            sourceStartMs: Math.max(0, Number(clip.sourceStartMs ?? clip.trimStartMs ?? 0)),
            sourceEndMs: Math.max(0, Number(clip.sourceEndMs ?? clip.trimEndMs ?? 0)),
            slotBinding: clip.slotBinding ? String(clip.slotBinding).trim() : null,
            mediaAssetId: clip.mediaAssetId ? String(clip.mediaAssetId).trim() : null,
            transform: clip.transform
              ? {
                  position: {
                    x: Number(clip.transform.position?.x ?? 0),
                    y: Number(clip.transform.position?.y ?? 0),
                  },
                  scale: {
                    x: Number(clip.transform.scale?.x ?? 1),
                    y: Number(clip.transform.scale?.y ?? 1),
                  },
                  rotation: Number(clip.transform.rotation ?? 0),
                  opacity: Math.max(0, Math.min(1, Number(clip.transform.opacity ?? 1))),
                }
              : {
                  position: { x: 0, y: 0 },
                  scale: { x: 1, y: 1 },
                  rotation: 0,
                  opacity: 1,
                },
            crop: clip.crop || null,
            audioProperties: clip.audioProperties
              ? {
                  volume: Math.max(0, Math.min(2, Number(clip.audioProperties.volume ?? 1))),
                  muted: Boolean(clip.audioProperties.muted),
                  fadeInMs: Math.max(0, Number(clip.audioProperties.fadeInMs ?? 0)),
                  fadeOutMs: Math.max(0, Number(clip.audioProperties.fadeOutMs ?? 0)),
                }
              : null,
            textProperties: clip.textProperties || null,
            captionProperties: clip.captionProperties || null,
            transitions: clip.transitions || null,
            effects: Array.isArray(clip.effects) ? clip.effects : [],
            animations: Array.isArray(clip.animations) ? clip.animations : [],
          };
        })
        .sort((a, b) => a.startTimeMs - b.startTimeMs || a.id.localeCompare(b.id));

      return {
        id: String(track.id || `track-${trackIdx}`).trim(),
        name: String(track.name || `Track ${trackIdx + 1}`).trim(),
        trackType: String(track.trackType || track.type || 'video').trim(),
        orderIndex: Number(track.orderIndex ?? track.index ?? trackIdx),
        isMuted: Boolean(track.isMuted),
        isLocked: Boolean(track.isLocked),
        volume: Number(track.volume ?? 1),
        clips: sortedClips,
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));

  // Sort slots deterministically by displayOrder, then slotKey
  const sortedSlots: CanonicalTemplateSlotDefinition[] = (input.slots || [])
    .map((slot: RawTemplateSlotInput, slotIdx: number) => {
      const rawType = String(slot.type || 'video').toLowerCase();
      const slotType: TemplateSlotType = VALID_SLOT_TYPES.includes(rawType as TemplateSlotType)
        ? (rawType as TemplateSlotType)
        : 'video';

      return {
        slotKey: String(slot.slotKey || `slot_${slotIdx + 1}`).trim(),
        label: String(slot.label || `Slot ${slotIdx + 1}`).trim(),
        type: slotType,
        description: slot.description ? String(slot.description).trim() : null,
        targetClipId: String(slot.targetClipId || '').trim(),
        defaultValue: slot.defaultValue ?? null,
        constraints: {
          isRequired: Boolean(slot.constraints?.isRequired),
          maxDurationMs: slot.constraints?.maxDurationMs ? Number(slot.constraints.maxDurationMs) : undefined,
          minDurationMs: slot.constraints?.minDurationMs ? Number(slot.constraints.minDurationMs) : undefined,
          maxCharacters: slot.constraints?.maxCharacters ? Number(slot.constraints.maxCharacters) : undefined,
          allowedMimeTypes: Array.isArray(slot.constraints?.allowedMimeTypes) ? slot.constraints.allowedMimeTypes : undefined,
          allowedAspectRatios: Array.isArray(slot.constraints?.allowedAspectRatios) ? slot.constraints.allowedAspectRatios : undefined,
          minResolution: slot.constraints?.minResolution || undefined,
        },
        displayOrder: Number(slot.displayOrder ?? slotIdx),
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder || a.slotKey.localeCompare(b.slotKey));

  // Determine overall duration from furthest clip end time or input
  let calculatedDurationMs = Number(input.durationMs || 0);
  for (const track of sortedTracks) {
    for (const clip of track.clips) {
      if (clip.endTimeMs > calculatedDurationMs) {
        calculatedDurationMs = clip.endTimeMs;
      }
    }
  }

  const rawAspect = input.aspectRatio !== undefined ? String(input.aspectRatio) : '16:9';
  const aspectRatio: AspectRatio = VALID_ASPECT_RATIOS.includes(rawAspect as AspectRatio)
    ? (rawAspect as AspectRatio)
    : (rawAspect as AspectRatio);

  return {
    templateId: input.templateId ? String(input.templateId).trim() : undefined,
    name: input.name !== undefined ? String(input.name).trim() : 'Untitled Template',
    category: String(input.category || 'general').trim(),
    aspectRatio,
    resolution: input.resolution === '720p' ? '720p' : '1080p',
    fps: Number(input.fps) === 60 ? 60 : 30,
    durationMs: Math.max(0, calculatedDurationMs),
    tracks: sortedTracks,
    slots: sortedSlots,
  };
}

/**
 * Computes deterministic SHA-256 hash of a canonical template snapshot.
 */
export function computeTemplateSnapshotChecksum(snapshot: CanonicalTemplateSnapshot): string {
  // Strip templateId if present so the recipe hash is purely content-addressed
  const { templateId, ...pureRecipe } = snapshot;
  const serialized = JSON.stringify(pureRecipe);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Validates a canonical template snapshot against business rules.
 */
export function validateTemplateSnapshot(snapshot: CanonicalTemplateSnapshot): {
  isValid: boolean;
  error?: string;
} {
  if (!snapshot.name || snapshot.name.trim().length === 0) {
    return { isValid: false, error: 'Template name is required and cannot be blank.' };
  }

  if (!VALID_ASPECT_RATIOS.includes(snapshot.aspectRatio)) {
    return { isValid: false, error: `Invalid aspect ratio. Must be one of: ${VALID_ASPECT_RATIOS.join(', ')}` };
  }

  if (![30, 60].includes(snapshot.fps)) {
    return { isValid: false, error: 'FPS must be 30 or 60.' };
  }

  if (!['720p', '1080p'].includes(snapshot.resolution)) {
    return { isValid: false, error: 'Resolution must be 720p or 1080p.' };
  }

  if (typeof snapshot.durationMs !== 'number' || isNaN(snapshot.durationMs) || snapshot.durationMs < 0) {
    return { isValid: false, error: 'Duration must be a non-negative number.' };
  }

  if (!Array.isArray(snapshot.tracks)) {
    return { isValid: false, error: 'Tracks must be a valid array.' };
  }

  // Collect clip IDs to validate slot targets and slot key uniqueness
  const clipIdSet = new Set<string>();
  for (const track of snapshot.tracks) {
    if (!track.name) {
      return { isValid: false, error: 'Every track must have a name.' };
    }
    for (const clip of track.clips) {
      if (!clip.id) {
        return { isValid: false, error: 'Every clip must have an id.' };
      }
      clipIdSet.add(clip.id);
      if (clip.endTimeMs < clip.startTimeMs) {
        return { isValid: false, error: `Clip ${clip.name} endTimeMs cannot be less than startTimeMs.` };
      }
    }
  }

  // Validate slots
  const slotKeySet = new Set<string>();
  for (const slot of snapshot.slots) {
    if (!slot.slotKey || slot.slotKey.trim().length === 0) {
      return { isValid: false, error: 'Every slot must have a non-empty slotKey.' };
    }
    if (slotKeySet.has(slot.slotKey)) {
      return { isValid: false, error: `Duplicate slotKey detected: "${slot.slotKey}". Each slot must have a unique key.` };
    }
    slotKeySet.add(slot.slotKey);

    if (!slot.label || slot.label.trim().length === 0) {
      return { isValid: false, error: `Slot "${slot.slotKey}" must have a label.` };
    }

    if (!VALID_SLOT_TYPES.includes(slot.type)) {
      return { isValid: false, error: `Invalid slot type "${slot.type}". Must be one of: ${VALID_SLOT_TYPES.join(', ')}` };
    }

    if (slot.targetClipId && !clipIdSet.has(slot.targetClipId)) {
      return {
        isValid: false,
        error: `Slot "${slot.slotKey}" references targetClipId "${slot.targetClipId}", which does not exist in any timeline track.`,
      };
    }
  }

  return { isValid: true };
}
