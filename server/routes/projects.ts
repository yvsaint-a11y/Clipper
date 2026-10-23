import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../db/auth';
import { syncUserProfile } from '../services/userService';
import { getDb } from '../db';
import { projects, projectVersions } from '../db/schema/projects';
import { timelines, tracks, clips } from '../db/schema/timelines';
import { eq, and, desc, sql, asc } from 'drizzle-orm';
import crypto from 'crypto';
import { replaceProjectSlotMedia, ProjectSlotError } from '../services/projectSlotService';

export const DEFAULT_PROJECT_TRACKS = [
  { index: 0, type: 'video', name: 'Main Video', isLocked: false, isMuted: false, volume: '1.00' },
  { index: 1, type: 'overlay', name: 'Visual Overlay', isLocked: false, isMuted: false, volume: '1.00' },
  { index: 2, type: 'text', name: 'Text Overlay', isLocked: false, isMuted: false, volume: '1.00' },
  { index: 3, type: 'audio', name: 'Audio', isLocked: false, isMuted: false, volume: '1.00' },
] as const;

export const projectsRouter = Router();

// Enforce authenticated Supabase JWT for all project operations
projectsRouter.use(requireAuth);

/**
 * GET /api/projects
 * Lists all non-archived projects owned by the authenticated user.
 */
projectsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const user = req.user!;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    await syncUserProfile(user);

    const userProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.isArchived, false)))
      .orderBy(desc(projects.updatedAt));

    res.json({ projects: userProjects });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve projects.';
    console.error('Error in GET /api/projects:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/projects
 * Creates a new video project with aspect ratio, resolution, and bootstrapped timeline.
 */
projectsRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const user = req.user!;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    await syncUserProfile(user);

    const {
      name,
      description,
      aspectRatio = '16:9',
      resolution = '1080p',
      fps = 30,
    } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Project name is required.' });
      return;
    }

    const validAspectRatios = ['16:9', '9:16', '1:1'];
    if (!validAspectRatios.includes(aspectRatio)) {
      res.status(400).json({ error: 'Invalid aspect ratio. Must be 16:9, 9:16, or 1:1.' });
      return;
    }

    // Insert project record
    const [newProject] = await db
      .insert(projects)
      .values({
        userId,
        name: name.trim(),
        description: description ? description.trim() : null,
        aspectRatio,
        resolution: resolution === '720p' ? '720p' : '1080p',
        fps: Number(fps) === 60 ? 60 : 30,
        durationMs: 0,
        currentVersionNumber: 1,
      })
      .returning();

    // Bootstrap corresponding timeline record
    const [newTimeline] = await db
      .insert(timelines)
      .values({
        projectId: newProject.id,
        durationMs: 0,
        fps: newProject.fps,
      })
      .returning();

    // Insert canonical default tracks for the timeline
    const createdTracks = await db
      .insert(tracks)
      .values(
        DEFAULT_PROJECT_TRACKS.map((t) => ({
          timelineId: newTimeline.id,
          index: t.index,
          type: t.type,
          name: t.name,
          isLocked: t.isLocked,
          isMuted: t.isMuted,
          volume: t.volume,
        }))
      )
      .returning();

    const formattedTracks = createdTracks.map((track) => ({
      id: track.id,
      timelineId: track.timelineId,
      name: track.name,
      trackType: track.type as any,
      orderIndex: track.index,
      isMuted: track.isMuted,
      isLocked: track.isLocked,
      volume: Number(track.volume || 1),
      clips: [],
    }));

    // Create initial immutable snapshot (version 1)
    const initialSnapshot = {
      projectId: newProject.id,
      timelineId: newTimeline.id,
      fps: newProject.fps,
      durationMs: 0,
      tracks: formattedTracks,
      clips: [],
      createdAt: new Date().toISOString(),
    };
    const checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(initialSnapshot))
      .digest('hex');

    await db.insert(projectVersions).values({
      projectId: newProject.id,
      userId,
      versionNumber: 1,
      label: 'Initial Project Creation',
      snapshot: initialSnapshot,
      checksum,
    });

    res.status(201).json({
      project: newProject,
      timeline: {
        id: newTimeline.id,
        projectId: newTimeline.projectId,
        totalDurationMs: newTimeline.durationMs || 0,
        fps: newTimeline.fps || newProject.fps,
        tracks: formattedTracks,
        updatedAt: newTimeline.updatedAt,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create project.';
    console.error('Error in POST /api/projects:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/projects/:id
 * Fetches a single project with IDOR ownership validation.
 */
projectsRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));

    if (!project) {
      res.status(404).json({ error: 'Project not found or access denied.' });
      return;
    }

    let timelineWithTracks: any = null;
    let [timelineRecord] = await db
      .select()
      .from(timelines)
      .where(eq(timelines.projectId, project.id));

    if (!timelineRecord) {
      [timelineRecord] = await db
        .insert(timelines)
        .values({
          projectId: project.id,
          durationMs: project.durationMs || 0,
          fps: project.fps || 30,
        })
        .returning();
    }

    if (timelineRecord) {
      let dbTracks = await db
        .select()
        .from(tracks)
        .where(eq(tracks.timelineId, timelineRecord.id))
        .orderBy(asc(tracks.index));

      // Self-healing: if an existing project has an empty timeline, seed the canonical 4 default tracks
      if (dbTracks.length === 0) {
        dbTracks = await db
          .insert(tracks)
          .values(
            DEFAULT_PROJECT_TRACKS.map((t) => ({
              timelineId: timelineRecord.id,
              index: t.index,
              type: t.type,
              name: t.name,
              isLocked: t.isLocked,
              isMuted: t.isMuted,
              volume: t.volume,
            }))
          )
          .returning();
      }

      const trackIds = dbTracks.map((t) => t.id);
      let dbClips: any[] = [];
      if (trackIds.length > 0) {
        dbClips = await db
          .select()
          .from(clips)
          .where(sql`${clips.trackId} IN ${trackIds}`)
          .orderBy(asc(clips.startMs));
      }

      timelineWithTracks = {
        id: timelineRecord.id,
        projectId: timelineRecord.projectId,
        totalDurationMs: timelineRecord.durationMs || project.durationMs || 0,
        fps: timelineRecord.fps || project.fps || 30,
        updatedAt: timelineRecord.updatedAt,
        tracks: dbTracks.map((track) => ({
          id: track.id,
          timelineId: track.timelineId,
          name: track.name,
          trackType: track.type as any,
          orderIndex: track.index,
          isMuted: track.isMuted,
          isLocked: track.isLocked,
          volume: Number(track.volume || 1),
          clips: dbClips
            .filter((c) => c.trackId === track.id)
            .map((c) => ({
              id: c.id,
              trackId: c.trackId,
              name: c.name,
              clipType: c.type as any,
              startTimeMs: c.startMs,
              endTimeMs: c.endMs,
              mediaAssetId: c.mediaAssetId,
              sourceStartMs: c.trimStartMs || 0,
              sourceEndMs: (c.trimStartMs || 0) + (c.endMs - c.startMs),
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
        })),
      };
    }

    res.json({ project, timeline: timelineWithTracks });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch project.';
    console.error('Error in GET /api/projects/:id:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * PATCH /api/projects/:id
 * Updates project name, description, or aspect ratio with IDOR check.
 */
projectsRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { name, description, aspectRatio } = req.body || {};
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    // Verify ownership
    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));

    if (!existing) {
      res.status(404).json({ error: 'Project not found or access denied.' });
      return;
    }

    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (name && typeof name === 'string') updates.name = name.trim();
    if (description !== undefined) updates.description = description ? String(description).trim() : null;
    if (aspectRatio && ['16:9', '9:16', '1:1'].includes(aspectRatio)) updates.aspectRatio = aspectRatio;

    const [updatedProject] = await db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .returning();

    res.json({ project: updatedProject });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update project.';
    console.error('Error in PATCH /api/projects/:id:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * DELETE /api/projects/:id
 * Soft-archives a project owned by the user.
 */
projectsRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));

    if (!existing) {
      res.status(404).json({ error: 'Project not found or access denied.' });
      return;
    }

    await db
      .update(projects)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(projects.id, id));

    res.json({ success: true, message: 'Project archived successfully.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete project.';
    console.error('Error in DELETE /api/projects/:id:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/projects/:id/duplicate
 * Duplicates a project, its settings, and bootstraps a cloned timeline.
 */
projectsRouter.post('/:id/duplicate', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    const [sourceProject] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));

    if (!sourceProject) {
      res.status(404).json({ error: 'Source project not found or access denied.' });
      return;
    }

    // Insert duplicated project
    const [duplicated] = await db
      .insert(projects)
      .values({
        userId,
        name: `${sourceProject.name} (Copy)`,
        description: sourceProject.description,
        aspectRatio: sourceProject.aspectRatio,
        resolution: sourceProject.resolution,
        fps: sourceProject.fps,
        durationMs: sourceProject.durationMs,
        currentVersionNumber: 1,
      })
      .returning();

    // Bootstrap duplicated timeline
    const [duplicatedTimeline] = await db
      .insert(timelines)
      .values({
        projectId: duplicated.id,
        durationMs: sourceProject.durationMs,
        fps: sourceProject.fps,
      })
      .returning();

    // Copy tracks from source timeline if available, otherwise seed defaults
    const [sourceTimeline] = await db
      .select()
      .from(timelines)
      .where(eq(timelines.projectId, sourceProject.id));

    let sourceTracks: any[] = [];
    if (sourceTimeline) {
      sourceTracks = await db
        .select()
        .from(tracks)
        .where(eq(tracks.timelineId, sourceTimeline.id))
        .orderBy(asc(tracks.index));
    }

    if (sourceTracks.length > 0) {
      for (const st of sourceTracks) {
        const [clonedTrack] = await db
          .insert(tracks)
          .values({
            timelineId: duplicatedTimeline.id,
            index: st.index,
            type: st.type,
            name: st.name,
            isLocked: st.isLocked,
            isMuted: st.isMuted,
            volume: st.volume,
          })
          .returning();

        const sourceClips = await db
          .select()
          .from(clips)
          .where(eq(clips.trackId, st.id));

        for (const sc of sourceClips) {
          await db.insert(clips).values({
            trackId: clonedTrack.id,
            mediaAssetId: sc.mediaAssetId,
            type: sc.type,
            name: sc.name,
            startMs: sc.startMs,
            endMs: sc.endMs,
            trimStartMs: sc.trimStartMs,
            trimEndMs: sc.trimEndMs,
            speed: sc.speed,
            transform: sc.transform,
            crop: sc.crop,
            audioProperties: sc.audioProperties,
            textProperties: sc.textProperties,
            captionProperties: sc.captionProperties,
            transitions: sc.transitions,
            effects: sc.effects,
            animations: sc.animations,
            slotBinding: sc.slotBinding,
          });
        }
      }
    } else {
      await db.insert(tracks).values(
        DEFAULT_PROJECT_TRACKS.map((t) => ({
          timelineId: duplicatedTimeline.id,
          index: t.index,
          type: t.type,
          name: t.name,
          isLocked: t.isLocked,
          isMuted: t.isMuted,
          volume: t.volume,
        }))
      );
    }

    res.status(201).json({ project: duplicated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to duplicate project.';
    console.error('Error in POST /api/projects/:id/duplicate:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * PUT /api/projects/:id/editor-state
 * Persists the complete canonical editor state (project metadata, timeline, tracks, clips)
 * and creates an immutable project version with SHA-256 checksum within a database transaction.
 */
projectsRouter.put('/:id/editor-state', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    const {
      name,
      description,
      aspectRatio,
      resolution,
      fps,
      durationMs,
      timeline: timelineInput,
    } = req.body || {};

    // 1. Verify project exists and belongs to user (IDOR prevention)
    const [existingProject] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));

    if (!existingProject) {
      res.status(404).json({ error: 'Project not found or access denied.' });
      return;
    }

    // 2. Validate basic metadata inputs
    const projectName = (typeof name === 'string' && name.trim().length > 0) ? name.trim() : existingProject.name;
    const projectAspect = ['16:9', '9:16', '1:1'].includes(aspectRatio) ? aspectRatio : existingProject.aspectRatio;
    const projectResolution = ['720p', '1080p'].includes(resolution) ? resolution : existingProject.resolution;
    const projectFps = Number(fps) === 60 ? 60 : (Number(fps) === 30 ? 30 : existingProject.fps);
    const projectDurationMs = typeof durationMs === 'number' && durationMs >= 0 ? Math.round(durationMs) : existingProject.durationMs;

    const tracksInput = Array.isArray(timelineInput?.tracks) ? timelineInput.tracks : [];

    // 3. IDOR Check: Ensure any referenced media assets belong to this user
    const referencedMediaIds = new Set<string>();
    for (const track of tracksInput) {
      for (const clip of (track.clips || [])) {
        if (clip.mediaAssetId) {
          referencedMediaIds.add(clip.mediaAssetId);
        }
      }
    }

    if (referencedMediaIds.size > 0) {
      const mediaList = Array.from(referencedMediaIds);
      const ownedAssets = await db
        .select({ id: sql`id` })
        .from(sql`media_assets`)
        .where(and(sql`id IN ${mediaList}`, sql`user_id = ${userId}`));

      if (ownedAssets.length !== mediaList.length) {
        res.status(403).json({ error: 'Access denied: one or more media assets do not belong to your account.' });
        return;
      }
    }

    // 4. Build canonical snapshot & calculate deterministic SHA-256 hash
    const { buildCanonicalSnapshot, computeSnapshotChecksum } = await import('../services/projectSnapshotService');
    const canonicalSnapshot = buildCanonicalSnapshot({
      projectId: id,
      name: projectName,
      aspectRatio: projectAspect,
      resolution: projectResolution,
      fps: projectFps,
      durationMs: projectDurationMs,
      tracks: tracksInput,
    });
    const checksum = computeSnapshotChecksum(canonicalSnapshot);

    // 5. Check if project already has this exact canonical state saved
    const [latestVersion] = await db
      .select()
      .from(projectVersions)
      .where(and(eq(projectVersions.projectId, id), eq(projectVersions.userId, userId)))
      .orderBy(desc(projectVersions.versionNumber))
      .limit(1);

    const isIdentical = latestVersion && latestVersion.checksum === checksum;
    const nextVersionNumber = isIdentical
      ? latestVersion.versionNumber
      : (latestVersion ? latestVersion.versionNumber + 1 : (existingProject.currentVersionNumber || 1) + 1);

    // 6. Execute Transactional Persistence
    const result = await db.transaction(async (tx) => {
      // A. Update projects table
      const [updatedProject] = await tx
        .update(projects)
        .set({
          name: projectName,
          description: description !== undefined ? (description ? String(description).trim() : null) : existingProject.description,
          aspectRatio: projectAspect,
          resolution: projectResolution,
          fps: projectFps,
          durationMs: projectDurationMs,
          currentVersionNumber: nextVersionNumber,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();

      // B. Ensure timeline root record exists
      let [timelineRecord] = await tx
        .select()
        .from(timelines)
        .where(eq(timelines.projectId, id));

      if (!timelineRecord) {
        [timelineRecord] = await tx
          .insert(timelines)
          .values({
            projectId: id,
            durationMs: projectDurationMs,
            fps: projectFps,
          })
          .returning();
      } else {
        [timelineRecord] = await tx
          .update(timelines)
          .set({
            durationMs: projectDurationMs,
            fps: projectFps,
            updatedAt: new Date(),
          })
          .where(eq(timelines.id, timelineRecord.id))
          .returning();
      }

      // C. Delete existing tracks (cascade will delete clips) and re-insert updated tracks & clips
      // First get existing track IDs
      const existingDbTracks = await tx
        .select({ id: tracks.id })
        .from(tracks)
        .where(eq(tracks.timelineId, timelineRecord.id));

      if (existingDbTracks.length > 0) {
        const oldTrackIds = existingDbTracks.map((t) => t.id);
        await tx.delete(clips).where(sql`${clips.trackId} IN ${oldTrackIds}`);
        await tx.delete(tracks).where(eq(tracks.timelineId, timelineRecord.id));
      }

      // D. Insert new tracks and clips
      const savedTracks: any[] = [];
      for (let tIdx = 0; tIdx < tracksInput.length; tIdx++) {
        const trackIn = tracksInput[tIdx];
        const [insertedTrack] = await tx
          .insert(tracks)
          .values({
            timelineId: timelineRecord.id,
            index: Number(trackIn.orderIndex ?? trackIn.index ?? tIdx),
            type: trackIn.trackType || trackIn.type || 'video',
            name: String(trackIn.name || `Track ${tIdx + 1}`).trim(),
            isLocked: Boolean(trackIn.isLocked),
            isMuted: Boolean(trackIn.isMuted),
            volume: String(Number(trackIn.volume ?? 1).toFixed(2)),
          })
          .returning();

        const insertedClips: any[] = [];
        const rawClips = Array.isArray(trackIn.clips) ? trackIn.clips : [];
        for (const clipIn of rawClips) {
          const startMs = Math.round(Number(clipIn.startTimeMs ?? clipIn.startMs ?? 0));
          const endMs = Math.round(Number(clipIn.endTimeMs ?? clipIn.endMs ?? (startMs + 5000)));
          const trimStartMs = Math.round(Number(clipIn.sourceStartMs ?? clipIn.trimStartMs ?? 0));
          const trimEndMs = Math.round(Number(clipIn.sourceEndMs ?? clipIn.trimEndMs ?? 0));

          const [insertedClip] = await tx
            .insert(clips)
            .values({
              trackId: insertedTrack.id,
              mediaAssetId: clipIn.mediaAssetId || null,
              type: clipIn.clipType || clipIn.type || 'video',
              name: String(clipIn.name || 'Untitled Clip').trim(),
              startMs,
              endMs,
              trimStartMs,
              trimEndMs,
              speed: String(Number(clipIn.speed ?? 1).toFixed(2)),
              transform: clipIn.transform || {
                position: { x: 0, y: 0 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                opacity: 1,
              },
              crop: clipIn.crop || null,
              audioProperties: clipIn.audioProperties || null,
              textProperties: clipIn.textProperties || null,
              captionProperties: clipIn.captionProperties || null,
              transitions: clipIn.transitions || null,
              effects: Array.isArray(clipIn.effects) ? clipIn.effects : [],
              animations: Array.isArray(clipIn.animations) ? clipIn.animations : [],
              slotBinding: clipIn.slotBinding || null,
            })
            .returning();

          insertedClips.push({
            id: insertedClip.id,
            trackId: insertedClip.trackId,
            name: insertedClip.name,
            clipType: insertedClip.type,
            startTimeMs: insertedClip.startMs,
            endTimeMs: insertedClip.endMs,
            sourceStartMs: insertedClip.trimStartMs,
            sourceEndMs: insertedClip.trimEndMs,
            mediaAssetId: insertedClip.mediaAssetId,
            transform: insertedClip.transform,
            crop: insertedClip.crop,
            audioProperties: insertedClip.audioProperties,
            textProperties: insertedClip.textProperties,
            captionProperties: insertedClip.captionProperties,
            transitions: insertedClip.transitions,
            effects: insertedClip.effects,
            animations: insertedClip.animations,
            slotBinding: insertedClip.slotBinding,
          });
        }

        savedTracks.push({
          id: insertedTrack.id,
          timelineId: insertedTrack.timelineId,
          name: insertedTrack.name,
          trackType: insertedTrack.type,
          orderIndex: insertedTrack.index,
          isMuted: insertedTrack.isMuted,
          isLocked: insertedTrack.isLocked,
          volume: Number(insertedTrack.volume),
          clips: insertedClips,
        });
      }

      // E. Create immutable project version only if content changed
      let savedVersion = latestVersion;
      if (!isIdentical) {
        [savedVersion] = await tx
          .insert(projectVersions)
          .values({
            projectId: id,
            userId,
            versionNumber: nextVersionNumber,
            label: `Save Version ${nextVersionNumber}`,
            snapshot: canonicalSnapshot,
            checksum,
          })
          .returning();
      }

      return {
        project: updatedProject,
        timeline: {
          id: timelineRecord.id,
          projectId: timelineRecord.projectId,
          totalDurationMs: timelineRecord.durationMs,
          fps: timelineRecord.fps,
          tracks: savedTracks,
          updatedAt: timelineRecord.updatedAt,
        },
        version: savedVersion,
        checksum,
      };
    });

    res.json({
      success: true,
      project: result.project,
      timeline: result.timeline,
      version: result.version,
      checksum: result.checksum,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to persist editor state.';
    console.error('Error in PUT /api/projects/:id/editor-state:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/projects/:id/slots/:slotKey/replace
 * Replaces media for a specific replaceable template slot in the project.
 * Multi-tenant safe, anti-IDOR, strictly transactional.
 */
projectsRouter.post('/:id/slots/:slotKey/replace', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id, slotKey } = req.params;
    const { mediaAssetId } = req.body || {};

    const result = await replaceProjectSlotMedia({
      projectId: id,
      slotKey,
      mediaAssetId: mediaAssetId || null,
      userId,
    });

    res.json(result);
  } catch (err: unknown) {
    if (err instanceof ProjectSlotError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to replace slot media.';
    console.error('Error in POST /api/projects/:id/slots/:slotKey/replace:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/projects/:id/replace-slot-media
 * Alternate convenient contract for slot replacement: accepts slotKey and mediaAssetId in body.
 */
projectsRouter.post('/:id/replace-slot-media', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { slotKey, mediaAssetId } = req.body || {};

    if (!slotKey) {
      res.status(400).json({ error: 'slotKey is required in request body.' });
      return;
    }

    const result = await replaceProjectSlotMedia({
      projectId: id,
      slotKey,
      mediaAssetId: mediaAssetId || null,
      userId,
    });

    res.json(result);
  } catch (err: unknown) {
    if (err instanceof ProjectSlotError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to replace slot media.';
    console.error('Error in POST /api/projects/:id/replace-slot-media:', err);
    res.status(500).json({ error: msg });
  }
});
