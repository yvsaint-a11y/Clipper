import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

const userA_Id = '11111111-1111-1111-1111-111111111111';
const userA_Email = 'alice.creator@clipper.dev';
const userB_Id = '22222222-2222-2222-2222-222222222222';
const userB_Email = 'bob.intruder@clipper.dev';

// Mock auth middleware for route testing
vi.mock('../server/db/auth', () => {
  return {
    requireAuth: (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Unauthorized: Missing or invalid Authorization header. Expected Bearer token.',
        });
        return;
      }
      const token = authHeader.split(' ')[1];
      if (token === 'alice-valid-token') {
        req.userId = userA_Id;
        req.user = { id: userA_Id, email: userA_Email };
        next();
      } else if (token === 'bob-valid-token') {
        req.userId = userB_Id;
        req.user = { id: userB_Id, email: userB_Email };
        next();
      } else {
        res.status(401).json({ error: 'Unauthorized: Invalid authentication token.' });
      }
    },
    getSupabaseAdmin: () => null,
  };
});

// In-memory mock DB store for render jobs and projects
const mockProjectsTable: any[] = [
  {
    id: 'proj-alice-1',
    userId: userA_Id,
    name: 'Alice Epic Short',
    aspectRatio: '9:16',
    resolution: '1080p',
    fps: 30,
    durationMs: 15000,
    isArchived: false,
  },
  {
    id: 'proj-bob-1',
    userId: userB_Id,
    name: 'Bob Secret Reel',
    aspectRatio: '16:9',
    resolution: '1080p',
    fps: 30,
    durationMs: 20000,
    isArchived: false,
  },
];

import { getTableName } from 'drizzle-orm';

let mockCurrentProject: any = mockProjectsTable[0];
const mockRenderJobsTable: any[] = [];

vi.mock('../server/db', () => {
  return {
    getDb: () => ({
      select: () => ({
        from: (table: any) => {
          const tableName = getTableName(table);
          const execute = (limitNum?: number) => {
            if (tableName === 'projects') {
              return mockCurrentProject ? [mockCurrentProject] : [];
            }
            if (limitNum !== undefined) {
              return mockRenderJobsTable.slice(0, limitNum);
            }
            return [...mockRenderJobsTable];
          };

          let limitCount: number | undefined = undefined;
          const chain: any = {
            where: () => chain,
            orderBy: () => chain,
            limit: (n: number) => {
              limitCount = n;
              return chain;
            },
            then: (resolve: any) => {
              return Promise.resolve(execute(limitCount)).then(resolve);
            },
          };

          return chain;
        },
      }),
      insert: (table: any) => ({
        values: (vals: any) => {
          const inserted = {
            id: vals.id || `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            ...vals,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          mockRenderJobsTable.push(inserted);
          return {
            returning: () => [inserted],
          };
        },
      }),
      update: (table: any) => ({
        set: (updates: any) => ({
          where: () => ({
            returning: () => {
              if (mockRenderJobsTable.length > 0) {
                Object.assign(mockRenderJobsTable[0], updates);
                return [mockRenderJobsTable[0]];
              }
              return [];
            },
          }),
        }),
      }),
    }),
  };
});

import request from 'supertest';
import { createExpressApp } from '../server/app';
import {
  buildCanonicalRenderSpec,
  computeRenderSpecHash,
  computeRenderSpecHashSync,
  canonicalizeJson,
  validateExportResolution,
  validateExportFps,
  validateCanonicalRenderSpec,
} from '../src/features/editor/utils/renderSpec';

describe('Phase 10A: Video Export Specification, UI & Render Job API', () => {
  const sampleProject = {
    id: 'proj-test-10a',
    name: 'Cinematic Reel',
    aspectRatio: '9:16',
    resolution: '1080p',
    fps: 30,
    durationMs: 12000,
    version: 1,
  };

  const sampleTimeline = {
    totalDurationMs: 12000,
    tracks: [
      {
        id: 'track-v1',
        name: 'Video Main',
        trackType: 'video',
        orderIndex: 0,
        isMuted: false,
        volume: 1,
        clips: [
          {
            id: 'clip-1',
            name: 'Intro Clip',
            clipType: 'video',
            startTimeMs: 0,
            endTimeMs: 6000,
            sourceStartMs: 1000,
            sourceEndMs: 7000,
            mediaAssetId: 'asset-video-1',
            transform: {
              positionX: 0,
              positionY: 0,
              scale: 1,
              rotation: 0,
              opacity: 1,
            },
            crop: { top: 0, right: 0, bottom: 0, left: 0 },
            audioProperties: {
              volume: 0.8,
              muted: false,
              fadeInMs: 200,
              fadeOutMs: 300,
            },
          },
          {
            id: 'clip-2',
            name: 'Action B-roll',
            clipType: 'video',
            startTimeMs: 6000,
            endTimeMs: 12000,
            sourceStartMs: 0,
            sourceEndMs: 6000,
            mediaAssetId: 'asset-video-2',
            transform: {
              positionX: 10,
              positionY: -5,
              scale: 1.1,
              rotation: 0,
              opacity: 0.95,
            },
          },
        ],
      },
      {
        id: 'track-text-1',
        name: 'Overlay Titles',
        trackType: 'text',
        orderIndex: 1,
        isMuted: false,
        volume: 1,
        clips: [
          {
            id: 'clip-text-1',
            name: 'Hook Title',
            clipType: 'text',
            startTimeMs: 500,
            endTimeMs: 4500,
            textProperties: {
              text: 'SCALING TO 10M IN 2026',
              fontSize: 54,
              fontFamily: 'Montserrat',
              fontWeight: '900',
              color: '#FFDD00',
              positionX: 0,
              positionY: -200,
            },
          },
        ],
      },
    ],
    transitions: [
      {
        id: 'trans-1',
        trackId: 'track-v1',
        fromClipId: 'clip-1',
        toClipId: 'clip-2',
        type: 'fade',
        durationMs: 500,
      },
    ],
  };

  const sampleMediaAssets = [
    {
      id: 'asset-video-1',
      updatedAt: '2026-10-17T09:00:00.000Z',
      originalFilename: 'hero_shot.mp4',
    },
    {
      id: 'asset-video-2',
      updatedAt: '2026-10-17T09:15:00.000Z',
      originalFilename: 'drone_cut.mp4',
    },
  ];

  describe('1. Resolution & Frame Rate Validation', () => {
    it('accepts valid 720p and 1080p resolutions', () => {
      expect(validateExportResolution('720p')).toBe(true);
      expect(validateExportResolution('1080p')).toBe(true);
    });

    it('strictly rejects 4K and unsupported resolutions', () => {
      expect(validateExportResolution('4k')).toBe(false);
      expect(validateExportResolution('4K')).toBe(false);
      expect(validateExportResolution('2160p')).toBe(false);
      expect(validateExportResolution('480p')).toBe(false);
      expect(validateExportResolution(null)).toBe(false);
      expect(validateExportResolution(undefined)).toBe(false);
    });

    it('accepts valid 30 and 60 FPS options', () => {
      expect(validateExportFps(30)).toBe(true);
      expect(validateExportFps(60)).toBe(true);
    });

    it('strictly rejects unsupported frame rates', () => {
      expect(validateExportFps(24)).toBe(false);
      expect(validateExportFps(120)).toBe(false);
      expect(validateExportFps(0)).toBe(false);
      expect(validateExportFps('30' as any)).toBe(false);
    });
  });

  describe('2. Canonical Render Spec Construction', () => {
    it('constructs complete specification preserving timeline properties and millisecond precision', () => {
      const spec = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: sampleTimeline,
        mediaAssets: sampleMediaAssets,
        exportOptions: {
          resolution: '1080p',
          fps: 30,
          watermark: false,
        },
      });

      expect(spec.projectId).toBe('proj-test-10a');
      expect(spec.renderSettings.resolution).toBe('1080p');
      expect(spec.renderSettings.fps).toBe(30);
      expect(spec.renderSettings.watermark).toBe(false);
      expect(spec.durationMs).toBe(12000);
      expect(spec.aspectRatio).toBe('9:16');
      expect(spec.tracks).toHaveLength(2);
      expect(spec.transitions).toHaveLength(1);
      expect(spec.sourceAssetSignatures).toEqual([
        { assetId: 'asset-video-1', updatedAt: '2026-10-17T09:00:00.000Z' },
        { assetId: 'asset-video-2', updatedAt: '2026-10-17T09:15:00.000Z' },
      ]);
    });

    it('throws error when resolution exceeds V1 bounds (e.g. 4k)', () => {
      expect(() => {
        buildCanonicalRenderSpec({
          project: sampleProject,
          timeline: sampleTimeline,
          exportOptions: {
            resolution: '4k' as any,
          },
        });
      }).toThrow(/Unsupported export resolution/);
    });

    it('throws error when frame rate is invalid', () => {
      expect(() => {
        buildCanonicalRenderSpec({
          project: sampleProject,
          timeline: sampleTimeline,
          exportOptions: {
            fps: 24 as any,
          },
        });
      }).toThrow(/Unsupported frame rate/);
    });
  });

  describe('3. Deterministic Idempotency Hashing', () => {
    it('produces identical 64-character SHA-256 hashes for identical specifications', async () => {
      const specA = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: sampleTimeline,
        mediaAssets: sampleMediaAssets,
        exportOptions: { resolution: '1080p', fps: 30 },
      });

      const specB = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: sampleTimeline,
        mediaAssets: sampleMediaAssets,
        exportOptions: { resolution: '1080p', fps: 30 },
      });

      const hashA = await computeRenderSpecHash(specA);
      const hashB = await computeRenderSpecHash(specB);
      const hashSyncA = computeRenderSpecHashSync(specA);

      expect(hashA).toMatch(/^[a-f0-9]{64}$/);
      expect(hashA).toBe(hashB);
      expect(hashSyncA).toBe(hashA);
    });

    it('is stable regardless of object key order (canonical serialization)', () => {
      const obj1 = { z: 10, a: { beta: 2, alpha: 1 }, list: [1, 2] };
      const obj2 = { a: { alpha: 1, beta: 2 }, z: 10, list: [1, 2] };

      expect(canonicalizeJson(obj1)).toBe(canonicalizeJson(obj2));
      expect(computeRenderSpecHashSync(obj1)).toBe(computeRenderSpecHashSync(obj2));
    });

    it('produces a different hash when output-affecting clip timing changes', () => {
      const spec1 = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: sampleTimeline,
        exportOptions: { resolution: '1080p', fps: 30 },
      });

      const alteredTimeline = JSON.parse(JSON.stringify(sampleTimeline));
      alteredTimeline.tracks[0].clips[0].endTimeMs = 7500; // changed timing

      const spec2 = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: alteredTimeline,
        exportOptions: { resolution: '1080p', fps: 30 },
      });

      expect(computeRenderSpecHashSync(spec1)).not.toBe(computeRenderSpecHashSync(spec2));
    });

    it('produces a different hash when transform or crop changes', () => {
      const spec1 = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: sampleTimeline,
        exportOptions: { resolution: '1080p', fps: 30 },
      });

      const alteredTimeline = JSON.parse(JSON.stringify(sampleTimeline));
      alteredTimeline.tracks[0].clips[0].transform.scale = 1.35; // changed scale

      const spec2 = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: alteredTimeline,
        exportOptions: { resolution: '1080p', fps: 30 },
      });

      expect(computeRenderSpecHashSync(spec1)).not.toBe(computeRenderSpecHashSync(spec2));
    });

    it('produces a different hash when export resolution changes (720p vs 1080p)', () => {
      const spec1080 = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: sampleTimeline,
        exportOptions: { resolution: '1080p', fps: 30 },
      });

      const spec720 = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: sampleTimeline,
        exportOptions: { resolution: '720p', fps: 30 },
      });

      expect(computeRenderSpecHashSync(spec1080)).not.toBe(computeRenderSpecHashSync(spec720));
    });
  });

  describe('4. Specification Validation Helper', () => {
    it('validates a correct spec successfully', () => {
      const spec = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: sampleTimeline,
        exportOptions: { resolution: '1080p', fps: 30 },
      });

      const result = validateCanonicalRenderSpec(spec);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('flags missing or malformed fields in specification', () => {
      const badSpec = {
        projectId: '',
        renderSettings: { resolution: '4k', fps: 24 },
        durationMs: -500,
        tracks: 'not-an-array',
      };

      const result = validateCanonicalRenderSpec(badSpec);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('5. Export API Endpoints & Authorization', () => {
    const app = createExpressApp();

    it('rejects unauthenticated POST /api/projects/:id/export with 401', async () => {
      const res = await request(app)
        .post('/api/projects/proj-alice-1/export')
        .send({ resolution: '1080p', fps: 30 });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/);
    });

    it('rejects export with unsupported 4K resolution with 400', async () => {
      const res = await request(app)
        .post('/api/projects/proj-alice-1/export')
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          resolution: '4k',
          fps: 30,
          renderSpec: buildCanonicalRenderSpec({
            project: sampleProject,
            timeline: sampleTimeline,
          }),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('4K is not supported');
    });

    it('rejects export with unsupported FPS with 400', async () => {
      const res = await request(app)
        .post('/api/projects/proj-alice-1/export')
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          resolution: '1080p',
          fps: 24,
          renderSpec: buildCanonicalRenderSpec({
            project: sampleProject,
            timeline: sampleTimeline,
          }),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid frame rate');
    });

    it('rejects export for non-existent or cross-user project with 404 (IDOR guard)', async () => {
      mockCurrentProject = null;
      // Bob tries to export Alice's project
      const res = await request(app)
        .post('/api/projects/proj-alice-nonexistent/export')
        .set('Authorization', 'Bearer bob-valid-token')
        .send({
          resolution: '1080p',
          fps: 30,
          renderSpec: buildCanonicalRenderSpec({
            project: { id: 'proj-alice-nonexistent', name: 'Other' },
            timeline: sampleTimeline,
          }),
        });

      mockCurrentProject = mockProjectsTable[0];
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Project not found or access denied/);
    });

    it('rejects unauthenticated GET /api/renders/:jobId with 401', async () => {
      const res = await request(app).get('/api/renders/job-12345');
      expect(res.status).toBe(401);
    });

    it('successfully queues a new render job with 201 and status queued', async () => {
      mockCurrentProject = mockProjectsTable[0];
      const validSpec = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: sampleTimeline,
        exportOptions: { resolution: '1080p', fps: 30 },
      });

      const res = await request(app)
        .post('/api/projects/proj-alice-1/export')
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          resolution: '1080p',
          fps: 30,
          watermark: false,
          renderSpec: validSpec,
        });

      expect(res.status).toBe(201);
      expect(res.body.isExisting).toBe(false);
      expect(res.body.job).toBeDefined();
      expect(res.body.job.status).toBe('queued');
      expect(res.body.job.resolution).toBe('1080p');
      expect(res.body.job.fps).toBe(30);
      expect(res.body.job.progressPercentage).toBe(0);
      expect(res.body.job.idempotencyKey).toBeDefined();
    });

    it('returns existing job with 200 when identical render request is submitted (idempotency)', async () => {
      mockCurrentProject = mockProjectsTable[0];
      const validSpec = buildCanonicalRenderSpec({
        project: sampleProject,
        timeline: sampleTimeline,
        exportOptions: { resolution: '1080p', fps: 30 },
      });

      const res = await request(app)
        .post('/api/projects/proj-alice-1/export')
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          resolution: '1080p',
          fps: 30,
          watermark: false,
          renderSpec: validSpec,
        });

      expect(res.status).toBe(200);
      expect(res.body.isExisting).toBe(true);
      expect(res.body.job).toBeDefined();
      expect(res.body.message).toContain('Existing render job retrieved');
    });

    it('retrieves render job status by ID for authorized owner', async () => {
      const jobId = mockRenderJobsTable[0]?.id;
      expect(jobId).toBeDefined();

      const res = await request(app)
        .get(`/api/renders/${jobId}`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.job).toBeDefined();
      expect(res.body.job.id).toBe(jobId);
      expect(res.body.job.status).toBe('queued');
    });

    it('retrieves project render history via GET /api/projects/:id/renders', async () => {
      mockCurrentProject = mockProjectsTable[0];
      const res = await request(app)
        .get('/api/projects/proj-alice-1/renders')
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.renders).toBeDefined();
      expect(Array.isArray(res.body.renders)).toBe(true);
      expect(res.body.renders.length).toBeGreaterThan(0);
    });
  });
});
