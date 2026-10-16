import { describe, it, expect, beforeEach } from 'vitest';
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
import {
  createTemplate,
  applyTemplateToProject,
} from '../server/services/templateService';
import {
  replaceProjectSlotMedia,
  ProjectSlotError,
} from '../server/services/projectSlotService';
import type { AuthenticatedRequest } from '../server/db/auth';

describe('Phase 7G: Replace Template Media', () => {
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

    // Mount slot replacement routes matching production
    testApp.post('/api/projects/:id/slots/:slotKey/replace', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
        res.status(500).json({ error: 'Failed to replace slot media.' });
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

  // Helper to create a template and apply it to create a project for Alice
  const createAppliedProjectForUser = async (userId: string, isPublic = false) => {
    const templateResult = await createTemplate(
      {
        name: `Test Recipe ${Date.now()}`,
        aspectRatio: '16:9',
        resolution: '1080p',
        fps: 30,
        durationMs: 10000,
        isPublic,
        tracks: [
          {
            id: 'track-v',
            name: 'Main Video Track',
            trackType: 'video',
            orderIndex: 0,
            clips: [
              {
                id: 'clip-hero',
                name: 'Hero Placeholder Clip',
                clipType: 'video',
                startTimeMs: 0,
                endTimeMs: 5000,
                slotBinding: 'hero_video',
              },
              {
                id: 'clip-fixed',
                name: 'Fixed Endscreen Graphic',
                clipType: 'video',
                startTimeMs: 5000,
                endTimeMs: 10000,
                slotBinding: null, // Fixed, non-replaceable!
              },
            ],
          },
        ],
        slots: [
          {
            slotKey: 'hero_video',
            label: 'Hero Video Input',
            type: 'video',
            targetClipId: 'clip-hero',
          },
        ],
      },
      userId
    );

    const applyResult = await applyTemplateToProject(templateResult.template.id, userId, {
      projectName: `Instantiated Project ${Date.now()}`,
    });

    return {
      template: templateResult.template,
      templateVersion: templateResult.version,
      project: applyResult.project,
      timeline: applyResult.timeline,
    };
  };

  // =========================================================================
  // 1. AUTHENTICATED REPLACEMENT ROUTE SECURITY
  // =========================================================================
  describe('HTTP Route Security & Authentication Enforcement', () => {
    it('rejects unauthenticated POST /api/projects/:id/slots/:slotKey/replace with 401', async () => {
      const res = await request(baseApp)
        .post('/api/projects/00000000-0000-0000-0000-000000000000/slots/hero_video/replace')
        .send({ mediaAssetId: '00000000-0000-0000-0000-000000000001' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('rejects invalid bearer token with 401', async () => {
      const res = await request(baseApp)
        .post('/api/projects/00000000-0000-0000-0000-000000000000/slots/hero_video/replace')
        .set('Authorization', 'Bearer invalid-token')
        .send({ mediaAssetId: '00000000-0000-0000-0000-000000000001' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });
  });

  // =========================================================================
  // 2. PROJECT OWNERSHIP & IDOR ISOLATION
  // =========================================================================
  describe('Project Ownership & IDOR Protection', () => {
    it('strictly forbids User B from replacing slots in User A project (IDOR prevention)', async () => {
      if (!db) return;

      const { project } = await createAppliedProjectForUser(userA_Id);

      // Bob tries to replace slot in Alice's project
      const res = await request(mockApp)
        .post(`/api/projects/${project.id}/slots/hero_video/replace`)
        .set('Authorization', 'Bearer bob-valid-token')
        .send({ mediaAssetId: null });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });
  });

  // =========================================================================
  // 3. MEDIA ASSET OWNERSHIP VERIFICATION
  // =========================================================================
  describe('Media Asset Ownership Verification', () => {
    it('strictly prevents User A from assigning User B private media asset to a slot (cross-user leak protection)', async () => {
      if (!db) return;

      const { project } = await createAppliedProjectForUser(userA_Id);

      // Bob uploads private media
      const [bobMedia] = await db
        .insert(mediaAssets)
        .values({
          userId: userB_Id,
          originalFilename: 'bob-confidential.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 2048000,
          storageKey: `users/bob/confidential_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`,
        })
        .returning();

      // Alice attempts to attach Bob's private media asset to her project slot
      const res = await request(mockApp)
        .post(`/api/projects/${project.id}/slots/hero_video/replace`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ mediaAssetId: bobMedia.id });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/media asset not found or access denied/i);
    });
  });

  // =========================================================================
  // 4. REPLACEABLE VS FIXED SLOT ENFORCEMENT
  // =========================================================================
  describe('Replaceable vs Fixed Slot Enforcement', () => {
    it('rejects replacement request for a non-existent slotKey with 404', async () => {
      if (!db) return;

      const { project } = await createAppliedProjectForUser(userA_Id);

      const res = await request(mockApp)
        .post(`/api/projects/${project.id}/slots/non_existent_slot/replace`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ mediaAssetId: null });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or not marked as replaceable/i);
    });

    it('rejects replacement when slot key is empty or blank with 400', async () => {
      if (!db) return;

      const { project } = await createAppliedProjectForUser(userA_Id);

      const res = await request(mockApp)
        .post(`/api/projects/${project.id}/slots/%20%20%20/replace`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ mediaAssetId: null });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/slot key is required/i);
    });
  });

  // =========================================================================
  // 5. SUCCESSFUL REPLACEMENT & PERSISTENCE
  // =========================================================================
  describe('Successful Replacement & Persistence', () => {
    it('successfully replaces slot media, updates clip, and creates a new project version snapshot', async () => {
      if (!db) return;

      const { project } = await createAppliedProjectForUser(userA_Id);

      // Alice uploads a valid video asset
      const [aliceMedia] = await db
        .insert(mediaAssets)
        .values({
          userId: userA_Id,
          originalFilename: 'alice-product-shot.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 5240000,
          storageKey: `users/alice/shot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`,
        })
        .returning();

      // Alice replaces the hero_video slot
      const res = await request(mockApp)
        .post(`/api/projects/${project.id}/slots/hero_video/replace`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ mediaAssetId: aliceMedia.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.replacedSlot).toBe('hero_video');
      expect(res.body.mediaAsset.id).toBe(aliceMedia.id);

      // Verify the target clip now references aliceMedia.id
      const targetClip = res.body.timeline.tracks[0].clips.find((c: any) => c.slotBinding === 'hero_video');
      expect(targetClip).toBeDefined();
      expect(targetClip.mediaAssetId).toBe(aliceMedia.id);

      // Verify the fixed clip was untouched
      const fixedClip = res.body.timeline.tracks[0].clips.find((c: any) => c.name === 'Fixed Endscreen Graphic');
      expect(fixedClip).toBeDefined();
      expect(fixedClip.mediaAssetId).toBeNull();
      expect(fixedClip.slotBinding).toBeNull();

      // Verify new project version was created in DB
      const updatedVersions = await db
        .select()
        .from(projectVersions)
        .where(eq(projectVersions.projectId, project.id));

      expect(updatedVersions.length).toBeGreaterThanOrEqual(2);
      const latestVersion = updatedVersions.find((v) => v.versionNumber === res.body.project.currentVersionNumber);
      expect(latestVersion).toBeDefined();
      expect(latestVersion?.label).toContain('hero_video');
    });

    it('allows detaching/clearing media by passing mediaAssetId: null', async () => {
      if (!db) return;

      const { project } = await createAppliedProjectForUser(userA_Id);

      // Alice uploads a valid asset and attaches it first
      const [aliceMedia] = await db
        .insert(mediaAssets)
        .values({
          userId: userA_Id,
          originalFilename: 'alice-temporary.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1024000,
          storageKey: `users/alice/temp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`,
        })
        .returning();

      await request(mockApp)
        .post(`/api/projects/${project.id}/slots/hero_video/replace`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ mediaAssetId: aliceMedia.id });

      // Alice detaches the media
      const res = await request(mockApp)
        .post(`/api/projects/${project.id}/slots/hero_video/replace`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ mediaAssetId: null });

      expect(res.status).toBe(200);
      const targetClip = res.body.timeline.tracks[0].clips.find((c: any) => c.slotBinding === 'hero_video');
      expect(targetClip.mediaAssetId).toBeNull();
      // Slot binding must still be preserved!
      expect(targetClip.slotBinding).toBe('hero_video');
    });
  });

  // =========================================================================
  // 6. ORIGINAL TEMPLATE IMMUTABILITY
  // =========================================================================
  describe('Original Template Immutability', () => {
    it('guarantees that replacing media in a project leaves the original template and version 100% untouched', async () => {
      if (!db) return;

      const { template, templateVersion, project } = await createAppliedProjectForUser(userA_Id);

      // Capture template state before replacement
      const [templateBefore] = await db.select().from(templates).where(eq(templates.id, template.id));
      const [versionBefore] = await db.select().from(templateVersions).where(eq(templateVersions.id, templateVersion.id));
      const slotsBefore = await db.select().from(templateSlots).where(eq(templateSlots.templateVersionId, templateVersion.id));

      // Alice uploads and replaces media in the project
      const [media] = await db
        .insert(mediaAssets)
        .values({
          userId: userA_Id,
          originalFilename: 'shot.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1000000,
          storageKey: `users/alice/shot_immut_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`,
        })
        .returning();

      await request(mockApp)
        .post(`/api/projects/${project.id}/slots/hero_video/replace`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ mediaAssetId: media.id });

      // Verify template state after project replacement
      const [templateAfter] = await db.select().from(templates).where(eq(templates.id, template.id));
      const [versionAfter] = await db.select().from(templateVersions).where(eq(templateVersions.id, templateVersion.id));
      const slotsAfter = await db.select().from(templateSlots).where(eq(templateSlots.templateVersionId, templateVersion.id));

      expect(templateAfter.name).toBe(templateBefore.name);
      expect(templateAfter.currentVersionNumber).toBe(templateBefore.currentVersionNumber);
      expect(templateAfter.updatedAt).toEqual(templateBefore.updatedAt);
      expect(versionAfter.checksum).toBe(versionBefore.checksum);
      expect(versionAfter.timelineSnapshot).toEqual(versionBefore.timelineSnapshot);
      expect(slotsAfter.length).toBe(slotsBefore.length);
    });
  });

  // =========================================================================
  // 7. FAILED REPLACEMENT DOES NOT CORRUPT PROJECT STATE
  // =========================================================================
  describe('Atomic Safety & Rollback', () => {
    it('ensures that a failed replacement (e.g. invalid media) does not corrupt or alter the project', async () => {
      if (!db) return;

      const { project } = await createAppliedProjectForUser(userA_Id);

      // Capture version count before failed call
      const versionsBefore = await db
        .select()
        .from(projectVersions)
        .where(eq(projectVersions.projectId, project.id));

      // Attempt replacement with an invalid media asset ID
      const res = await request(mockApp)
        .post(`/api/projects/${project.id}/slots/hero_video/replace`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ mediaAssetId: '00000000-0000-0000-0000-000000000099' });

      expect(res.status).toBe(403);

      // Verify project versions count was not incremented
      const versionsAfter = await db
        .select()
        .from(projectVersions)
        .where(eq(projectVersions.projectId, project.id));

      expect(versionsAfter.length).toBe(versionsBefore.length);
    });
  });
});
