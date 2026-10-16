import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Response, type NextFunction } from 'express';
import request from 'supertest';
import { getDb } from '../server/db';
import { users } from '../server/db/schema/users';
import { templates, templateVersions, templateSlots } from '../server/db/schema/templates';
import { eq, and } from 'drizzle-orm';
import {
  createTemplate,
  listTemplates,
  getTemplateById,
  archiveTemplate,
  TemplateServiceError,
} from '../server/services/templateService';
import type { AuthenticatedRequest } from '../server/db/auth';

describe('Phase 7C: Template Library, Inspection, Filtering & Archiving', () => {
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

    // Mount templates routes matching production
    testApp.get('/api/templates', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const userId = req.userId!;
        const includePublic = req.query.includePublic === 'true';
        const userTemplates = await listTemplates(userId, { includePublic });
        res.json({ templates: userTemplates });
      } catch (err: unknown) {
        if (err instanceof TemplateServiceError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: 'Failed to list templates.' });
      }
    });

    testApp.get('/api/templates/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const userId = req.userId!;
        const { id } = req.params;
        const templateData = await getTemplateById(id, userId);
        if (!templateData) {
          res.status(404).json({ error: 'Template not found or access denied.' });
          return;
        }
        res.json({ template: templateData });
      } catch (err: unknown) {
        if (err instanceof TemplateServiceError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: 'Failed to fetch template.' });
      }
    });

    testApp.delete('/api/templates/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const userId = req.userId!;
        const { id } = req.params;
        const result = await archiveTemplate(id, userId);
        res.json(result);
      } catch (err: unknown) {
        if (err instanceof TemplateServiceError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: 'Failed to archive template.' });
      }
    });

    return testApp;
  };

  const app = createMockAuthApp();

  beforeEach(async () => {
    if (!db) return;
    // Ensure test users exist in database
    await db
      .insert(users)
      .values([
        {
          id: userA_Id,
          email: userA_Email,
          displayName: 'Alice Creator',
          subscriptionTier: 'pro',
        },
        {
          id: userB_Id,
          email: userB_Email,
          displayName: 'Bob Editor',
          subscriptionTier: 'free',
        },
      ])
      .onConflictDoNothing();
  });

  describe('1. Template Library Listing & Metadata Optimization', () => {
    it('returns lightweight template cards with slot count, duration, resolution, fps and version', async () => {
      // Create a template with 2 slots owned by Alice
      const created = await createTemplate(
        {
          name: 'TikTok Viral Hook Recipe',
          description: 'High energy 9:16 layout with intro video slot and punchy title text',
          category: 'social',
          aspectRatio: '9:16',
          resolution: '1080p',
          fps: 30,
          durationMs: 15000,
          isPublic: false,
          tracks: [
            {
              id: 't-1',
              name: 'Video 1',
              type: 'video',
              displayOrder: 0,
              clips: [
                { id: 'clip-1', startTimeMs: 0, endTimeMs: 5000, name: 'Hook Video', clipType: 'video' },
                { id: 'clip-2', startTimeMs: 5000, endTimeMs: 15000, name: 'Headline Text', clipType: 'text' },
              ],
            },
          ],
          slots: [
            {
              slotKey: 'slot-hook-video',
              label: 'Hook Video Footage',
              type: 'video',
              targetClipId: 'clip-1',
              description: 'Place 3-second hook video clip',
              constraints: { isRequired: true },
              displayOrder: 0,
            },
            {
              slotKey: 'slot-title-text',
              label: 'Main Headline',
              type: 'text',
              targetClipId: 'clip-2',
              description: 'Bold caption text',
              constraints: { isRequired: true },
              displayOrder: 1,
            },
          ],
        },
        userA_Id
      );

      const res = await request(app)
        .get('/api/templates')
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.templates)).toBe(true);

      const target = res.body.templates.find((t: any) => t.id === created.template.id);
      expect(target).toBeDefined();
      expect(target.name).toBe('TikTok Viral Hook Recipe');
      expect(target.aspectRatio).toBe('9:16');
      expect(target.category).toBe('social');
      expect(target.durationMs).toBe(15000);
      expect(target.resolution).toBe('1080p');
      expect(target.fps).toBe(30);
      expect(target.slotCount).toBe(2);
      expect(target.latestVersionNumber).toBe(1);

      // Lightweight discipline: list view does NOT bundle heavy clip trees
      expect(target.tracks).toBeUndefined();
    });

    it('requires valid authentication header to list templates', async () => {
      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });
  });

  describe('2. Template Search & Client-Side Filtering Logic', () => {
    it('correctly filters templates by category, aspect ratio, search term and ownership', async () => {
      // Alice creates 2 templates:
      // 1) marketing 16:9
      // 2) podcast 1:1
      const tmpl1 = await createTemplate(
        {
          name: 'SaaS Product Walkthrough',
          description: 'Clean widescreen tutorial for software product launch',
          category: 'marketing',
          aspectRatio: '16:9',
          resolution: '1080p',
          durationMs: 30000,
          isPublic: false,
        },
        userA_Id
      );

      const tmpl2 = await createTemplate(
        {
          name: 'Square Podcast Soundbite',
          description: 'Waveform audio snippet for Instagram feed',
          category: 'podcast',
          aspectRatio: '1:1',
          resolution: '1080p',
          durationMs: 60000,
          isPublic: true,
        },
        userA_Id
      );

      // Alice fetches templates
      const res = await request(app)
        .get('/api/templates?includePublic=true')
        .set('Authorization', 'Bearer alice-valid-token');

      const all = res.body.templates;

      // Filter by category: marketing
      const marketingOnly = all.filter((t: any) => t.category === 'marketing');
      expect(marketingOnly.some((t: any) => t.id === tmpl1.template.id)).toBe(true);
      expect(marketingOnly.every((t: any) => t.category === 'marketing')).toBe(true);

      // Filter by aspect ratio: 1:1
      const squareOnly = all.filter((t: any) => t.aspectRatio === '1:1');
      expect(squareOnly.some((t: any) => t.id === tmpl2.template.id)).toBe(true);
      expect(squareOnly.every((t: any) => t.aspectRatio === '1:1')).toBe(true);

      // Search match by term "soundbite"
      const searchMatch = all.filter((t: any) =>
        t.name.toLowerCase().includes('soundbite') ||
        (t.description && t.description.toLowerCase().includes('soundbite'))
      );
      expect(searchMatch.length).toBeGreaterThanOrEqual(1);
      expect(searchMatch[0].id).toBe(tmpl2.template.id);
    });
  });

  describe('3. Template Detail & Slot Metadata Inspection', () => {
    it('eagerly returns full immutable version info, slots with type and constraints, and sha256 checksum', async () => {
      const created = await createTemplate(
        {
          name: 'Corporate Keynote Opener',
          description: 'Executive intro template with brand logo and background audio slot',
          category: 'corporate',
          aspectRatio: '16:9',
          resolution: '1080p',
          fps: 60,
          durationMs: 12000,
          isPublic: false,
          changelog: 'Initial version 1 production release',
          tracks: [
            {
              id: 'trk-video',
              name: 'Background Track',
              type: 'video',
              displayOrder: 0,
              clips: [
                { id: 'clip-bg', startTimeMs: 0, endTimeMs: 12000, name: 'Background Video', clipType: 'video' },
                { id: 'clip-logo', startTimeMs: 0, endTimeMs: 12000, name: 'Logo Clip', clipType: 'logo' },
              ],
            },
            {
              id: 'trk-audio',
              name: 'Audio Track',
              type: 'audio',
              displayOrder: 1,
              clips: [
                { id: 'clip-audio', startTimeMs: 0, endTimeMs: 12000, name: 'Theme Audio', clipType: 'audio' },
              ],
            },
          ],
          slots: [
            {
              slotKey: 'slot-bg-video',
              label: 'Background Video Loop',
              type: 'video',
              targetClipId: 'clip-bg',
              description: 'Cinematic ambient background',
              constraints: { isRequired: true },
              displayOrder: 0,
            },
            {
              slotKey: 'slot-logo',
              label: 'Company Logo SVG',
              type: 'logo',
              targetClipId: 'clip-logo',
              description: 'Transparent SVG or PNG brand badge',
              constraints: { isRequired: false },
              displayOrder: 1,
            },
            {
              slotKey: 'slot-audio',
              label: 'Theme Track',
              type: 'audio',
              targetClipId: 'clip-audio',
              description: 'Upbeat electronic corporate anthem',
              constraints: { isRequired: false },
              displayOrder: 2,
            },
          ],
        },
        userA_Id
      );

      const res = await request(app)
        .get(`/api/templates/${created.template.id}`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      const data = res.body.template;

      expect(data.name).toBe('Corporate Keynote Opener');
      expect(data.category).toBe('corporate');
      expect(data.aspectRatio).toBe('16:9');
      expect(data.fps).toBe(60);
      expect(data.slotCount).toBe(3);

      // Version details
      expect(data.latestVersion).toBeDefined();
      expect(data.latestVersion.versionNumber).toBe(1);
      expect(data.latestVersion.changelog).toBe('Initial version 1 production release');
      expect(data.latestVersion.checksum).toBeDefined();
      expect(typeof data.latestVersion.checksum).toBe('string');
      expect(data.latestVersion.checksum.length).toBe(64); // SHA-256 hex string

      // Slot details
      const slots = data.latestVersion.slots;
      expect(slots).toHaveLength(3);

      const logoSlot = slots.find((s: any) => s.slotKey === 'slot-logo');
      expect(logoSlot).toBeDefined();
      expect(logoSlot.type).toBe('logo');
      expect(logoSlot.constraints.isRequired).toBe(false);

      const bgSlot = slots.find((s: any) => s.slotKey === 'slot-bg-video');
      expect(bgSlot).toBeDefined();
      expect(bgSlot.type).toBe('video');
      expect(bgSlot.constraints.isRequired).toBe(true);
    });
  });

  describe('4. Owner vs Community Permissions & Access Control', () => {
    it('allows Bob to view public community templates created by Alice', async () => {
      // Alice creates a public community template
      const publicTmpl = await createTemplate(
        {
          name: 'Community Open Vlog Template',
          description: 'Free to use by anyone in the platform community',
          category: 'vlog',
          aspectRatio: '16:9',
          isPublic: true,
        },
        userA_Id
      );

      // Bob accesses it
      const res = await request(app)
        .get(`/api/templates/${publicTmpl.template.id}`)
        .set('Authorization', 'Bearer bob-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.template.name).toBe('Community Open Vlog Template');
      expect(res.body.template.isPublic).toBe(true);
      expect(res.body.template.userId).toBe(userA_Id); // Bob is not owner, but can view
    });

    it('denies Bob access to Alice’s private template', async () => {
      // Alice creates a strictly private template
      const privateTmpl = await createTemplate(
        {
          name: 'Confidential Internal Video',
          description: 'Internal corporate communications recipe',
          category: 'corporate',
          isPublic: false,
        },
        userA_Id
      );

      // Bob tries to access Alice's private template
      const res = await request(app)
        .get(`/api/templates/${privateTmpl.template.id}`)
        .set('Authorization', 'Bearer bob-valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Template not found or access denied.');
    });

    it('denies Bob from archiving or deleting Alice’s template', async () => {
      const aliceTmpl = await createTemplate(
        {
          name: 'Alice Protected Recipe',
          category: 'marketing',
          isPublic: true, // even if public, Bob cannot delete/archive it!
        },
        userA_Id
      );

      const res = await request(app)
        .delete(`/api/templates/${aliceTmpl.template.id}`)
        .set('Authorization', 'Bearer bob-valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Template not found or access denied.');
    });
  });

  describe('5. Soft Archive Workflow & Version Immutability Preservation', () => {
    it('soft-archives the template header, removing it from active library listings while preserving versions', async () => {
      const templateToArchive = await createTemplate(
        {
          name: 'Deprecated Old Campaign Template',
          description: 'To be archived but historical version must remain intact',
          category: 'marketing',
          aspectRatio: '16:9',
          isPublic: false,
        },
        userA_Id
      );

      const templateId = templateToArchive.template.id;

      // Alice archives the template
      const delRes = await request(app)
        .delete(`/api/templates/${templateId}`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify template no longer appears in GET /api/templates
      const listRes = await request(app)
        .get('/api/templates')
        .set('Authorization', 'Bearer alice-valid-token');

      const found = listRes.body.templates.find((t: any) => t.id === templateId);
      expect(found).toBeUndefined();

      // Verify database record has is_archived = true
      if (db) {
        const [dbRecord] = await db
          .select()
          .from(templates)
          .where(eq(templates.id, templateId));

        expect(dbRecord).toBeDefined();
        expect(dbRecord.isArchived).toBe(true);

        // Verify immutable template_versions still exist in database
        const versions = await db
          .select()
          .from(templateVersions)
          .where(eq(templateVersions.templateId, templateId));

        expect(versions.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
