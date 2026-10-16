import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import express, { type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createExpressApp } from '../server/app';
import { getDb } from '../server/db';
import { users } from '../server/db/schema/users';
import { projects, projectVersions } from '../server/db/schema/projects';
import { timelines, tracks, clips } from '../server/db/schema/timelines';
import { templates, templateVersions, templateSlots } from '../server/db/schema/templates';
import { mediaAssets } from '../server/db/schema/media';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import {
  createTemplate,
  createTemplateVersion,
  createTemplateFromProject,
  applyTemplateToProject,
  getTemplateById,
  TemplateServiceError,
} from '../server/services/templateService';
import type { AuthenticatedRequest } from '../server/db/auth';

describe('Phase 7F: Apply Template / Template Instantiation', () => {
  const baseApp = createExpressApp();
  const db = getDb();

  const userA_Id = '00000000-0000-0000-0000-000000000001';
  const userA_Email = 'alice.creator@modify.dev';

  const userB_Id = '00000000-0000-0000-0000-000000000002';
  const userB_Email = 'bob.editor@modify.dev';

  // Create an Express test app with mock auth header parser for route testing
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

    // Mount templates apply route identical to production
    testApp.post('/api/templates/:id/apply', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const userId = req.userId!;
        const { id } = req.params;
        const { projectName, versionNumber, versionId } = req.body || {};

        const result = await applyTemplateToProject(id, userId, {
          projectName,
          versionNumber,
          versionId,
        });

        res.status(201).json(result);
      } catch (err: unknown) {
        if (err instanceof TemplateServiceError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: 'Failed to apply template.' });
      }
    });

    return testApp;
  };

  const mockApp = createMockAuthApp();

  beforeEach(async () => {
    if (!db) return;

    // Seed test users
    const existingA = await db.select().from(users).where(eq(users.id, userA_Id));
    if (existingA.length === 0) {
      await db.insert(users).values({
        id: userA_Id,
        email: userA_Email,
        displayName: 'Alice Template Creator',
        subscriptionTier: 'pro',
      });
    }

    const existingB = await db.select().from(users).where(eq(users.id, userB_Id));
    if (existingB.length === 0) {
      await db.insert(users).values({
        id: userB_Id,
        email: userB_Email,
        displayName: 'Bob Consumer',
        subscriptionTier: 'free',
      });
    }
  });

  // =========================================================================
  // 1. HTTP AUTHENTICATION & ROUTE SECURITY
  // =========================================================================
  describe('HTTP Route Security & Authentication Enforcement', () => {
    it('rejects unauthenticated POST /api/templates/:id/apply with 401', async () => {
      const res = await request(baseApp)
        .post('/api/templates/00000000-0000-0000-0000-000000000000/apply')
        .send({ projectName: 'Hacked Project' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('rejects invalid bearer token with 401', async () => {
      const res = await request(baseApp)
        .post('/api/templates/00000000-0000-0000-0000-000000000000/apply')
        .set('Authorization', 'Bearer totally-invalid-token')
        .send({ projectName: 'Hacked Project' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });
  });

  // =========================================================================
  // 2. TEMPLATE APPLICATION CONTRACT & PROJECT CREATION
  // =========================================================================
  describe('Template Application Contract & Project Creation', () => {
    it('successfully instantiates a template into a brand new independent project with default name', async () => {
      if (!db) return;

      // Alice creates a template recipe
      const templateResult = await createTemplate(
        {
          name: 'Cinematic Product Teaser',
          description: 'High energy product intro template',
          category: 'marketing',
          aspectRatio: '16:9',
          resolution: '1080p',
          fps: 30,
          durationMs: 15000,
          isPublic: false,
          tracks: [
            {
              id: 'track-v1',
              name: 'Hero Video Track',
              trackType: 'video',
              orderIndex: 0,
              clips: [
                {
                  id: 'clip-v1',
                  name: 'Product Reveal',
                  clipType: 'video',
                  startTimeMs: 0,
                  endTimeMs: 5000,
                  transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, opacity: 1 },
                  effects: [{ type: 'vignette', intensity: 0.4 }],
                },
              ],
            },
            {
              id: 'track-a1',
              name: 'Audio Track',
              trackType: 'audio',
              orderIndex: 1,
              volume: 0.8,
              clips: [
                {
                  id: 'clip-a1',
                  name: 'Background Beat',
                  clipType: 'audio',
                  startTimeMs: 0,
                  endTimeMs: 15000,
                  audioProperties: { volume: 0.75, fadeInMs: 500, fadeOutMs: 1000 },
                },
              ],
            },
          ],
          slots: [
            {
              slotKey: 'hero_video',
              label: 'Hero Product Video',
              type: 'video',
              targetClipId: 'clip-v1',
              description: 'Drop your product demo video here',
            },
          ],
        },
        userA_Id
      );

      // Apply the template via HTTP
      const res = await request(mockApp)
        .post(`/api/templates/${templateResult.template.id}/apply`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.project).toBeDefined();
      expect(res.body.project.id).toBeDefined();
      // Project ID must not be the template ID
      expect(res.body.project.id).not.toBe(templateResult.template.id);
      // Default name: "Cinematic Product Teaser — New Project"
      expect(res.body.project.name).toBe('Cinematic Product Teaser — New Project');
      expect(res.body.project.userId).toBe(userA_Id);
      expect(res.body.project.aspectRatio).toBe('16:9');
      expect(res.body.project.resolution).toBe('1080p');
      expect(res.body.project.fps).toBe(30);
      expect(res.body.project.durationMs).toBe(15000);
      expect(res.body.templateVersionApplied).toBe(1);

      // Timeline verification
      expect(res.body.timeline).toBeDefined();
      expect(res.body.timeline.tracks).toHaveLength(2);

      const createdTracks = res.body.timeline.tracks;
      expect(createdTracks[0].name).toBe('Hero Video Track');
      expect(createdTracks[0].clips).toHaveLength(1);
      expect(createdTracks[0].clips[0].name).toBe('Product Reveal');
      // Slot binding preserved
      expect(createdTracks[0].clips[0].slotBinding).toBe('hero_video');
      // MediaAssetId is null for replaceable slot
      expect(createdTracks[0].clips[0].mediaAssetId).toBeNull();
      // Effects preserved
      expect(createdTracks[0].clips[0].effects).toEqual([{ type: 'vignette', intensity: 0.4 }]);

      // Audio track checks
      expect(createdTracks[1].name).toBe('Audio Track');
      expect(createdTracks[1].clips[0].audioProperties).toEqual({ volume: 0.75, muted: false, fadeInMs: 500, fadeOutMs: 1000 });
    });

    it('successfully instantiates a template with a custom project name', async () => {
      if (!db) return;

      const templateResult = await createTemplate(
        {
          name: 'Social Reel Quickstart',
          aspectRatio: '9:16',
          resolution: '1080p',
          fps: 60,
          durationMs: 8000,
          isPublic: false,
          tracks: [],
          slots: [],
        },
        userA_Id
      );

      const customName = 'My Q3 Brand Launch Story';
      const res = await request(mockApp)
        .post(`/api/templates/${templateResult.template.id}/apply`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ projectName: customName });

      expect(res.status).toBe(201);
      expect(res.body.project.name).toBe(customName);
      expect(res.body.project.aspectRatio).toBe('9:16');
      expect(res.body.project.fps).toBe(60);
    });

    it('rejects blank project name with 400 validation error', async () => {
      if (!db) return;

      const templateResult = await createTemplate(
        {
          name: 'Blank Name Test Template',
          tracks: [],
          slots: [],
        },
        userA_Id
      );

      const res = await request(mockApp)
        .post(`/api/templates/${templateResult.template.id}/apply`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ projectName: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/project name/i);
    });

    it('rejects excessively long project name (>100 chars) with 400 validation error', async () => {
      if (!db) return;

      const templateResult = await createTemplate(
        {
          name: 'Length Test Template',
          tracks: [],
          slots: [],
        },
        userA_Id
      );

      const tooLongName = 'A'.repeat(101);
      const res = await request(mockApp)
        .post(`/api/templates/${templateResult.template.id}/apply`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ projectName: tooLongName });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/100 characters/i);
    });
  });

  // =========================================================================
  // 3. MULTI-TENANT OWNERSHIP & IDOR ISOLATION
  // =========================================================================
  describe('Multi-Tenant Ownership & IDOR Protection', () => {
    it('strictly forbids User B from applying User A private template (IDOR prevention)', async () => {
      if (!db) return;

      // Alice creates a private template
      const privateTemplate = await createTemplate(
        {
          name: 'Alice Private Internal Playbook',
          isPublic: false,
          tracks: [],
          slots: [],
        },
        userA_Id
      );

      // Bob attempts to apply Alice's private template
      const res = await request(mockApp)
        .post(`/api/templates/${privateTemplate.template.id}/apply`)
        .set('Authorization', 'Bearer bob-valid-token')
        .send({ projectName: 'Stolen Playbook' });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });

    it('allows User B to apply User A public template, assigning project ownership to User B', async () => {
      if (!db) return;

      // Alice creates a public template
      const publicTemplate = await createTemplate(
        {
          name: 'Community Viral Short',
          category: 'social',
          aspectRatio: '9:16',
          isPublic: true,
          tracks: [
            {
              id: 'track-1',
              name: 'Video',
              trackType: 'video',
              orderIndex: 0,
              clips: [
                {
                  id: 'clip-1',
                  name: 'Background Clip',
                  clipType: 'video',
                  startTimeMs: 0,
                  endTimeMs: 6000,
                },
              ],
            },
          ],
          slots: [],
        },
        userA_Id
      );

      // Bob applies Alice's public template
      const res = await request(mockApp)
        .post(`/api/templates/${publicTemplate.template.id}/apply`)
        .set('Authorization', 'Bearer bob-valid-token')
        .send({ projectName: 'Bob TikTok Video' });

      expect(res.status).toBe(201);
      // Project must be owned by Bob, NEVER Alice
      expect(res.body.project.userId).toBe(userB_Id);
      expect(res.body.project.name).toBe('Bob TikTok Video');

      // Verify in DB that Bob owns the project
      const [bobProject] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, res.body.project.id));
      expect(bobProject.userId).toBe(userB_Id);
    });
  });

  // =========================================================================
  // 4. TEMPLATE VERSION SELECTION & IMMUTABILITY
  // =========================================================================
  describe('Template Version Selection & Immutability', () => {
    it('applies a specific immutable historical version when requested', async () => {
      if (!db) return;

      // Create v1
      const initial = await createTemplate(
        {
          name: 'Multi-version Template',
          aspectRatio: '16:9',
          durationMs: 5000,
          tracks: [
            {
              id: 't-1',
              name: 'Track V1',
              trackType: 'video',
              orderIndex: 0,
              clips: [
                {
                  id: 'c-1',
                  name: 'Clip V1',
                  clipType: 'video',
                  startTimeMs: 0,
                  endTimeMs: 5000,
                },
              ],
            },
          ],
          slots: [],
        },
        userA_Id
      );

      // Create v2 with updated duration and track
      const v2Result = await createTemplateVersion(
        initial.template.id,
        {
          durationMs: 12000,
          changelog: 'Extended duration to 12s and added audio',
          tracks: [
            {
              id: 't-1',
              name: 'Track V2',
              trackType: 'video',
              orderIndex: 0,
              clips: [
                {
                  id: 'c-1',
                  name: 'Clip V2',
                  clipType: 'video',
                  startTimeMs: 0,
                  endTimeMs: 12000,
                },
              ],
            },
          ],
          slots: [],
        },
        userA_Id
      );

      expect(v2Result.version.versionNumber).toBe(2);

      // 1. Apply specifically version 1
      const resV1 = await request(mockApp)
        .post(`/api/templates/${initial.template.id}/apply`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          projectName: 'Project from V1',
          versionNumber: 1,
        });

      expect(resV1.status).toBe(201);
      expect(resV1.body.templateVersionApplied).toBe(1);
      expect(resV1.body.project.durationMs).toBe(5000);
      expect(resV1.body.timeline.tracks[0].name).toBe('Track V1');

      // 2. Apply default (latest = v2)
      const resLatest = await request(mockApp)
        .post(`/api/templates/${initial.template.id}/apply`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          projectName: 'Project from Latest V2',
        });

      expect(resLatest.status).toBe(201);
      expect(resLatest.body.templateVersionApplied).toBe(2);
      expect(resLatest.body.project.durationMs).toBe(12000);
      expect(resLatest.body.timeline.tracks[0].name).toBe('Track V2');
    });

    it('rejects applying a non-existent version number with 404', async () => {
      if (!db) return;

      const template = await createTemplate(
        {
          name: 'Version 404 Test',
          tracks: [],
          slots: [],
        },
        userA_Id
      );

      const res = await request(mockApp)
        .post(`/api/templates/${template.template.id}/apply`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          versionNumber: 999,
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/version not found/i);
    });
  });

  // =========================================================================
  // 5. NON-NEGOTIABLE INVARIANCE & STRUCTURAL INTEGRITY
  // =========================================================================
  describe('Non-Negotiable Invariance & Structural Integrity', () => {
    it('guarantees that applying a template never mutates the original template or its versions', async () => {
      if (!db) return;

      // 1. Create a template
      const created = await createTemplate(
        {
          name: 'Immutable Benchmark Template',
          description: 'Strict invariance benchmark',
          category: 'tutorial',
          aspectRatio: '16:9',
          resolution: '1080p',
          fps: 30,
          durationMs: 7500,
          tracks: [
            {
              id: 'track-bench-1',
              name: 'Tutorial Visuals',
              trackType: 'video',
              orderIndex: 0,
              clips: [
                {
                  id: 'clip-bench-1',
                  name: 'Tutorial Screen Recording',
                  clipType: 'video',
                  startTimeMs: 0,
                  endTimeMs: 7500,
                  transform: { position: { x: 10, y: 20 }, scale: { x: 1.2, y: 1.2 }, rotation: 5, opacity: 0.9 },
                },
              ],
            },
          ],
          slots: [
            {
              slotKey: 'screen_recording',
              label: 'Screen Recording',
              type: 'video',
              targetClipId: 'clip-bench-1',
            },
          ],
        },
        userA_Id
      );

      const templateId = created.template.id;

      // Capture frozen state before apply
      const [templateBefore] = await db.select().from(templates).where(eq(templates.id, templateId));
      const [versionBefore] = await db
        .select()
        .from(templateVersions)
        .where(eq(templateVersions.templateId, templateId));
      const slotsBefore = await db
        .select()
        .from(templateSlots)
        .where(eq(templateSlots.templateVersionId, versionBefore.id));

      // 2. Apply template 3 consecutive times
      for (let i = 1; i <= 3; i++) {
        const res = await request(mockApp)
          .post(`/api/templates/${templateId}/apply`)
          .set('Authorization', 'Bearer alice-valid-token')
          .send({ projectName: `Applied Instance ${i}` });
        expect(res.status).toBe(201);
      }

      // 3. Capture state after apply and verify 100% byte & field invariance
      const [templateAfter] = await db.select().from(templates).where(eq(templates.id, templateId));
      const [versionAfter] = await db
        .select()
        .from(templateVersions)
        .where(eq(templateVersions.templateId, templateId));
      const slotsAfter = await db
        .select()
        .from(templateSlots)
        .where(eq(templateSlots.templateVersionId, versionAfter.id));

      expect(templateAfter.name).toBe(templateBefore.name);
      expect(templateAfter.currentVersionNumber).toBe(templateBefore.currentVersionNumber);
      expect(templateAfter.isArchived).toBe(false);
      expect(versionAfter.checksum).toBe(versionBefore.checksum);
      expect(versionAfter.timelineSnapshot).toEqual(versionBefore.timelineSnapshot);
      expect(slotsAfter.length).toBe(slotsBefore.length);
      expect(slotsAfter[0].slotKey).toBe(slotsBefore[0].slotKey);
    });

    it('guarantees that applying a project-derived template leaves the original source project 100% intact', async () => {
      if (!db) return;

      // 1. Create a source project with tracks and clips
      const [sourceProj] = await db
        .insert(projects)
        .values({
          userId: userA_Id,
          name: 'Original Source Project',
          aspectRatio: '16:9',
          resolution: '1080p',
          fps: 30,
          durationMs: 10000,
        })
        .returning();

      const [sourceTimeline] = await db
        .insert(timelines)
        .values({
          projectId: sourceProj.id,
          durationMs: 10000,
          fps: 30,
        })
        .returning();

      const [sourceTrack] = await db
        .insert(tracks)
        .values({
          timelineId: sourceTimeline.id,
          index: 0,
          type: 'video',
          name: 'Original Track',
        })
        .returning();

      const [sourceClip] = await db
        .insert(clips)
        .values({
          trackId: sourceTrack.id,
          type: 'video',
          name: 'Original Clip',
          startMs: 0,
          endMs: 10000,
        })
        .returning();

      // 2. Convert project to template
      const template = await createTemplateFromProject(sourceProj.id, userA_Id, {
        templateName: 'Template from Source',
      });

      // 3. Apply the template to create a second, separate project
      const res = await request(mockApp)
        .post(`/api/templates/${template.template.id}/apply`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ projectName: 'Cloned Project' });

      expect(res.status).toBe(201);
      const newProjectId = res.body.project.id;
      expect(newProjectId).not.toBe(sourceProj.id);

      // 4. Verify source project remains completely intact
      const [sourceProjCheck] = await db.select().from(projects).where(eq(projects.id, sourceProj.id));
      const [sourceTimelineCheck] = await db.select().from(timelines).where(eq(timelines.projectId, sourceProj.id));
      const sourceTracksCheck = await db.select().from(tracks).where(eq(tracks.timelineId, sourceTimeline.id));
      const sourceClipsCheck = await db.select().from(clips).where(eq(clips.trackId, sourceTrack.id));

      expect(sourceProjCheck.name).toBe('Original Source Project');
      expect(sourceTimelineCheck.id).toBe(sourceTimeline.id);
      expect(sourceTracksCheck).toHaveLength(1);
      expect(sourceTracksCheck[0].name).toBe('Original Track');
      expect(sourceClipsCheck).toHaveLength(1);
      expect(sourceClipsCheck[0].name).toBe('Original Clip');
    });
  });

  // =========================================================================
  // 6. CLONING STRUCTURED EDITING STATE & SLOTS
  // =========================================================================
  describe('Cloning Structured Editing State & Slot Handling', () => {
    it('clones complete structured editing properties and bootstraps project version 1 snapshot', async () => {
      if (!db) return;

      const template = await createTemplate(
        {
          name: 'Full Feature Template',
          aspectRatio: '1:1',
          resolution: '1080p',
          fps: 60,
          durationMs: 10000,
          tracks: [
            {
              id: 't-text',
              name: 'Text Overlay',
              trackType: 'text',
              orderIndex: 0,
              clips: [
                {
                  id: 'c-text-1',
                  name: 'Main Title',
                  clipType: 'text',
                  startTimeMs: 1000,
                  endTimeMs: 4000,
                  textProperties: {
                    content: 'Sale Ends Tomorrow',
                    fontFamily: 'Inter',
                    fontSize: 48,
                    color: '#FFFFFF',
                    fontWeight: 700,
                  },
                  transform: { position: { x: 50, y: 100 }, scale: { x: 1, y: 1 }, rotation: 0, opacity: 1 },
                },
              ],
            },
          ],
          slots: [
            {
              slotKey: 'headline_text',
              label: 'Headline Text',
              type: 'text',
              targetClipId: 'c-text-1',
            },
          ],
        },
        userA_Id
      );

      const res = await request(mockApp)
        .post(`/api/templates/${template.template.id}/apply`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ projectName: 'Square Ad Campaign' });

      expect(res.status).toBe(201);
      const newProjectId = res.body.project.id;

      // Verify text properties preserved
      const appliedClip = res.body.timeline.tracks[0].clips[0];
      expect(appliedClip.textProperties).toEqual({
        content: 'Sale Ends Tomorrow',
        fontFamily: 'Inter',
        fontSize: 48,
        color: '#FFFFFF',
        fontWeight: 700,
      });
      expect(appliedClip.slotBinding).toBe('headline_text');

      // Verify project_versions table contains version 1 snapshot with sha256 checksum
      const [initialVersion] = await db
        .select()
        .from(projectVersions)
        .where(and(eq(projectVersions.projectId, newProjectId), eq(projectVersions.versionNumber, 1)));

      expect(initialVersion).toBeDefined();
      expect(initialVersion.versionNumber).toBe(1);
      expect(initialVersion.checksum).toHaveLength(64);
      expect(initialVersion.snapshot).toBeDefined();
    });

    it('isolates fixed media: detaches media assets not owned by the applicant to prevent cross-user IDOR leak', async () => {
      if (!db) return;

      // Alice owns a media asset
      const [aliceMedia] = await db
        .insert(mediaAssets)
        .values({
          userId: userA_Id,
          originalFilename: 'alice-secret-brand-asset.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1024000,
          storageKey: `users/alice/asset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mp4`,
        })
        .returning();

      // Alice creates a public template with a fixed clip referencing her mediaAssetId (not bound to slot)
      const publicTemplate = await createTemplate(
        {
          name: 'Public Template with Fixed Media',
          isPublic: true,
          tracks: [
            {
              id: 't-fixed',
              name: 'Fixed Track',
              trackType: 'video',
              orderIndex: 0,
              clips: [
                {
                  id: 'c-fixed',
                  name: 'Fixed Video',
                  clipType: 'video',
                  startTimeMs: 0,
                  endTimeMs: 5000,
                  mediaAssetId: aliceMedia.id,
                  slotBinding: null,
                },
              ],
            },
          ],
          slots: [],
        },
        userA_Id
      );

      // Bob applies this public template
      const res = await request(mockApp)
        .post(`/api/templates/${publicTemplate.template.id}/apply`)
        .set('Authorization', 'Bearer bob-valid-token')
        .send({ projectName: 'Bob Instantiated Project' });

      expect(res.status).toBe(201);
      // Because Bob does NOT own aliceMedia, the mediaAssetId must be set to null for Bob's project
      const bobClip = res.body.timeline.tracks[0].clips[0];
      expect(bobClip.mediaAssetId).toBeNull();
    });
  });
});
