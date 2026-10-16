import { getDb } from '../db';
import { projects, projectVersions } from '../db/schema/projects';
import { timelines, tracks, clips } from '../db/schema/timelines';
import { mediaAssets } from '../db/schema/media';
import { eq, and, sql, asc } from 'drizzle-orm';
import { buildCanonicalSnapshot, computeSnapshotChecksum } from './projectSnapshotService';

export class ProjectSlotError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ProjectSlotError';
    this.statusCode = statusCode;
  }
}

export interface ReplaceSlotMediaOptions {
  projectId: string;
  slotKey: string;
  mediaAssetId: string | null;
  userId: string;
}

/**
 * Phase 7G: Replaces media assigned to a replaceable template slot in a project.
 * - Strict multi-tenant security: enforces project ownership and media asset ownership (anti-IDOR).
 * - Only modifies slots that have an active slotBinding (strictly preserves fixed timeline content).
 * - Never modifies templates, template_versions, or template_slots (100% immutable).
 * - Persists changes transactionally with canonical snapshot and deterministic SHA-256 versioning.
 */
export async function replaceProjectSlotMedia({
  projectId,
  slotKey,
  mediaAssetId,
  userId,
}: ReplaceSlotMediaOptions) {
  const db = getDb();
  if (!db) {
    throw new ProjectSlotError('Database is unavailable.', 503);
  }

  if (!slotKey || typeof slotKey !== 'string' || slotKey.trim().length === 0) {
    throw new ProjectSlotError('Slot key is required and cannot be blank.', 400);
  }
  const normalizedSlotKey = slotKey.trim();

  // 1. Verify project exists and belongs to the authenticated user (IDOR prevention)
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId), eq(projects.isArchived, false)));

  if (!project) {
    throw new ProjectSlotError('Project not found or access denied.', 404);
  }

  // 2. Fetch project timeline and tracks
  const [timeline] = await db
    .select()
    .from(timelines)
    .where(eq(timelines.projectId, projectId));

  if (!timeline) {
    throw new ProjectSlotError('Project timeline not found.', 404);
  }

  const dbTracks = await db
    .select()
    .from(tracks)
    .where(eq(tracks.timelineId, timeline.id))
    .orderBy(asc(tracks.index));

  const trackIds = dbTracks.map((t) => t.id);
  if (trackIds.length === 0) {
    throw new ProjectSlotError(`Slot "${normalizedSlotKey}" not found or not marked as replaceable in this project.`, 404);
  }

  // 3. Find target clips bound to this specific replaceable slot
  const targetClips = await db
    .select()
    .from(clips)
    .where(and(sql`${clips.trackId} IN ${trackIds}`, eq(clips.slotBinding, normalizedSlotKey)));

  if (targetClips.length === 0) {
    throw new ProjectSlotError(`Slot "${normalizedSlotKey}" not found or not marked as replaceable in this project.`, 404);
  }

  // 4. Verify media asset ownership & type compatibility if mediaAssetId is provided
  let mediaAssetRecord: any = null;
  if (mediaAssetId) {
    const [media] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, mediaAssetId), eq(mediaAssets.userId, userId)));

    if (!media) {
      throw new ProjectSlotError('Media asset not found or access denied.', 403);
    }
    mediaAssetRecord = media;

    // Type compatibility check
    for (const c of targetClips) {
      const clipType = c.type.toLowerCase();
      const mime = media.mimeType.toLowerCase();
      if (clipType === 'video' && !mime.startsWith('video/') && !mime.startsWith('image/')) {
        throw new ProjectSlotError(`Incompatible media type "${media.mimeType}" for video slot.`, 400);
      }
      if (clipType === 'audio' && !mime.startsWith('audio/')) {
        throw new ProjectSlotError(`Incompatible media type "${media.mimeType}" for audio slot.`, 400);
      }
      if (clipType === 'image' && !mime.startsWith('image/')) {
        throw new ProjectSlotError(`Incompatible media type "${media.mimeType}" for image slot.`, 400);
      }
    }
  }

  // 5. Execute atomic transaction to update clip and record new project version
  return await db.transaction(async (tx) => {
    // A. Update matching clips
    await tx
      .update(clips)
      .set({
        mediaAssetId: mediaAssetId || null,
        updatedAt: new Date(),
      })
      .where(and(sql`${clips.trackId} IN ${trackIds}`, eq(clips.slotBinding, normalizedSlotKey)));

    // B. Fetch updated clips to compile complete canonical state
    const allClips = await tx
      .select()
      .from(clips)
      .where(sql`${clips.trackId} IN ${trackIds}`)
      .orderBy(asc(clips.startMs));

    const timelineTracksWithClips = dbTracks.map((track) => ({
      id: track.id,
      timelineId: track.timelineId,
      name: track.name,
      trackType: track.type,
      orderIndex: track.index,
      isMuted: track.isMuted,
      isLocked: track.isLocked,
      volume: Number(track.volume || 1),
      clips: allClips
        .filter((c) => c.trackId === track.id)
        .map((c) => ({
          id: c.id,
          trackId: c.trackId,
          name: c.name,
          clipType: c.type,
          startTimeMs: c.startMs,
          endTimeMs: c.endMs,
          sourceStartMs: c.trimStartMs,
          sourceEndMs: c.trimEndMs,
          mediaAssetId: c.mediaAssetId,
          transform: c.transform,
          crop: c.crop,
          audioProperties: c.audioProperties,
          textProperties: c.textProperties,
          captionProperties: c.captionProperties,
          transitions: c.transitions,
          effects: c.effects,
          animations: c.animations,
          slotBinding: c.slotBinding,
        })),
    }));

    // C. Build canonical project snapshot
    const canonicalSnapshot = buildCanonicalSnapshot({
      projectId,
      name: project.name,
      aspectRatio: project.aspectRatio,
      resolution: project.resolution,
      fps: project.fps,
      durationMs: project.durationMs,
      tracks: timelineTracksWithClips,
    });
    const checksum = computeSnapshotChecksum(canonicalSnapshot);

    // D. Increment version number on project header
    const nextVersionNumber = project.currentVersionNumber + 1;
    const [updatedProject] = await tx
      .update(projects)
      .set({
        currentVersionNumber: nextVersionNumber,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    await tx
      .update(timelines)
      .set({ updatedAt: new Date() })
      .where(eq(timelines.id, timeline.id));

    // E. Save immutable project version record
    const [savedVersion] = await tx
      .insert(projectVersions)
      .values({
        projectId,
        userId,
        versionNumber: nextVersionNumber,
        label: `Replaced media for slot "${normalizedSlotKey}"`,
        snapshot: canonicalSnapshot,
        checksum,
      })
      .returning();

    return {
      success: true,
      project: updatedProject,
      timeline: {
        id: timeline.id,
        projectId,
        totalDurationMs: timeline.durationMs,
        fps: timeline.fps,
        tracks: timelineTracksWithClips,
        updatedAt: new Date(),
      },
      version: savedVersion,
      checksum,
      replacedSlot: normalizedSlotKey,
      mediaAsset: mediaAssetRecord,
    };
  });
}
