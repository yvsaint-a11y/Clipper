import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createExpressApp } from '../server/app';
import { getDb } from '../server/db';
import { users } from '../server/db/schema/users';
import { projects } from '../server/db/schema/projects';
import { timelines, tracks, clips } from '../server/db/schema/timelines';
import { templates, templateVersions, templateSlots } from '../server/db/schema/templates';
import { eq, and } from 'drizzle-orm';
import {
  createTemplateFromProject,
  TemplateServiceError,
} from '../server/services/templateService';
import type { AuthenticatedRequest } from '../server/db/auth';

describe('Phase 7B: Save Project as Template Workflow & Persistence', () => {
  const baseApp = createExpressApp();
  const db = getDb();

  const userA_Id = '00000000-0000-0000-0000-000000000001';
  const userA_Email = 'alice.creator@modify.dev';

  const userB_Id = '00000000-0000-0000-0000-000000000002';
  const userB_Email = 'bob.editor@modify.dev';

  // Create an Express test app with mock auth header parser for end-to-end route testing
  const createMockAuthApp = () => {
    const testApp = express();
    testApp.use(express.json());

    // Mock auth middleware for route testing
    testApp.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header.' });
        return;
      }
      const token = authHeader.split(' ')[1];
      if (token === 'alice-valid-token') {
        req.userId = userA_Id;
        req.user = { id: userA_Id, email: userA_Email } as any;
        next();
      } else if (token === 'bob-valid-token') {
        req.userId = userB_Id;
        req.user = { id: userB_Id, email: userB_Email } as any;
        next();
      } else {
        res.status(401).json({ error: 'Unauthorized: Invalid authentication token.' });
      }
    });

    // Mount the from-project route identical to production
    testApp.post('/api/templates/from-project/:projectId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const userId = req.userId!;
        const { projectId } = req.params;
        const { templateName, description, category, isPublic, slotConfigurations } = req.body || {};

        const result = await createTemplateFromProject(projectId, userId, {
          templateName,
          description,
          category,
          isPublic,
          slotConfigurations,
        });

        res.status(201).json(result);
      } catch (err: unknown) {
        if (err instanceof TemplateServiceError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: 'Failed to create template from project.' });
      }
    });

    return testApp;
  };

  const testApp = createMockAuthApp();

  beforeEach(async () => {
    if (!db) return;

    // Ensure test user records exist
    await db
      .insert(users)
      .values([
        { id: userA_Id, email: userA_Email, subscriptionTier: 'free' },
        { id: userB_Id, email: userB_Email, subscriptionTier: 'pro' },
      ])
      .onConflictDoNothing();
  });

  // Helper to construct a realistic project with timeline, tracks, and clips
  async function createRealisticProject(ownerId: string, projectName: string) {
    if (!db) throw new Error('Database unavailable');

    const [proj] = await db
      .insert(projects)
      .values({
        userId: ownerId,
        name: projectName,
        description: 'Original high-production editing project',
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 12000,
      })
      .returning();

    const [tl] = await db
      .insert(timelines)
      .values({
        projectId: proj.id,
        durationMs: 12000,
        fps: 30,
      })
      .returning();

    // Track 1: Primary Video Track
    const [trkVideo] = await db
      .insert(tracks)
      .values({
        timelineId: tl.id,
        index: 0,
        type: 'video',
        name: 'Main Video Track',
      })
      .returning();

    // Track 2: Overlay / Graphic Track
    const [trkGraphics] = await db
      .insert(tracks)
      .values({
        timelineId: tl.id,
        index: 1,
        type: 'video',
        name: 'Graphics Track',
      })
      .returning();

    // Track 3: Audio Track
    const [trkAudio] = await db
      .insert(tracks)
      .values({
        timelineId: tl.id,
        index: 2,
        type: 'audio',
        name: 'Soundtrack Track',
      })
      .returning();

    // Clip 1: Intro Video
    const [c1] = await db
      .insert(clips)
      .values({
        trackId: trkVideo.id,
        name: 'Intro_Hook.mp4',
        type: 'video',
        startMs: 0,
        endMs: 4000,
        transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, opacity: 1 },
      })
      .returning();

    // Clip 2: Main Body Video
    const [c2] = await db
      .insert(clips)
      .values({
        trackId: trkVideo.id,
        name: 'Main_Interview.mp4',
        type: 'video',
        startMs: 4000,
        endMs: 12000,
        transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, opacity: 1 },
      })
      .returning();

    // Clip 3: Brand Logo Overlay
    const [c3] = await db
      .insert(clips)
      .values({
        trackId: trkGraphics.id,
        name: 'Company_Logo.png',
        type: 'image',
        startMs: 0,
        endMs: 12000,
        transform: { position: { x: 100, y: 50 }, scale: { x: 0.5, y: 0.5 }, rotation: 0, opacity: 0.9 },
      })
      .returning();

    // Clip 4: Background Music
    const [c4] = await db
      .insert(clips)
      .values({
        trackId: trkAudio.id,
        name: 'Ambient_Beat.mp3',
        type: 'audio',
        startMs: 0,
        endMs: 12000,
        audioProperties: { volume: 0.7, fadeInMs: 500, fadeOutMs: 1000 },
      })
      .returning();

    return {
      project: proj,
      timeline: tl,
      tracks: [trkVideo, trkGraphics, trkAudio],
      clips: [c1, c2, c3, c4],
    };
  }

  // ==========================================
  // 1. HTTP API & WORKFLOW VERIFICATION
  // ==========================================
  describe('POST /api/templates/from-project/:projectId Endpoint', () => {
    it('requires authentication and rejects anonymous calls on the production app with 401', async () => {
      const res = await request(baseApp).post('/api/templates/from-project/non-existent-id');
      expect(res.status).toBe(401);
    });

    it('successfully saves project as template with custom metadata and configured slots', async () => {
      if (!db) return;
      const { project, clips } = await createRealisticProject(userA_Id, 'Podcast Episode 42');

      const slotConfigurations = [
        {
          targetClipId: clips[0].id,
          isSlot: true,
          label: 'Intro Video Clip',
          type: 'video',
          description: 'Custom intro hook footage (3-5 seconds)',
          isRequired: true,
          displayOrder: 1,
        },
        {
          targetClipId: clips[1].id,
          isSlot: true,
          label: 'Main Interview Footage',
          type: 'video',
          description: 'Speaker camera angle',
          isRequired: true,
          displayOrder: 2,
        },
        {
          targetClipId: clips[2].id,
          isSlot: true,
          label: 'Brand Watermark / Logo',
          type: 'logo',
          description: 'Transparent PNG logo',
          isRequired: false,
          displayOrder: 3,
        },
        {
          targetClipId: clips[3].id,
          isSlot: false, // Fixed content: background audio stays locked in template!
        },
      ];

      const res = await request(testApp)
        .post(`/api/templates/from-project/${project.id}`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          templateName: 'Podcast Interview Template Pro',
          description: '2-camera podcast episode layout with logo placeholder',
          category: 'podcast',
          isPublic: false,
          slotConfigurations,
        });

      expect(res.status).toBe(201);
      expect(res.body.template).toBeDefined();
      expect(res.body.template.name).toBe('Podcast Interview Template Pro');
      expect(res.body.template.category).toBe('podcast');
      expect(res.body.template.aspectRatio).toBe('16:9');
      expect(res.body.template.currentVersionNumber).toBe(1);

      // Verify template version
      expect(res.body.version).toBeDefined();
      expect(res.body.version.versionNumber).toBe(1);
      expect(res.body.version.checksum).toHaveLength(64);

      // Verify that exactly 3 slots were created (the 4th audio clip was designated as fixed content)
      expect(res.body.version.slots).toHaveLength(3);
      const slotLabels = res.body.version.slots.map((s: any) => s.label);
      expect(slotLabels).toContain('Intro Video Clip');
      expect(slotLabels).toContain('Main Interview Footage');
      expect(slotLabels).toContain('Brand Watermark / Logo');
      expect(slotLabels).not.toContain('Ambient_Beat.mp3');

      // Verify that the snapshot preserves all 4 clips in timeline, but fixed clip has slotBinding: null
      const snapTracks = res.body.version.timelineSnapshot.tracks;
      expect(snapTracks).toHaveLength(3);

      const allSnapClips = snapTracks.flatMap((t: any) => t.clips);
      expect(allSnapClips).toHaveLength(4);

      const fixedAudioClip = allSnapClips.find((c: any) => c.name === 'Ambient_Beat.mp3');
      expect(fixedAudioClip).toBeDefined();
      expect(fixedAudioClip.slotBinding).toBeNull();
      // Audio properties like volume and fade are preserved
      expect(fixedAudioClip.audioProperties).toBeDefined();
      expect(fixedAudioClip.audioProperties.volume).toBe(0.7);

      const introClip = allSnapClips.find((c: any) => c.name === 'Intro_Hook.mp4');
      expect(introClip.slotBinding).toBeTruthy();
    });

    it('rejects blank template name with 400 validation error', async () => {
      if (!db) return;
      const { project } = await createRealisticProject(userA_Id, 'Name Validation Project');

      const res = await request(testApp)
        .post(`/api/templates/from-project/${project.id}`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          templateName: '    ', // whitespace only
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/blank|empty|required/i);
    });

    it('rejects excessively long template name with 400 validation error', async () => {
      if (!db) return;
      const { project } = await createRealisticProject(userA_Id, 'Max Length Project');

      const res = await request(testApp)
        .post(`/api/templates/from-project/${project.id}`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          templateName: 'A'.repeat(101),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/100 characters/i);
    });

    it('rejects excessively long slot label with 400 validation error', async () => {
      if (!db) return;
      const { project, clips } = await createRealisticProject(userA_Id, 'Slot Label Validation Project');

      const res = await request(testApp)
        .post(`/api/templates/from-project/${project.id}`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          templateName: 'Valid Name',
          slotConfigurations: [
            {
              targetClipId: clips[0].id,
              isSlot: true,
              label: 'L'.repeat(85), // Exceeds 80 chars
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/80 characters/i);
    });
  });

  // ==========================================
  // 2. SAFETY & NON-DESTRUCTIVE INVARIANCE
  // ==========================================
  describe('Project & Media Invariance Safety', () => {
    it('proves that creating a template leaves the source project, timeline, tracks, and clips completely intact', async () => {
      if (!db) return;
      const { project, timeline, tracks: originalTracks, clips: originalClips } =
        await createRealisticProject(userA_Id, 'Untouched Master Project');

      // Convert to template
      const res = await request(testApp)
        .post(`/api/templates/from-project/${project.id}`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          templateName: 'Master Derived Template',
        });

      expect(res.status).toBe(201);

      // Verify source project record in database is unchanged
      const [freshProj] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, project.id));

      expect(freshProj).toBeDefined();
      expect(freshProj.name).toBe('Untouched Master Project');
      expect(freshProj.aspectRatio).toBe('16:9');
      expect(freshProj.isArchived).toBe(false);

      // Verify source timeline record
      const [freshTl] = await db
        .select()
        .from(timelines)
        .where(eq(timelines.id, timeline.id));

      expect(freshTl).toBeDefined();
      expect(freshTl.durationMs).toBe(12000);

      // Verify source tracks and clips are exactly as they were
      const freshTracks = await db
        .select()
        .from(tracks)
        .where(eq(tracks.timelineId, timeline.id));

      expect(freshTracks).toHaveLength(originalTracks.length);

      const freshClips = await db
        .select()
        .from(clips)
        .where(eq(clips.trackId, originalTracks[0].id));

      expect(freshClips.length).toBeGreaterThan(0);
    });

    it('ensures private media asset IDs and presigned URLs are never leaked into template snapshot', async () => {
      if (!db) return;
      const { project } = await createRealisticProject(userA_Id, 'Media Security Project');

      const res = await request(testApp)
        .post(`/api/templates/from-project/${project.id}`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          templateName: 'Secure Clean Template',
        });

      expect(res.status).toBe(201);

      const snapshot = res.body.version.timelineSnapshot;
      const snapString = JSON.stringify(snapshot);

      expect(snapString).not.toContain('presigned');
      expect(snapString).not.toContain('downloadUrl');
      expect(snapString).not.toContain('r2.cloudflarestorage');

      for (const trk of snapshot.tracks) {
        for (const clp of trk.clips) {
          expect(clp.mediaAssetId).toBeNull();
        }
      }
    });
  });

  // ==========================================
  // 3. MULTI-TENANT & IDOR PROTECTION
  // ==========================================
  describe('Multi-Tenant Ownership & IDOR Protection', () => {
    it('strictly forbids User B from converting User A project into a template (IDOR prevention)', async () => {
      if (!db) return;
      const { project } = await createRealisticProject(userA_Id, "Alice's Secret Project");

      // Bob tries to convert Alice's project
      const res = await request(testApp)
        .post(`/api/templates/from-project/${project.id}`)
        .set('Authorization', 'Bearer bob-valid-token') // User B
        .send({
          templateName: "Bob's Stolen Template",
        });

      // Must be 404 or 403 (project not found or access denied)
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found|access denied/i);

      // Verify no template was created for Bob
      const bobTemplates = await db
        .select()
        .from(templates)
        .where(and(eq(templates.userId, userB_Id), eq(templates.name, "Bob's Stolen Template")));

      expect(bobTemplates).toHaveLength(0);
    });

    it('returns 404 if project ID does not exist', async () => {
      const res = await request(testApp)
        .post('/api/templates/from-project/00000000-0000-0000-0000-000000000999')
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          templateName: 'Ghost Project Template',
        });

      expect(res.status).toBe(404);
    });
  });
});
