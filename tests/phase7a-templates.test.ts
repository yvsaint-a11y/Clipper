import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createExpressApp } from '../server/app';
import { getDb } from '../server/db';
import { users } from '../server/db/schema/users';
import { templates, templateVersions, templateSlots } from '../server/db/schema/templates';
import { projects } from '../server/db/schema/projects';
import { timelines, tracks, clips } from '../server/db/schema/timelines';
import {
  buildCanonicalTemplateSnapshot,
  computeTemplateSnapshotChecksum,
  validateTemplateSnapshot,
} from '../server/services/templateSnapshotService';
import {
  createTemplate,
  createTemplateVersion,
  getTemplateById,
  getTemplateVersionById,
  listTemplates,
  updateTemplateMetadata,
  archiveTemplate,
  createTemplateFromProject,
  TemplateServiceError,
} from '../server/services/templateService';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

describe('Phase 7A: Template System Foundation — Data Model & API', () => {
  const app = createExpressApp();
  const db = getDb();

  // Test user identities
  const userA_Id = crypto.randomUUID();
  const userB_Id = crypto.randomUUID();
  const userA_Email = `alice_template_${Date.now()}@test.modify.video`;
  const userB_Email = `bob_template_${Date.now()}@test.modify.video`;

  beforeEach(async () => {
    if (!db) return;
    // Seed users if not existing
    const existingA = await db.select().from(users).where(eq(users.id, userA_Id));
    if (existingA.length === 0) {
      await db.insert(users).values({
        id: userA_Id,
        email: userA_Email,
        displayName: 'Alice Template Creator',
        subscriptionTier: 'free',
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

  afterAll(async () => {
    if (!db) return;
    try {
      await db.delete(users).where(eq(users.id, userA_Id));
      await db.delete(users).where(eq(users.id, userB_Id));
    } catch {
      // Ignored
    }
  });

  // ==========================================
  // 1. HTTP AUTHENTICATION & ROUTE SECURITY
  // ==========================================
  describe('HTTP Route Security & Authentication Enforcement', () => {
    it('rejects unauthenticated GET /api/templates with 401', async () => {
      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects unauthenticated GET /api/templates/:id with 401', async () => {
      const res = await request(app).get(`/api/templates/${crypto.randomUUID()}`);
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects unauthenticated POST /api/templates with 401', async () => {
      const res = await request(app)
        .post('/api/templates')
        .send({ name: 'Unauthorized Template' });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects unauthenticated POST /api/templates/:id/versions with 401', async () => {
      const res = await request(app)
        .post(`/api/templates/${crypto.randomUUID()}/versions`)
        .send({ name: 'Unauthorized Version' });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects unauthenticated PATCH /api/templates/:id with 401', async () => {
      const res = await request(app)
        .patch(`/api/templates/${crypto.randomUUID()}`)
        .send({ name: 'Unauthorized Rename' });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects unauthenticated DELETE /api/templates/:id with 401', async () => {
      const res = await request(app).delete(`/api/templates/${crypto.randomUUID()}`);
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ==========================================
  // 2. DETERMINISTIC CANONICAL SNAPSHOTS & CHECKSUM
  // ==========================================
  describe('Deterministic Canonical Snapshots & Checksums', () => {
    it('generates identical SHA-256 checksums regardless of track, clip, or slot input ordering', () => {
      const rawSnapshot1 = {
        name: 'Podcast Promo',
        category: 'podcast',
        aspectRatio: '9:16',
        resolution: '1080p',
        fps: 30,
        durationMs: 15000,
        tracks: [
          {
            id: 'trk-1',
            orderIndex: 0,
            name: 'Video Track',
            trackType: 'video',
            clips: [
              { id: 'clip-1', startTimeMs: 0, endTimeMs: 5000, name: 'Intro Video', clipType: 'video' },
              { id: 'clip-2', startTimeMs: 5000, endTimeMs: 15000, name: 'Main Video', clipType: 'video' },
            ],
          },
          {
            id: 'trk-2',
            orderIndex: 1,
            name: 'Audio Track',
            trackType: 'audio',
            clips: [
              { id: 'clip-3', startTimeMs: 0, endTimeMs: 15000, name: 'BGM', clipType: 'audio' },
            ],
          },
        ],
        slots: [
          { slotKey: 'slot_intro', label: 'Intro Video', type: 'video', targetClipId: 'clip-1', displayOrder: 0 },
          { slotKey: 'slot_main', label: 'Main Speaker', type: 'video', targetClipId: 'clip-2', displayOrder: 1 },
        ],
      };

      // Inverted tracks, inverted clips, and inverted slots
      const rawSnapshot2 = {
        name: 'Podcast Promo',
        category: 'podcast',
        aspectRatio: '9:16',
        resolution: '1080p',
        fps: 30,
        durationMs: 15000,
        tracks: [
          {
            id: 'trk-2',
            orderIndex: 1,
            name: 'Audio Track',
            trackType: 'audio',
            clips: [
              { id: 'clip-3', startTimeMs: 0, endTimeMs: 15000, name: 'BGM', clipType: 'audio' },
            ],
          },
          {
            id: 'trk-1',
            orderIndex: 0,
            name: 'Video Track',
            trackType: 'video',
            clips: [
              { id: 'clip-2', startTimeMs: 5000, endTimeMs: 15000, name: 'Main Video', clipType: 'video' },
              { id: 'clip-1', startTimeMs: 0, endTimeMs: 5000, name: 'Intro Video', clipType: 'video' },
            ],
          },
        ],
        slots: [
          { slotKey: 'slot_main', label: 'Main Speaker', type: 'video', targetClipId: 'clip-2', displayOrder: 1 },
          { slotKey: 'slot_intro', label: 'Intro Video', type: 'video', targetClipId: 'clip-1', displayOrder: 0 },
        ],
      };

      const snap1 = buildCanonicalTemplateSnapshot(rawSnapshot1);
      const snap2 = buildCanonicalTemplateSnapshot(rawSnapshot2);

      const hash1 = computeTemplateSnapshotChecksum(snap1);
      const hash2 = computeTemplateSnapshotChecksum(snap2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256
    });

    it('strictly strips transient editor state and presigned URLs from template snapshots', () => {
      const snap = buildCanonicalTemplateSnapshot({
        name: 'Clean Snapshot Test',
        aspectRatio: '16:9',
        tracks: [
          {
            name: 'Track',
            clips: [
              {
                id: 'c-1',
                name: 'Clip',
                startTimeMs: 0,
                endTimeMs: 4000,
                // Transient properties that must NEVER be persisted in templates:
                presignedUrl: 'https://r2.modify.dev/raw/secret/presigned-token-xyz',
                downloadUrl: 'https://r2.modify.dev/temp-download',
                previewUrl: 'https://r2.modify.dev/temp-preview',
                isSelected: true,
                isPlaying: true,
                currentTimeMs: 2500,
                zoomLevel: 100,
              } as any,
            ],
          },
        ],
      });

      const serialized = JSON.stringify(snap);
      expect(serialized).not.toContain('presignedUrl');
      expect(serialized).not.toContain('downloadUrl');
      expect(serialized).not.toContain('previewUrl');
      expect(serialized).not.toContain('presigned-token-xyz');
      expect(serialized).not.toContain('isSelected');
      expect(serialized).not.toContain('currentTimeMs');
      expect(serialized).not.toContain('zoomLevel');
    });

    it('validates snapshot schema rejecting malformed inputs', () => {
      // Empty name
      expect(validateTemplateSnapshot(buildCanonicalTemplateSnapshot({ name: '' })).isValid).toBe(false);

      // Invalid aspect ratio
      const badAspect = buildCanonicalTemplateSnapshot({ name: 'Valid Name', aspectRatio: '4:3' as any });
      expect(validateTemplateSnapshot(badAspect).isValid).toBe(false);

      // Duplicate slotKey validation
      const dupSlot = buildCanonicalTemplateSnapshot({
        name: 'Dup Slot Test',
        tracks: [{ name: 'Track', clips: [{ id: 'c1', startTimeMs: 0, endTimeMs: 1000 }] }],
        slots: [
          { slotKey: 'same_key', label: 'Slot A', type: 'video', targetClipId: 'c1' },
          { slotKey: 'same_key', label: 'Slot B', type: 'video', targetClipId: 'c1' },
        ],
      });
      const dupCheck = validateTemplateSnapshot(dupSlot);
      expect(dupCheck.isValid).toBe(false);
      expect(dupCheck.error).toContain('Duplicate slotKey detected');

      // Slot targetClipId not in tracks
      const badTarget = buildCanonicalTemplateSnapshot({
        name: 'Bad Target Test',
        tracks: [{ name: 'Track', clips: [{ id: 'c1', startTimeMs: 0, endTimeMs: 1000 }] }],
        slots: [
          { slotKey: 'slot_1', label: 'Slot A', type: 'video', targetClipId: 'non_existent_clip_id' },
        ],
      });
      const targetCheck = validateTemplateSnapshot(badTarget);
      expect(targetCheck.isValid).toBe(false);
      expect(targetCheck.error).toContain('does not exist in any timeline track');
    });
  });

  // ==========================================
  // 3. SERVICE-LEVEL CRUD & TRANSACTION BOUNDARIES
  // ==========================================
  describe('Template Lifecycle & Transactional Persistence', () => {
    it('creates a template with initial version and slots atomically', async () => {
      const created = await createTemplate(
        {
          name: 'Viral TikTok Hook Template',
          description: 'High-energy vertical template for product launches',
          category: 'social',
          aspectRatio: '9:16',
          resolution: '1080p',
          fps: 30,
          isPublic: false,
          tracks: [
            {
              id: 'track-v',
              name: 'Hook Video',
              trackType: 'video',
              orderIndex: 0,
              clips: [
                {
                  id: 'clip-hook',
                  name: 'Hook Footage',
                  clipType: 'video',
                  startTimeMs: 0,
                  endTimeMs: 3000,
                  slotBinding: 'slot_hook_video',
                },
              ],
            },
            {
              id: 'track-text',
              name: 'Captions Track',
              trackType: 'text',
              orderIndex: 1,
              clips: [
                {
                  id: 'clip-title',
                  name: 'Hook Title',
                  clipType: 'text',
                  startTimeMs: 0,
                  endTimeMs: 3000,
                  slotBinding: 'slot_hook_text',
                },
              ],
            },
          ],
          slots: [
            {
              slotKey: 'slot_hook_video',
              label: 'Background Hook Video',
              type: 'video',
              targetClipId: 'clip-hook',
              constraints: { isRequired: true, maxDurationMs: 3000 },
              displayOrder: 0,
            },
            {
              slotKey: 'slot_hook_text',
              label: 'Punchy Headline Text',
              type: 'text',
              targetClipId: 'clip-title',
              constraints: { isRequired: true, maxCharacters: 50 },
              displayOrder: 1,
            },
          ],
        },
        userA_Id
      );

      expect(created.template).toBeDefined();
      expect(created.template.id).toBeDefined();
      expect(created.template.name).toBe('Viral TikTok Hook Template');
      expect(created.template.userId).toBe(userA_Id);
      expect(created.template.aspectRatio).toBe('9:16');
      expect(created.template.currentVersionNumber).toBe(1);

      expect(created.version).toBeDefined();
      expect(created.version.versionNumber).toBe(1);
      expect(created.version.checksum).toHaveLength(64);
      expect(created.version.slots).toHaveLength(2);
      expect(created.version.slots[0].slotKey).toBe('slot_hook_video');
      expect(created.version.slots[1].slotKey).toBe('slot_hook_text');

      // Verify retrieval by ID
      const retrieved = await getTemplateById(created.template.id, userA_Id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.template.id);
      expect(retrieved?.latestVersion?.versionNumber).toBe(1);
      expect(retrieved?.latestVersion?.slots).toHaveLength(2);
    });

    it('rolls back completely if slot persistence or validation fails during template creation', async () => {
      if (!db) return;
      const initialTemplateCount = (await db.select().from(templates)).length;

      await expect(
        createTemplate(
          {
            name: 'Failing Transaction Template',
            tracks: [{ name: 'Track', clips: [{ id: 'c1', startTimeMs: 0, endTimeMs: 2000 }] }],
            slots: [
              // Target clip does not exist, triggering validation failure
              { slotKey: 'broken_slot', label: 'Bad Slot', type: 'video', targetClipId: 'missing_clip_id' },
            ],
          },
          userA_Id
        )
      ).rejects.toThrow(TemplateServiceError);

      const finalTemplateCount = (await db.select().from(templates)).length;
      expect(finalTemplateCount).toBe(initialTemplateCount); // No orphaned rows
    });

    it('creates immutable new versions under an existing template', async () => {
      // 1. Create base template
      const base = await createTemplate(
        {
          name: 'Corporate Reel',
          aspectRatio: '16:9',
          tracks: [
            {
              id: 't-1',
              name: 'Main Track',
              clips: [{ id: 'c-1', name: 'Intro', startTimeMs: 0, endTimeMs: 4000 }],
            },
          ],
          slots: [
            { slotKey: 'slot_intro', label: 'Intro Slot', type: 'video', targetClipId: 'c-1' },
          ],
        },
        userA_Id
      );

      expect(base.template.currentVersionNumber).toBe(1);

      // 2. Create version 2 with updated timing & new slot
      const v2 = await createTemplateVersion(
        base.template.id,
        {
          changelog: 'Extended duration and added logo slot',
          tracks: [
            {
              id: 't-1',
              name: 'Main Track',
              clips: [
                { id: 'c-1', name: 'Intro', startTimeMs: 0, endTimeMs: 6000 },
                { id: 'c-logo', name: 'Watermark Logo', startTimeMs: 0, endTimeMs: 6000, clipType: 'image' },
              ],
            },
          ],
          slots: [
            { slotKey: 'slot_intro', label: 'Intro Slot', type: 'video', targetClipId: 'c-1', displayOrder: 0 },
            { slotKey: 'slot_logo', label: 'Logo Slot', type: 'image', targetClipId: 'c-logo', displayOrder: 1 },
          ],
        },
        userA_Id
      );

      expect(v2.isDuplicate).toBe(false);
      expect(v2.version.versionNumber).toBe(2);
      expect(v2.version.slots).toHaveLength(2);
      expect(v2.template.currentVersionNumber).toBe(2);

      // Verify that version 1 remains frozen and unchanged
      const v1Fetch = await getTemplateVersionById(base.template.id, 1, userA_Id);
      expect(v1Fetch?.version.versionNumber).toBe(1);
      expect(v1Fetch?.version.slots).toHaveLength(1);
      expect(v1Fetch?.version.slots[0].slotKey).toBe('slot_intro');
    });

    it('prevents redundant duplicate versions when canonical snapshot is identical (idempotency)', async () => {
      // 1. Create base template
      const base = await createTemplate(
        {
          name: 'Idempotency Test Template',
          aspectRatio: '16:9',
          tracks: [
            {
              id: 't-idem',
              name: 'Track',
              clips: [{ id: 'c-idem', name: 'Clip', startTimeMs: 0, endTimeMs: 5000 }],
            },
          ],
          slots: [{ slotKey: 'slot_1', label: 'Slot', type: 'video', targetClipId: 'c-idem' }],
        },
        userA_Id
      );

      // 2. Attempt to create identical version
      const dupAttempt = await createTemplateVersion(
        base.template.id,
        {
          tracks: [
            {
              id: 't-idem',
              name: 'Track',
              clips: [{ id: 'c-idem', name: 'Clip', startTimeMs: 0, endTimeMs: 5000 }],
            },
          ],
          slots: [{ slotKey: 'slot_1', label: 'Slot', type: 'video', targetClipId: 'c-idem' }],
        },
        userA_Id
      );

      expect(dupAttempt.isDuplicate).toBe(true);
      expect(dupAttempt.version.versionNumber).toBe(1); // Did not bump version number
      expect(dupAttempt.version.checksum).toBe(base.version.checksum);
    });

    it('updates mutable template metadata without altering historical versions', async () => {
      const created = await createTemplate(
        {
          name: 'Original Title',
          description: 'Original Description',
          category: 'tutorial',
          aspectRatio: '16:9',
          tracks: [{ name: 'Track', clips: [{ id: 'c1', startTimeMs: 0, endTimeMs: 2000 }] }],
        },
        userA_Id
      );

      const updated = await updateTemplateMetadata(
        created.template.id,
        {
          name: 'Updated Title',
          description: 'Updated Description',
          isPublic: true,
        },
        userA_Id
      );

      expect(updated.name).toBe('Updated Title');
      expect(updated.description).toBe('Updated Description');
      expect(updated.isPublic).toBe(true);
      expect(updated.currentVersionNumber).toBe(1);

      // Historical version 1 snapshot still reflects original recipe
      const v1 = await getTemplateVersionById(created.template.id, 1, userA_Id);
      expect(v1?.version.versionNumber).toBe(1);
      expect((v1?.version.timelineSnapshot as any).name).toBe('Original Title');
    });

    it('soft-deletes template preserving historical versions and slots', async () => {
      const created = await createTemplate(
        {
          name: 'Template To Soft Delete',
          tracks: [{ name: 'Track', clips: [{ id: 'c1', startTimeMs: 0, endTimeMs: 2000 }] }],
        },
        userA_Id
      );

      const deleteRes = await archiveTemplate(created.template.id, userA_Id);
      expect(deleteRes.success).toBe(true);

      // Excluded from standard listing
      const list = await listTemplates(userA_Id);
      expect(list.some((t) => t.id === created.template.id)).toBe(false);

      // But historical database records still exist for audit/project reproducibility
      if (db) {
        const [archivedRow] = await db.select().from(templates).where(eq(templates.id, created.template.id));
        expect(archivedRow.isArchived).toBe(true);

        const versionRows = await db.select().from(templateVersions).where(eq(templateVersions.templateId, created.template.id));
        expect(versionRows.length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================
  // 4. DEEP MULTI-USER & IDOR SECURITY ISOLATION
  // ==========================================
  describe('Deep Multi-User & IDOR Security Isolation', () => {
    let templateUserA_Id: string;

    beforeEach(async () => {
      const created = await createTemplate(
        {
          name: "User A's Proprietary Marketing Recipe",
          isPublic: false, // Private to User A
          tracks: [
            {
              id: 'trkA',
              name: 'Secret Video',
              clips: [{ id: 'clipA', name: 'Secret Footage', startTimeMs: 0, endTimeMs: 4000 }],
            },
          ],
          slots: [
            { slotKey: 'slotA', label: 'Slot A', type: 'video', targetClipId: 'clipA' },
          ],
        },
        userA_Id
      );
      templateUserA_Id = created.template.id;
    });

    it('User B cannot read User A private template (IDOR prevention)', async () => {
      const accessAttempt = await getTemplateById(templateUserA_Id, userB_Id);
      expect(accessAttempt).toBeNull();
    });

    it('User B cannot create a version under User A template (IDOR prevention)', async () => {
      await expect(
        createTemplateVersion(
          templateUserA_Id,
          {
            tracks: [{ name: 'Injected Track', clips: [{ id: 'inj', startTimeMs: 0, endTimeMs: 1000 }] }],
          },
          userB_Id // User B attacking User A's template
        )
      ).rejects.toThrow(TemplateServiceError);
    });

    it('User B cannot modify User A template metadata (IDOR prevention)', async () => {
      await expect(
        updateTemplateMetadata(
          templateUserA_Id,
          { name: 'Hijacked by Bob' },
          userB_Id // User B attacking User A's template
        )
      ).rejects.toThrow(TemplateServiceError);
    });

    it('User B cannot delete User A template (IDOR prevention)', async () => {
      await expect(
        archiveTemplate(templateUserA_Id, userB_Id) // User B attacking User A's template
      ).rejects.toThrow(TemplateServiceError);
    });

    it('User B cannot read historical version under User A template (IDOR prevention)', async () => {
      const vAttempt = await getTemplateVersionById(templateUserA_Id, 1, userB_Id);
      expect(vAttempt).toBeNull();
    });

    it('allows public templates to be read by any authenticated user', async () => {
      const publicTpl = await createTemplate(
        {
          name: 'Public Community Template',
          isPublic: true,
          tracks: [{ name: 'Track', clips: [{ id: 'c1', startTimeMs: 0, endTimeMs: 2000 }] }],
        },
        userA_Id
      );

      // User B can view public template
      const userB_View = await getTemplateById(publicTpl.template.id, userB_Id);
      expect(userB_View).not.toBeNull();
      expect(userB_View?.id).toBe(publicTpl.template.id);
      expect(userB_View?.name).toBe('Public Community Template');

      // But User B STILL CANNOT mutate or delete it!
      await expect(
        updateTemplateMetadata(publicTpl.template.id, { name: 'Vandalized' }, userB_Id)
      ).rejects.toThrow(TemplateServiceError);

      await expect(
        archiveTemplate(publicTpl.template.id, userB_Id)
      ).rejects.toThrow(TemplateServiceError);
    });
  });

  // ==========================================
  // 5. SOURCE PROJECT -> TEMPLATE CONVERSION
  // ==========================================
  describe('Project-to-Template Conversion Engine', () => {
    it('converts an existing project and timeline into a reusable template with generated slots', async () => {
      if (!db) return;

      // 1. Create a project in the database
      const [proj] = await db
        .insert(projects)
        .values({
          userId: userA_Id,
          name: 'Source Client Video Project',
          description: 'Real client edit with 2 tracks',
          aspectRatio: '16:9',
          resolution: '1080p',
          fps: 30,
          durationMs: 8000,
        })
        .returning();

      const [tl] = await db
        .insert(timelines)
        .values({
          projectId: proj.id,
          durationMs: 8000,
          fps: 30,
        })
        .returning();

      const [trkV] = await db
        .insert(tracks)
        .values({
          timelineId: tl.id,
          index: 0,
          type: 'video',
          name: 'A-Roll Video',
        })
        .returning();

      const [trkA] = await db
        .insert(tracks)
        .values({
          timelineId: tl.id,
          index: 1,
          type: 'audio',
          name: 'Soundtrack',
        })
        .returning();

      await db.insert(clips).values([
        {
          trackId: trkV.id,
          name: 'Hero Footage.mp4',
          type: 'video',
          startMs: 0,
          endMs: 8000,
        },
        {
          trackId: trkA.id,
          name: 'Background Beat.mp3',
          type: 'audio',
          startMs: 0,
          endMs: 8000,
        },
      ]);

      // 2. Convert project to template
      const template = await createTemplateFromProject(proj.id, userA_Id, {
        templateName: 'Client Reusable Template',
        category: 'marketing',
      });

      expect(template.template.name).toBe('Client Reusable Template');
      expect(template.template.category).toBe('marketing');
      expect(template.template.aspectRatio).toBe('16:9');

      // Check generated slots
      expect(template.version.slots).toHaveLength(2);
      expect(template.version.slots[0].type).toBe('video');
      expect(template.version.slots[1].type).toBe('audio');
      expect(template.version.slots[0].slotKey).toContain('slot_');

      // Verify that clips in the template snapshot have slotBindings bound to these slots
      const snapClips = (template.version.timelineSnapshot as any).tracks[0].clips;
      expect(snapClips[0].slotBinding).toBe(template.version.slots[0].slotKey);
      // Project-specific media IDs are detached
      expect(snapClips[0].mediaAssetId).toBeNull();
    });

    it('rejects project-to-template conversion if project belongs to another user (IDOR prevention)', async () => {
      if (!db) return;

      const [projB] = await db
        .insert(projects)
        .values({
          userId: userB_Id, // Owned by Bob
          name: "Bob's Confidential Project",
          aspectRatio: '16:9',
        })
        .returning();

      // Alice attempts to extract a template from Bob's project
      await expect(
        createTemplateFromProject(projB.id, userA_Id)
      ).rejects.toThrow(TemplateServiceError);
    });
  });
});
