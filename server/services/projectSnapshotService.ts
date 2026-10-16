import crypto from 'crypto';

export interface CanonicalClipSnapshot {
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
}

export interface CanonicalTransitionSnapshot {
  id: string;
  type: 'cut' | 'crossfade';
  durationMs: number;
  fromClipId: string;
  toClipId: string;
  trackId: string;
}

export interface CanonicalTrackSnapshot {
  id?: string;
  name: string;
  trackType: string;
  orderIndex: number;
  isMuted: boolean;
  isLocked: boolean;
  volume: number;
  transitions: CanonicalTransitionSnapshot[];
  clips: CanonicalClipSnapshot[];
}

export interface CanonicalProjectSnapshot {
  projectId: string;
  name: string;
  aspectRatio: string;
  resolution: string;
  fps: number;
  durationMs: number;
  transitions: CanonicalTransitionSnapshot[];
  tracks: CanonicalTrackSnapshot[];
}

function normalizeServerTransition(raw: any, fallbackTrackId = ''): CanonicalTransitionSnapshot | null {
  if (!raw || typeof raw !== 'object' || !raw.fromClipId || !raw.toClipId) return null;
  const type = raw.type === 'cut' ? 'cut' : 'crossfade';
  const durationMs = Math.max(1, Math.round(Number(raw.durationMs ?? 500)));
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
 * Builds a deterministic, canonical snapshot of the project editor state.
 * Strips all transient state (selection, playhead position, playback status, zoom, presigned URLs, modals).
 * Sorts tracks by orderIndex and clips by startTimeMs to ensure stable hash comparisons.
 */
export function buildCanonicalSnapshot(input: {
  projectId: string;
  name: string;
  aspectRatio: string;
  resolution: string;
  fps: number;
  durationMs?: number;
  tracks: any[];
  transitions?: any[];
}): CanonicalProjectSnapshot {
  const allTransitionsByKey = new Map<string, CanonicalTransitionSnapshot>();
  if (Array.isArray(input.transitions)) {
    for (const raw of input.transitions) {
      const norm = normalizeServerTransition(raw);
      if (norm) {
        allTransitionsByKey.set(`${norm.fromClipId}->${norm.toClipId}`, norm);
      }
    }
  }

  const sortedTracks: CanonicalTrackSnapshot[] = (input.tracks || [])
    .map((track, trackIdx) => {
      const sortedClips: CanonicalClipSnapshot[] = (track.clips || [])
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
          crop: clip.crop || null,
          audioProperties: clip.audioProperties || null,
          textProperties: clip.textProperties || null,
          captionProperties: clip.captionProperties || null,
          transitions: clip.transitions || null,
          effects: Array.isArray(clip.effects) ? clip.effects : [],
          animations: Array.isArray(clip.animations) ? clip.animations : [],
          slotBinding: clip.slotBinding || null,
        }))
        .sort((a, b) => a.startTimeMs - b.startTimeMs || (a.id || '').localeCompare(b.id || ''));

      const trackTransitions: CanonicalTransitionSnapshot[] = [];
      if (Array.isArray(track.transitions)) {
        for (const raw of track.transitions) {
          const norm = normalizeServerTransition(raw, track.id);
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

/**
 * Computes deterministic SHA-256 hash of a canonical snapshot.
 */
export function computeSnapshotChecksum(snapshot: CanonicalProjectSnapshot): string {
  const serialized = JSON.stringify(snapshot);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}
