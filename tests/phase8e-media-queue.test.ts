import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { inArray } from 'drizzle-orm';
import request from 'supertest';
import { createExpressApp } from '../server/app';
import { getDb } from '../server/db';
import { users } from '../server/db/schema/users';
import { mediaAssets } from '../server/db/schema/media';
import {
  maskRedisUrl,
  isRedisConfigured,
  getBullMQRedisOptions,
  RedisConfigError,
} from '../server/queue/redis';
import {
  buildMediaJobId,
  isValidMediaOperation,
  VALID_MEDIA_OPERATIONS,
  DEFAULT_RETRY_CONFIG,
  type MediaJobData,
  type MediaJobResult,
} from '../server/queue/mediaQueue';
import * as mediaQueueModule from '../server/queue/mediaQueue';
import {
  processMediaJob,
  isPermanentError,
  PermanentJobError,
  createMediaWorker,
} from '../server/workers/mediaWorker';
import * as mediaProbeServiceModule from '../server/services/mediaProbeService';
import * as mediaProxyServiceModule from '../server/services/mediaProxyService';
import * as mediaThumbnailServiceModule from '../server/services/mediaThumbnailService';
import * as mediaWaveformServiceModule from '../server/services/mediaWaveformService';

const userA_Id = '11111111-1111-1111-1111-111111111111';
const userA_Email = 'alice.creator@clipper.dev';

const userB_Id = '22222222-2222-2222-2222-222222222222';
const userB_Email = 'bob.intruder@clipper.dev';

// Mock authentication
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

// Mock Redis connection validation module for queue API tests
vi.mock('../server/queue/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/queue/redis')>();
  return {
    ...actual,
    isRedisConfigured: vi.fn(() => true),
    getRedisConnection: vi.fn(() => ({})),
    closeRedisConnection: vi.fn(async () => {}),
  };
});

describe('Phase 8E: Background Media Processing Foundation (Redis + BullMQ)', () => {
  const db = getDb();
  const app = createExpressApp();

  beforeEach(async () => {
    if (!db) return;

    // Seed test users
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
          displayName: 'Bob Intruder',
          subscriptionTier: 'free',
        },
      ])
      .onConflictDoNothing();

    // Clean up test media assets to guarantee clean state
    await db.delete(mediaAssets).where(inArray(mediaAssets.userId, [userA_Id, userB_Id]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Redis Configuration & Security', () => {
    it('masks plaintext credentials in redis:// URLs', () => {
      const sensitiveUrl = 'redis://:superSecretPassword123@redis-cluster.internal:6379/0';
      const masked = maskRedisUrl(sensitiveUrl);
      expect(masked).not.toContain('superSecretPassword123');
      expect(masked).toBe('redis://:***@redis-cluster.internal:6379/0');
    });

    it('masks both username and password in rediss:// TLS URLs', () => {
      const sensitiveUrl = 'rediss://customUser:authP@ssword@upstash-redis.com:6380/2';
      const masked = maskRedisUrl(sensitiveUrl);
      expect(masked).not.toContain('authP@ssword');
      expect(masked).not.toContain('customUser');
      expect(masked).toContain('***');
    });

    it('handles empty or invalid Redis URLs gracefully without leaking secrets', () => {
      expect(maskRedisUrl('')).toBe('[not-configured]');
      expect(maskRedisUrl(null as unknown as string)).toBe('[not-configured]');
    });

    it('validates BullMQ-required Redis options: maxRetriesPerRequest=null', () => {
      const options = getBullMQRedisOptions('redis://localhost:6379');
      expect(options.maxRetriesPerRequest).toBeNull();
      expect(options.enableReadyCheck).toBe(false);
      expect(options.lazyConnect).toBe(true);
    });

    it('throws clear RedisConfigError when Redis URL is invalid or malformed', () => {
      expect(() => getBullMQRedisOptions('http://invalid-scheme:6379')).toThrow(RedisConfigError);
      expect(() => getBullMQRedisOptions('')).toThrow(/Redis URL is invalid or not configured/);
    });
  });

  describe('2. Queue Definitions, Job IDs & Retry Configuration', () => {
    it('validates supported media operations', () => {
      expect(VALID_MEDIA_OPERATIONS).toEqual(['probe', 'proxy', 'thumbnail', 'waveform']);
      expect(isValidMediaOperation('probe')).toBe(true);
      expect(isValidMediaOperation('proxy')).toBe(true);
      expect(isValidMediaOperation('thumbnail')).toBe(true);
      expect(isValidMediaOperation('waveform')).toBe(true);
      expect(isValidMediaOperation('render')).toBe(false);
      expect(isValidMediaOperation('export')).toBe(false);
      expect(isValidMediaOperation(null)).toBe(false);
    });

    it('constructs deterministic BullMQ job IDs: media:{assetId}:{operation}', () => {
      const assetId = '99999999-9999-9999-9999-999999999991';
      expect(buildMediaJobId(assetId, 'probe')).toBe(`media:${assetId}:probe`);
      expect(buildMediaJobId(assetId, 'proxy')).toBe(`media:${assetId}:proxy`);
      expect(buildMediaJobId(assetId, 'thumbnail')).toBe(`media:${assetId}:thumbnail`);
      expect(buildMediaJobId(assetId, 'waveform')).toBe(`media:${assetId}:waveform`);
    });

    it('defines exponential backoff with 3 attempts in default retry configuration', () => {
      expect(DEFAULT_RETRY_CONFIG.attempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.backoff.type).toBe('exponential');
      expect(DEFAULT_RETRY_CONFIG.backoff.delay).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.removeOnComplete.count).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.removeOnFail.count).toBe(5000);
    });
  });

  describe('3. Worker Ownership Validation & Job Routing', () => {
    it('verifies resource ownership before processing: fails permanently on mismatch', async () => {
      if (!db) return;

      const aliceAssetId = '99999999-9999-9999-9999-999999999992';
      await db
        .insert(mediaAssets)
        .values({
          id: aliceAssetId,
          userId: userA_Id, // Alice owns this
          storageKey: `raw/${userA_Id}/${aliceAssetId}.mp4`,
          originalFilename: 'alice_source.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const discardSpy = vi.fn();
      const mockJob: any = {
        data: {
          assetId: aliceAssetId,
          userId: userB_Id, // Bob attempting to process Alice's asset!
          operation: 'probe',
          enqueuedAt: new Date().toISOString(),
        },
        discard: discardSpy,
      };

      await expect(processMediaJob(mockJob)).rejects.toThrow(PermanentJobError);
      // Verify job was discarded so BullMQ does NOT retry permanent authorization mismatch
      expect(discardSpy).toHaveBeenCalledTimes(1);
    });

    it('verifies asset existence before processing: fails permanently if asset missing', async () => {
      const missingAssetId = '00000000-0000-0000-0000-000000000000';
      const discardSpy = vi.fn();
      const mockJob: any = {
        data: {
          assetId: missingAssetId,
          userId: userA_Id,
          operation: 'proxy',
          enqueuedAt: new Date().toISOString(),
        },
        discard: discardSpy,
      };

      await expect(processMediaJob(mockJob)).rejects.toThrow(/was not found or ownership mismatch/);
      expect(discardSpy).toHaveBeenCalledTimes(1);
    });

    it('routes probe job to mediaProbeService.probeMediaAsset', async () => {
      if (!db) return;

      const assetId = '99999999-9999-9999-9999-999999999993';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'probe_test.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 20000,
          ingestionStatus: 'uploaded',
        })
        .onConflictDoNothing();

      const probeSpy = vi.spyOn(mediaProbeServiceModule, 'probeMediaAsset').mockResolvedValueOnce({
        asset: { id: assetId } as any,
        probedMetadata: { format: 'mp4', videoCodec: 'h264' } as any,
      });

      const mockJob: any = {
        data: { assetId, userId: userA_Id, operation: 'probe', enqueuedAt: new Date().toISOString() },
        discard: vi.fn(),
      };

      const result = await processMediaJob(mockJob);
      expect(probeSpy).toHaveBeenCalledWith(assetId, userA_Id);
      expect(result.success).toBe(true);
      expect(result.operation).toBe('probe');
      expect(result.result?.probedMetadata).toBeDefined();

      probeSpy.mockRestore();
    });

    it('routes proxy job to mediaProxyService.generateMediaProxy', async () => {
      if (!db) return;

      const assetId = '99999999-9999-9999-9999-999999999994';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'proxy_test.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 20000,
          ingestionStatus: 'ready',
          width: 1920,
          height: 1080,
        })
        .onConflictDoNothing();

      const proxySpy = vi.spyOn(mediaProxyServiceModule, 'generateMediaProxy').mockResolvedValueOnce({
        asset: { id: assetId } as any,
        proxy: { storageKey: `proxies/${userA_Id}/${assetId}_720p.mp4`, status: 'ready' } as any,
      });

      const mockJob: any = {
        data: { assetId, userId: userA_Id, operation: 'proxy', enqueuedAt: new Date().toISOString() },
        discard: vi.fn(),
      };

      const result = await processMediaJob(mockJob);
      expect(proxySpy).toHaveBeenCalledWith(assetId, userA_Id);
      expect(result.success).toBe(true);
      expect(result.operation).toBe('proxy');
      expect(result.result?.proxy).toBeDefined();

      proxySpy.mockRestore();
    });

    it('routes thumbnail job to mediaThumbnailService.generateMediaThumbnail', async () => {
      if (!db) return;

      const assetId = '99999999-9999-9999-9999-999999999995';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'thumb_test.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 20000,
          ingestionStatus: 'ready',
          width: 1920,
          height: 1080,
        })
        .onConflictDoNothing();

      const thumbSpy = vi.spyOn(mediaThumbnailServiceModule, 'generateMediaThumbnail').mockResolvedValueOnce({
        asset: { id: assetId } as any,
        thumbnail: { storageKey: `thumbnails/${userA_Id}/${assetId}.jpg`, status: 'ready' } as any,
      });

      const mockJob: any = {
        data: { assetId, userId: userA_Id, operation: 'thumbnail', enqueuedAt: new Date().toISOString() },
        discard: vi.fn(),
      };

      const result = await processMediaJob(mockJob);
      expect(thumbSpy).toHaveBeenCalledWith(assetId, userA_Id);
      expect(result.success).toBe(true);
      expect(result.operation).toBe('thumbnail');
      expect(result.result?.thumbnail).toBeDefined();

      thumbSpy.mockRestore();
    });

    it('routes waveform job to mediaWaveformService.generateMediaWaveform', async () => {
      if (!db) return;

      const assetId = '99999999-9999-9999-9999-999999999996';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp3`,
          originalFilename: 'wave_test.mp3',
          mimeType: 'audio/mpeg',
          fileSizeBytes: 20000,
          durationMs: 40000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const waveSpy = vi.spyOn(mediaWaveformServiceModule, 'generateMediaWaveform').mockResolvedValueOnce({
        asset: { id: assetId } as any,
        waveform: { storageKey: `waveforms/${userA_Id}/${assetId}.json`, status: 'ready' } as any,
        data: { assetId, sampleCount: 1000, durationMs: 40000, samples: [] },
      });

      const mockJob: any = {
        data: { assetId, userId: userA_Id, operation: 'waveform', enqueuedAt: new Date().toISOString() },
        discard: vi.fn(),
      };

      const result = await processMediaJob(mockJob);
      expect(waveSpy).toHaveBeenCalledWith(assetId, userA_Id);
      expect(result.success).toBe(true);
      expect(result.operation).toBe('waveform');
      expect(result.result?.sampleCount).toBe(1000);

      waveSpy.mockRestore();
    });

    it('distinguishes permanent validation errors from transient errors and calls job.discard()', () => {
      expect(isPermanentError(new PermanentJobError('auth failure'))).toBe(true);
      expect(isPermanentError(new mediaThumbnailServiceModule.MediaThumbnailError('not a video file', 400))).toBe(true);
      expect(isPermanentError(new mediaWaveformServiceModule.MediaWaveformError('not an audio file', 400))).toBe(true);
      expect(isPermanentError(new mediaProbeServiceModule.MediaProbeError('Unsupported MIME type', 400))).toBe(true);

      // Transient errors should return false (allowing BullMQ exponential retries)
      expect(isPermanentError(new Error('Connection reset by peer'))).toBe(false);
      expect(isPermanentError(new Error('ETIMEDOUT'))).toBe(false);
      expect(isPermanentError(new mediaProxyServiceModule.MediaProxyError('FFmpeg transcode interrupted', 422))).toBe(false);
    });
  });

  describe('4. API: Job Enqueue (POST /api/media/:assetId/process)', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/media/any-asset-id/process')
        .send({ operation: 'probe' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/i);
    });

    it('rejects invalid or missing operation with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/media/any-asset-id/process')
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ operation: 'invalid_render_operation' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid or missing operation/i);
    });

    it('returns 404 for nonexistent media asset', async () => {
      const res = await request(app)
        .post('/api/media/00000000-0000-0000-0000-000000000000/process')
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ operation: 'probe' });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });

    it('enforces IDOR protection: Bob cannot enqueue processing for Alice’s asset', async () => {
      if (!db) return;

      const aliceAssetId = '99999999-9999-9999-9999-999999999997';
      await db
        .insert(mediaAssets)
        .values({
          id: aliceAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${aliceAssetId}.mp4`,
          originalFilename: 'alice_private.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${aliceAssetId}/process`)
        .set('Authorization', 'Bearer bob-valid-token') // Bob attempting IDOR
        .send({ operation: 'proxy' });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });

    it('rejects incompatible media types upfront: thumbnail requested on audio media', async () => {
      if (!db) return;

      const audioAssetId = '99999999-9999-9999-9999-999999999998';
      await db
        .insert(mediaAssets)
        .values({
          id: audioAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${audioAssetId}.mp3`,
          originalFilename: 'audio_track.mp3',
          mimeType: 'audio/mpeg',
          fileSizeBytes: 5000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${audioAssetId}/process`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ operation: 'thumbnail' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a video file/i);
    });

    it('rejects incompatible media types upfront: waveform requested on video media', async () => {
      if (!db) return;

      const videoAssetId = '99999999-9999-9999-9999-999999999999';
      await db
        .insert(mediaAssets)
        .values({
          id: videoAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${videoAssetId}.mp4`,
          originalFilename: 'video_clip.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 5000,
          ingestionStatus: 'ready',
          metadata: { videoCodec: 'h264' },
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${videoAssetId}/process`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ operation: 'waveform' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not an audio file/i);
    });

    it('successfully enqueues job with deterministic job ID and returns 202 Accepted', async () => {
      if (!db) return;

      const videoAssetId = '88888888-8888-8888-8888-888888888881';
      await db
        .insert(mediaAssets)
        .values({
          id: videoAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${videoAssetId}.mp4`,
          originalFilename: 'sample_nature.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 5000000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob').mockResolvedValueOnce({
        id: `media:${videoAssetId}:thumbnail`,
        getState: async () => 'waiting',
      } as any);

      const res = await request(app)
        .post(`/api/media/${videoAssetId}/process`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ operation: 'thumbnail' });

      expect(res.status).toBe(202);
      expect(res.body.message).toMatch(/job enqueued successfully/i);
      expect(res.body.jobId).toBe(`media:${videoAssetId}:thumbnail`);
      expect(res.body.operation).toBe('thumbnail');
      expect(res.body.status).toBe('waiting');

      expect(enqueueSpy).toHaveBeenCalledWith({
        assetId: videoAssetId,
        userId: userA_Id,
        operation: 'thumbnail',
      });

      enqueueSpy.mockRestore();
    });
  });

  describe('5. API: Job Status (GET /api/media/jobs/:jobId)', () => {
    it('rejects unauthenticated job status requests with 401', async () => {
      const res = await request(app).get('/api/media/jobs/media:test:probe');
      expect(res.status).toBe(401);
    });

    it('returns 404 for nonexistent job', async () => {
      const getJobSpy = vi.spyOn(mediaQueueModule, 'getMediaJobSummary').mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/media/jobs/media:missing:probe')
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/job not found or access denied/i);

      getJobSpy.mockRestore();
    });

    it('enforces IDOR protection: Bob cannot view Alice’s job status', async () => {
      // Mock job belonging to Alice
      const getJobSpy = vi.spyOn(mediaQueueModule, 'getMediaJobSummary').mockImplementationOnce(
        async (_jobId, authenticatedUserId) => {
          if (authenticatedUserId !== userA_Id) {
            return null; // IDOR protected
          }
          return {
            id: 'media:alice-asset:proxy',
            assetId: 'alice-asset',
            operation: 'proxy',
            state: 'active',
            attemptsMade: 1,
            timestamp: Date.now(),
          };
        },
      );

      const res = await request(app)
        .get('/api/media/jobs/media:alice-asset:proxy')
        .set('Authorization', 'Bearer bob-valid-token'); // Bob requests

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);

      getJobSpy.mockRestore();
    });

    it('returns structured job status and lifecycle metadata for owned job', async () => {
      const getJobSpy = vi.spyOn(mediaQueueModule, 'getMediaJobSummary').mockResolvedValueOnce({
        id: 'media:alice-asset:proxy',
        assetId: 'alice-asset',
        operation: 'proxy',
        state: 'completed',
        attemptsMade: 1,
        timestamp: Date.now() - 5000,
        finishedOn: Date.now(),
        returnvalue: {
          assetId: 'alice-asset',
          userId: userA_Id,
          operation: 'proxy',
          success: true,
          completedAt: new Date().toISOString(),
        },
      });

      const res = await request(app)
        .get('/api/media/jobs/media:alice-asset:proxy')
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('media:alice-asset:proxy');
      expect(res.body.operation).toBe('proxy');
      expect(res.body.state).toBe('completed');
      expect(res.body.attemptsMade).toBe(1);
      expect(res.body.returnvalue.success).toBe(true);

      getJobSpy.mockRestore();
    });
  });

  describe('6. Worker Concurrency & Lifecycle', () => {
    it('creates worker with controlled concurrency of 2 by default and handles clean shutdown', async () => {
      const mockConnection: any = {
        on: vi.fn(),
        status: 'ready',
        duplicate: vi.fn(() => ({
          on: vi.fn(),
          status: 'ready',
          quit: vi.fn(async () => {}),
          disconnect: vi.fn(),
        })),
        quit: vi.fn(async () => {}),
        disconnect: vi.fn(),
      };
      const worker = createMediaWorker({ connection: mockConnection });
      expect(worker.opts.concurrency).toBe(2);
      expect(worker.name).toBe('media-processing');
      await worker.close();
    });
  });
});
