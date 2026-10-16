import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { inArray } from 'drizzle-orm';
import request from 'supertest';
import { createExpressApp } from '../server/app';
import { getDb } from '../server/db';
import { users } from '../server/db/schema/users';
import { mediaAssets } from '../server/db/schema/media';
import * as mediaQueueModule from '../server/queue/mediaQueue';
import * as r2StorageServiceModule from '../server/services/r2StorageService';
import {
  useMediaProcessingStore,
  getJobKey,
  type MediaOperation,
} from '../src/features/media/stores/useMediaProcessingStore';

const userA_Id = '11111111-1111-1111-1111-111111111111';
const userA_Email = 'alice.creator@clipper.dev';

const userB_Id = '22222222-2222-2222-2222-222222222222';
const userB_Email = 'bob.intruder@clipper.dev';

// Mock authentication for Express API
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

// Mock Redis connection detection for Express API
vi.mock('../server/queue/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/queue/redis')>();
  return {
    ...actual,
    isRedisConfigured: vi.fn(() => true),
    getRedisConnection: vi.fn(() => ({})),
    closeRedisConnection: vi.fn(async () => {}),
  };
});

describe('Phase 8F: Media Job Integration Foundation', () => {
  const db = getDb();
  const app = createExpressApp();

  beforeEach(async () => {
    useMediaProcessingStore.getState().stopAllPolling();

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

    // Clean up test media assets for clean test state
    await db.delete(mediaAssets).where(inArray(mediaAssets.userId, [userA_Id, userB_Id]));
  });

  afterEach(() => {
    useMediaProcessingStore.getState().stopAllPolling();
    vi.clearAllMocks();
  });

  describe('1. API Endpoints: Processing Request & Job Status', () => {
    it('1. authenticated process request succeeds and returns 202 Accepted', async () => {
      if (!db) return;

      const videoAssetId = '66666666-6666-6666-6666-666666666661';
      await db
        .insert(mediaAssets)
        .values({
          id: videoAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${videoAssetId}.mp4`,
          originalFilename: 'vlog_intro.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 20000000,
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

    it('2. validates process operation: rejects invalid operations with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/media/any-id/process')
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ operation: 'unsupported_render' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid or missing operation/i);
    });

    it('3. unauthenticated process request is rejected with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/media/any-id/process')
        .send({ operation: 'thumbnail' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/i);
    });

    it('4. cross-user protection: Bob cannot enqueue processing on Alice’s media asset', async () => {
      if (!db) return;

      const aliceAssetId = '66666666-6666-6666-6666-666666666662';
      await db
        .insert(mediaAssets)
        .values({
          id: aliceAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${aliceAssetId}.mp4`,
          originalFilename: 'alice_confidential.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10000000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${aliceAssetId}/process`)
        .set('Authorization', 'Bearer bob-valid-token')
        .send({ operation: 'proxy' });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });

    it('5. returns deterministic job ID formatted as media:{assetId}:{operation}', async () => {
      if (!db) return;

      const assetId = '66666666-6666-6666-6666-666666666663';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'test_asset.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1000000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob').mockResolvedValueOnce({
        id: `media:${assetId}:proxy`,
        getState: async () => 'waiting',
      } as any);

      const res = await request(app)
        .post(`/api/media/${assetId}/process`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ operation: 'proxy' });

      expect(res.status).toBe(202);
      expect(res.body.jobId).toBe(`media:${assetId}:proxy`);

      enqueueSpy.mockRestore();
    });

    it('6. retrieves job status via GET /api/media/jobs/:jobId', async () => {
      const getJobSpy = vi.spyOn(mediaQueueModule, 'getMediaJobSummary').mockResolvedValueOnce({
        id: 'media:test-asset:thumbnail',
        assetId: 'test-asset',
        operation: 'thumbnail',
        state: 'active',
        attemptsMade: 1,
        timestamp: Date.now(),
      });

      const res = await request(app)
        .get('/api/media/jobs/media:test-asset:thumbnail')
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('media:test-asset:thumbnail');
      expect(res.body.state).toBe('active');
      expect(res.body.operation).toBe('thumbnail');

      getJobSpy.mockRestore();
    });

    it('10. handles duplicate operations deterministically without error', async () => {
      if (!db) return;

      const assetId = '66666666-6666-6666-6666-666666666664';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'nature_stream.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1000000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob').mockResolvedValue({
        id: `media:${assetId}:thumbnail`,
        getState: async () => 'waiting',
      } as any);

      const res1 = await request(app)
        .post(`/api/media/${assetId}/process`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ operation: 'thumbnail' });

      const res2 = await request(app)
        .post(`/api/media/${assetId}/process`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ operation: 'thumbnail' });

      expect(res1.status).toBe(202);
      expect(res2.status).toBe(202);
      expect(res1.body.jobId).toBe(res2.body.jobId);

      enqueueSpy.mockRestore();
    });

    it('11. retrieves proxy completion signed download URL', async () => {
      if (!db) return;

      const assetId = '66666666-6666-6666-6666-666666666665';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'proxy_test.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1000000,
          ingestionStatus: 'ready',
          metadata: {
            proxy: {
              storageKey: `proxies/${userA_Id}/${assetId}_720p.mp4`,
              status: 'ready',
            },
          },
        })
        .onConflictDoNothing();

      const res = await request(app)
        .get(`/api/media/${assetId}/download-url?type=proxy`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.downloadUrl).toMatch(/https:\/\/[^/]+\.cloudflarestorage\.com/);
      expect(res.body.downloadUrl).toContain(assetId);
      expect(res.body.storageKey).toBe(`proxies/${userA_Id}/${assetId}_720p.mp4`);
    });

    it('12. retrieves thumbnail completion signed URL', async () => {
      if (!db) return;

      const assetId = '66666666-6666-6666-6666-666666666666';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'thumb_test.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1000000,
          ingestionStatus: 'ready',
          thumbnailUrl: `thumbnails/${userA_Id}/${assetId}.jpg`,
          metadata: {
            thumbnail: {
              storageKey: `thumbnails/${userA_Id}/${assetId}.jpg`,
              status: 'ready',
            },
          },
        })
        .onConflictDoNothing();

      const res = await request(app)
        .get(`/api/media/${assetId}/thumbnail-url`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.signedUrl).toMatch(/https:\/\/[^/]+\.cloudflarestorage\.com/);
      expect(res.body.signedUrl).toContain(assetId);
    });

    it('13. retrieves waveform completion JSON payload', async () => {
      if (!db) return;

      const assetId = '66666666-6666-6666-6666-666666666667';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp3`,
          originalFilename: 'audio_interview.mp3',
          mimeType: 'audio/mpeg',
          fileSizeBytes: 500000,
          durationMs: 30000,
          ingestionStatus: 'ready',
          waveformUrl: `waveforms/${userA_Id}/${assetId}.json`,
          metadata: {
            waveform: {
              storageKey: `waveforms/${userA_Id}/${assetId}.json`,
              sampleCount: 1000,
              durationMs: 30000,
              status: 'ready',
            },
          },
        })
        .onConflictDoNothing();

      const downloadSpy = vi
        .spyOn(r2StorageServiceModule, 'downloadR2ObjectToBuffer')
        .mockResolvedValueOnce(
          Buffer.from(
            JSON.stringify({
              assetId,
              sampleCount: 1000,
              durationMs: 30000,
              samples: new Array(1000).fill(0.42),
            }),
          ),
        );

      const res = await request(app)
        .get(`/api/media/${assetId}/waveform`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.sampleCount).toBe(1000);
      expect(res.body.samples).toHaveLength(1000);

      downloadSpy.mockRestore();
    });

    it('20. does not expose sensitive infrastructure secrets in responses or errors', async () => {
      const res = await request(app)
        .post('/api/media/nonexistent/process')
        .set('Authorization', 'Bearer alice-valid-token')
        .send({ operation: 'thumbnail' });

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('redis://');
      expect(bodyStr).not.toContain('CLOUDFLARE_');
      expect(bodyStr).not.toContain('SUPABASE_');
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain('secret');
    });
  });

  describe('2. Frontend Store & Polling Workflow (useMediaProcessingStore)', () => {
    it('7. completed job handling: updates status to ready and records derivative data', async () => {
      const store = useMediaProcessingStore.getState();
      const assetId = 'asset-completed-test';
      const operation: MediaOperation = 'thumbnail';
      const jobId = 'media:asset-completed-test:thumbnail';

      // Mock fetch sequence:
      // 1. /api/media/jobs/:jobId -> { state: 'completed' }
      // 2. /api/media/:assetId/thumbnail-url -> { signedUrl: 'https://cdn.example.com/thumb.jpg' }
      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes(`/api/media/jobs/${jobId}`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: jobId,
              state: 'completed',
              attemptsMade: 1,
            }),
          } as any;
        }
        if (url.includes(`/api/media/${assetId}/thumbnail-url`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              signedUrl: 'https://cdn.example.com/thumb.jpg',
            }),
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      store.pollJobStatus(jobId, assetId, operation, 'mock-token', mockFetch, 100);

      // Wait briefly for checkJob to execute
      await new Promise((r) => setTimeout(r, 50));

      const jobState = store.getJobState(assetId, operation);
      expect(jobState.status).toBe('ready');
      expect(jobState.thumbnailUrl).toBe('https://cdn.example.com/thumb.jpg');
      expect(jobState.error).toBeNull();
    });

    it('8. failed job handling: updates status to failed with error reason', async () => {
      const store = useMediaProcessingStore.getState();
      const assetId = 'asset-failed-test';
      const operation: MediaOperation = 'proxy';
      const jobId = 'media:asset-failed-test:proxy';

      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes(`/api/media/jobs/${jobId}`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: jobId,
              state: 'failed',
              failedReason: 'FFmpeg transcode timed out',
              attemptsMade: 3,
            }),
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      store.pollJobStatus(jobId, assetId, operation, 'mock-token', mockFetch, 100);
      await new Promise((r) => setTimeout(r, 50));

      const jobState = store.getJobState(assetId, operation);
      expect(jobState.status).toBe('failed');
      expect(jobState.error).toBe('FFmpeg transcode timed out');
      expect(jobState.attemptsMade).toBe(3);
    });

    it('15. polling stops after job completion', async () => {
      const store = useMediaProcessingStore.getState();
      const assetId = 'asset-poll-stop-comp';
      const operation: MediaOperation = 'thumbnail';
      const jobId = 'media:asset-poll-stop-comp:thumbnail';

      let fetchCount = 0;
      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('/api/media/jobs/')) {
          fetchCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: jobId, state: 'completed' }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      store.pollJobStatus(jobId, assetId, operation, 'mock-token', mockFetch, 50);

      // Wait 120ms (would trigger 2+ intervals if polling didn't stop)
      await new Promise((r) => setTimeout(r, 120));

      expect(fetchCount).toBe(1); // Exactly 1 check before stopping
    });

    it('16. polling stops after job failure', async () => {
      const store = useMediaProcessingStore.getState();
      const assetId = 'asset-poll-stop-fail';
      const operation: MediaOperation = 'waveform';
      const jobId = 'media:asset-poll-stop-fail:waveform';

      let fetchCount = 0;
      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('/api/media/jobs/')) {
          fetchCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: jobId, state: 'failed', failedReason: 'Audio stream corrupt' }),
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      store.pollJobStatus(jobId, assetId, operation, 'mock-token', mockFetch, 50);
      await new Promise((r) => setTimeout(r, 120));

      expect(fetchCount).toBe(1); // Stopped on failure
    });

    it('17. polling cleanup on stopPolling / unmount prevents memory leaks', async () => {
      const store = useMediaProcessingStore.getState();
      const assetId = 'asset-poll-cleanup';
      const operation: MediaOperation = 'proxy';
      const jobId = 'media:asset-poll-cleanup:proxy';

      let pollCalls = 0;
      const mockFetch = vi.fn(async () => {
        pollCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: jobId, state: 'active' }),
        } as any;
      });

      store.pollJobStatus(jobId, assetId, operation, 'mock-token', mockFetch, 40);
      // Wait for immediate first check
      await new Promise((r) => setTimeout(r, 10));
      expect(pollCalls).toBe(1);

      // Unmount / stop polling
      store.stopPolling(jobId);

      // Wait another 100ms: no additional calls should occur
      await new Promise((r) => setTimeout(r, 100));
      expect(pollCalls).toBe(1);
    });

    it('18. processing controls disable while active: rejects concurrent duplicate requests', async () => {
      const store = useMediaProcessingStore.getState();
      const assetId = 'asset-controls-disable';
      const operation: MediaOperation = 'thumbnail';

      // Set state to queued
      store.setJobState(assetId, operation, { status: 'queued' });

      const mockFetch = vi.fn();
      const result = await store.requestProcessing(assetId, operation, 'mock-token', mockFetch as any);

      // Should return null and not invoke fetch
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();

      // Set state to processing
      store.setJobState(assetId, operation, { status: 'processing' });
      const result2 = await store.requestProcessing(assetId, operation, 'mock-token', mockFetch as any);
      expect(result2).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('19. retry re-enqueues through API after failure', async () => {
      const store = useMediaProcessingStore.getState();
      const assetId = 'asset-retry-test';
      const operation: MediaOperation = 'thumbnail';

      // Initially failed
      store.setJobState(assetId, operation, {
        status: 'failed',
        error: 'Prior attempt failed',
      });

      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('/api/media/') && url.includes('/process')) {
          return {
            ok: true,
            status: 202,
            json: async () => ({
              jobId: `media:${assetId}:thumbnail`,
              status: 'waiting',
            }),
          } as any;
        }
        if (url.includes('/api/media/jobs/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: `media:${assetId}:thumbnail`,
              state: 'waiting',
            }),
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      const res = await store.requestProcessing(assetId, operation, 'mock-token', mockFetch as any);
      expect(res).not.toBeNull();
      expect(res?.jobId).toBe(`media:${assetId}:thumbnail`);
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/media/${assetId}/process`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ operation }),
        }),
      );

      const jobState = store.getJobState(assetId, operation);
      expect(jobState.status).toBe('queued');
      expect(jobState.error).toBeNull();
    });

    it('14. signed URL handling: stores and exposes temporary derivative URLs in store', () => {
      const store = useMediaProcessingStore.getState();
      const assetId = 'asset-signed-url-test';
      const operation: MediaOperation = 'thumbnail';

      store.setJobState(assetId, operation, {
        status: 'ready',
        thumbnailUrl: 'https://r2.mock.cloudflarestorage.com/temp-signed-thumb.jpg?token=abc',
      });

      const state = store.getJobState(assetId, operation);
      expect(state.thumbnailUrl).toContain('temp-signed-thumb.jpg');
      expect(state.status).toBe('ready');
    });
  });
});
