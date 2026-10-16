/**
 * Client-safe canonical snapshot generator for Phase 6D:
 * Save / Reopen Editor Persistence.
 */

import { DEFAULT_CLIP_CROP, normalizeClipCrop } from './clipCrop';
import type { ClipTransition } from '@/src/types/timeline';
import { normalizeClipTransition } from './clipTransition';

export interface ClientCanonicalSnapshot {
  projectId: string;
  name: string;
  aspectRatio: string;
  resolution: string;
  fps: number;
  durationMs: number;
  transitions: ClipTransition[];
  tracks: Array<{
    id?: string;
    name: string;
    trackType: string;
    orderIndex: number;
    isMuted: boolean;
    isLocked: boolean;
    volume: number;
    transitions: ClipTransition[];
    clips: Array<{
      id?: string;
      name: string;
      clipType: string;
      startTimeMs: number;
      endTimeMs: number;
      sourceStartMs?: number;
      sourceEndMs?: number;
      mediaAssetId?: string | null;
      transform?: any;
      crop?: any;
      audioProperties?: any;
      textProperties?: any;
      captionProperties?: any;
      transitions?: any;
      effects?: any[];
      animations?: any[];
      slotBinding?: string | null;
    }>;
  }>;
}

export function buildClientCanonicalSnapshot(input: {
  projectId: string;
  name: string;
  aspectRatio: string;
  resolution: string;
  fps: number;
  durationMs?: number;
  tracks: any[];
  transitions?: any[];
}): ClientCanonicalSnapshot {
  const allTransitionsByKey = new Map<string, ClipTransition>();

  if (Array.isArray(input.transitions)) {
    for (const raw of input.transitions) {
      const norm = normalizeClipTransition(raw);
      if (norm) {
        allTransitionsByKey.set(`${norm.fromClipId}->${norm.toClipId}`, norm);
      }
    }
  }

  const sortedTracks = (input.tracks || [])
    .map((track, trackIdx) => {
      const sortedClips = (track.clips || [])
        .map((clip: any) => ({
          id: clip.id,
          name: String(clip.name || 'Untitled Clip').trim(),
          clipType: clip.clipType || clip.type || 'video',
          startTimeMs: Number(clip.startTimeMs ?? clip.startMs ?? 0),
          endTimeMs: Number(clip.endTimeMs ?? clip.endMs ?? 0),
          sourceStartMs: Number(clip.sourceStartMs ?? clip.trimStartMs ?? 0),
          sourceEndMs: Number(clip.sourceEndMs ?? clip.trimEndMs ?? 0),
          mediaAssetId: clip.mediaAssetId || null,
          transform: clip.transform || {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
          },
          crop: clip.crop ? normalizeClipCrop(clip.crop) : { ...DEFAULT_CLIP_CROP },
          audioProperties: clip.audioProperties || null,
          textProperties: clip.textProperties || null,
          captionProperties: clip.captionProperties || null,
          transitions: clip.transitions || null,
          effects: Array.isArray(clip.effects) ? clip.effects : [],
          animations: Array.isArray(clip.animations) ? clip.animations : [],
          slotBinding: clip.slotBinding || null,
        }))
        .sort((a, b) => a.startTimeMs - b.startTimeMs || (a.id || '').localeCompare(b.id || ''));

      const trackTransitions: ClipTransition[] = [];
      if (Array.isArray(track.transitions)) {
        for (const raw of track.transitions) {
          const norm = normalizeClipTransition(raw, track.id);
          if (norm) {
            trackTransitions.push(norm);
            allTransitionsByKey.set(`${norm.fromClipId}->${norm.toClipId}`, norm);
          }
        }
      }
      trackTransitions.sort(
        (a, b) =>
          a.fromClipId.localeCompare(b.fromClipId) ||
          a.toClipId.localeCompare(b.toClipId) ||
          a.id.localeCompare(b.id),
      );

      return {
        id: track.id,
        name: String(track.name || `Track ${trackIdx + 1}`).trim(),
        trackType: track.trackType || track.type || 'video',
        orderIndex: Number(track.orderIndex ?? track.index ?? trackIdx),
        isMuted: Boolean(track.isMuted),
        isLocked: Boolean(track.isLocked),
        volume: Number(track.volume ?? 1),
        transitions: trackTransitions,
        clips: sortedClips,
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex || (a.id || '').localeCompare(b.id || ''));

  const sortedAllTransitions = Array.from(allTransitionsByKey.values()).sort(
    (a, b) =>
      a.trackId.localeCompare(b.trackId) ||
      a.fromClipId.localeCompare(b.fromClipId) ||
      a.toClipId.localeCompare(b.toClipId) ||
      a.id.localeCompare(b.id),
  );

  return {
    projectId: input.projectId || '',
    name: (input.name || 'Untitled Project').trim(),
    aspectRatio: input.aspectRatio || '16:9',
    resolution: input.resolution || '1080p',
    fps: Number(input.fps || 30),
    durationMs: Number(input.durationMs || 0),
    transitions: sortedAllTransitions,
    tracks: sortedTracks,
  };
}

export function computeClientStateString(snapshot: ClientCanonicalSnapshot): string {
  return JSON.stringify(snapshot);
}
