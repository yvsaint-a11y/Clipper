import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { inArray, eq } from 'drizzle-orm';
import request from 'supertest';
import { createExpressApp } from '../server/app';
import { getDb } from '../server/db';
import { users } from '../server/db/schema/users';
import { mediaAssets } from '../server/db/schema/media';
import * as mediaQueueModule from '../server/queue/mediaQueue';
import * as mediaProbeServiceModule from '../server/services/mediaProbeService';
import * as mediaThumbnailServiceModule from '../server/services/mediaThumbnailService';
import * as mediaWaveformServiceModule from '../server/services/mediaWaveformService';
import * as mediaProxyServiceModule from '../server/services/mediaProxyService';
import { processMediaJob } from '../server/workers/mediaWorker';

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

// Mock Redis detection
vi.mock('../server/queue/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/queue/redis')>();
  return {
    ...actual,
    isRedisConfigured: vi.fn(() => true),
    getRedisConnection: vi.fn(() => ({})),
    closeRedisConnection: vi.fn(async () => {}),
  };
});

// Mock R2 presence check so upload completion passes
vi.mock('../server/services/r2StorageService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/services/r2StorageService')>();
  return {
    ...actual,
    isR2Configured: vi.fn(() => false),
    verifyR2ObjectExists: vi.fn(async () => ({ exists: true })),
  };
});

describe('Phase 8G: Automatic Media Processing Pipeline', () => {
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

    // Clean up test media assets
    await db.delete(mediaAssets).where(inArray(mediaAssets.userId, [userA_Id, userB_Id]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Upload Completion Automatic Triggers', () => {
    it('1. completed video upload queues probe job', async () => {
      if (!db) return;

      const videoAssetId = '77777777-7777-7777-7777-777777777771';
      await db
        .insert(mediaAssets)
        .values({
          id: videoAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${videoAssetId}.mp4`,
          originalFilename: 'vlog_hero.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 15000000,
          ingestionStatus: 'pending',
        })
        .onConflictDoNothing();

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob').mockResolvedValueOnce({
        id: `media:${videoAssetId}:probe`,
        getState: async () => 'waiting',
      } as any);

      const res = await request(app)
        .post(`/api/media/${videoAssetId}/complete`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.processing).toBe(true);
      expect(res.body.jobs).toContain(`media:${videoAssetId}:probe`);

      expect(enqueueSpy).toHaveBeenCalledWith({
        assetId: videoAssetId,
        userId: userA_Id,
        operation: 'probe',
      });

      enqueueSpy.mockRestore();
    });

    it('2. completed audio upload queues probe job', async () => {
      if (!db) return;

      const audioAssetId = '77777777-7777-7777-7777-777777777772';
      await db
        .insert(mediaAssets)
        .values({
          id: audioAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${audioAssetId}.mp3`,
          originalFilename: 'podcast_voiceover.mp3',
          mimeType: 'audio/mpeg',
          fileSizeBytes: 4000000,
          ingestionStatus: 'pending',
        })
        .onConflictDoNothing();

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob').mockResolvedValueOnce({
        id: `media:${audioAssetId}:probe`,
        getState: async () => 'waiting',
      } as any);

      const res = await request(app)
        .post(`/api/media/${audioAssetId}/complete`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.processing).toBe(true);
      expect(res.body.jobs).toContain(`media:${audioAssetId}:probe`);

      expect(enqueueSpy).toHaveBeenCalledWith({
        assetId: audioAssetId,
        userId: userA_Id,
        operation: 'probe',
      });

      enqueueSpy.mockRestore();
    });

    it('6. incompatible derivative is not queued: image upload does not trigger probe or derivatives', async () => {
      if (!db) return;

      const imageAssetId = '77777777-7777-7777-7777-777777777773';
      await db
        .insert(mediaAssets)
        .values({
          id: imageAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${imageAssetId}.png`,
          originalFilename: 'overlay_logo.png',
          mimeType: 'image/png',
          fileSizeBytes: 500000,
          ingestionStatus: 'pending',
        })
        .onConflictDoNothing();

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob');

      const res = await request(app)
        .post(`/api/media/${imageAssetId}/complete`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.processing).toBe(false);
      expect(enqueueSpy).not.toHaveBeenCalled();

      enqueueSpy.mockRestore();
    });

    it('7. duplicate completion does not create duplicate active jobs', async () => {
      if (!db) return;

      const assetId = '77777777-7777-7777-7777-777777777774';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'b_roll_clip.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10000000,
          ingestionStatus: 'pending',
        })
        .onConflictDoNothing();

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob').mockResolvedValue({
        id: `media:${assetId}:probe`,
        getState: async () => 'waiting',
      } as any);

      // First call
      const res1 = await request(app)
        .post(`/api/media/${assetId}/complete`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({});

      // Duplicate call
      const res2 = await request(app)
        .post(`/api/media/${assetId}/complete`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({});

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.jobs[0]).toBe(`media:${assetId}:probe`);
      expect(res2.body.jobs[0]).toBe(`media:${assetId}:probe`);

      enqueueSpy.mockRestore();
    });

    it('8. deterministic job IDs are preserved', () => {
      const assetId = '77777777-7777-7777-7777-777777777775';
      const probeId = mediaQueueModule.buildMediaJobId(assetId, 'probe');
      const proxyId = mediaQueueModule.buildMediaJobId(assetId, 'proxy');
      const thumbId = mediaQueueModule.buildMediaJobId(assetId, 'thumbnail');
      const waveId = mediaQueueModule.buildMediaJobId(assetId, 'waveform');

      expect(probeId).toBe(`media:${assetId}:probe`);
      expect(proxyId).toBe(`media:${assetId}:proxy`);
      expect(thumbId).toBe(`media:${assetId}:thumbnail`);
      expect(waveId).toBe(`media:${assetId}:waveform`);
    });

    it('14. unauthenticated completion remains rejected with 401', async () => {
      const res = await request(app).post('/api/media/any-id/complete').send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/i);
    });

    it('15. cross-user asset completion remains rejected with 404', async () => {
      if (!db) return;

      const aliceAssetId = '77777777-7777-7777-7777-777777777776';
      await db
        .insert(mediaAssets)
        .values({
          id: aliceAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${aliceAssetId}.mp4`,
          originalFilename: 'alice_only.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1000000,
          ingestionStatus: 'pending',
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${aliceAssetId}/complete`)
        .set('Authorization', 'Bearer bob-valid-token')
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });

    it('16. completion endpoint does not wait for FFmpeg processing: returns immediately', async () => {
      if (!db) return;

      const assetId = '77777777-7777-7777-7777-777777777777';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'quick_return.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1000000,
          ingestionStatus: 'pending',
        })
        .onConflictDoNothing();

      const probeSpy = vi.spyOn(mediaProbeServiceModule, 'probeMediaAsset');
      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob').mockResolvedValueOnce({
        id: `media:${assetId}:probe`,
      } as any);

      const startTime = Date.now();
      const res = await request(app)
        .post(`/api/media/${assetId}/complete`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({});
      const durationMs = Date.now() - startTime;

      expect(res.status).toBe(200);
      expect(durationMs).toBeLessThan(500); // HTTP response must be near-instantaneous
      // FFprobe should NOT have been run synchronously inside the HTTP handler
      expect(probeSpy).not.toHaveBeenCalled();

      probeSpy.mockRestore();
      enqueueSpy.mockRestore();
    });
  });

  describe('2. Worker Chaining & Derivative Enqueueing', () => {
    it('3. video probe success queues proxy job', async () => {
      if (!db) return;

      const videoAssetId = '88888888-8888-8888-8888-888888888881';
      await db
        .insert(mediaAssets)
        .values({
          id: videoAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${videoAssetId}.mp4`,
          originalFilename: 'action_scene.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 20000000,
          ingestionStatus: 'uploaded',
        })
        .onConflictDoNothing();

      const probeSpy = vi.spyOn(mediaProbeServiceModule, 'probeMediaAsset').mockResolvedValueOnce({
        asset: {
          id: videoAssetId,
          userId: userA_Id,
          mimeType: 'video/mp4',
          metadata: {},
        } as any,
        probedMetadata: {
          videoCodec: 'h264',
          audioCodec: 'aac',
          durationMs: 45000,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true,
          container: 'mp4',
        } as any,
      });

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob').mockResolvedValue({} as any);

      const mockJob: any = {
        data: { assetId: videoAssetId, userId: userA_Id, operation: 'probe', enqueuedAt: new Date().toISOString() },
        opts: { attempts: 3 },
        attemptsMade: 1,
      };

      const result = await processMediaJob(mockJob);
      expect(result.success).toBe(true);

      // Verify proxy was queued (Requirement 3)
      expect(enqueueSpy).toHaveBeenCalledWith({
        assetId: videoAssetId,
        userId: userA_Id,
        operation: 'proxy',
      });

      probeSpy.mockRestore();
      enqueueSpy.mockRestore();
    });

    it('4. video probe success queues thumbnail job', async () => {
      if (!db) return;

      const videoAssetId = '88888888-8888-8888-8888-888888888885';
      await db
        .insert(mediaAssets)
        .values({
          id: videoAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${videoAssetId}.mp4`,
          originalFilename: 'thumbnail_scene.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 20000000,
          ingestionStatus: 'uploaded',
        })
        .onConflictDoNothing();

      const probeSpy = vi.spyOn(mediaProbeServiceModule, 'probeMediaAsset').mockResolvedValueOnce({
        asset: {
          id: videoAssetId,
          userId: userA_Id,
          mimeType: 'video/mp4',
          metadata: {},
        } as any,
        probedMetadata: {
          videoCodec: 'h264',
          durationMs: 30000,
          width: 1920,
          height: 1080,
          hasAudio: false,
          container: 'mp4',
        } as any,
      });

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob').mockResolvedValue({} as any);

      const mockJob: any = {
        data: { assetId: videoAssetId, userId: userA_Id, operation: 'probe', enqueuedAt: new Date().toISOString() },
        opts: { attempts: 3 },
        attemptsMade: 1,
      };

      const result = await processMediaJob(mockJob);
      expect(result.success).toBe(true);

      // Verify thumbnail was queued (Requirement 4)
      expect(enqueueSpy).toHaveBeenCalledWith({
        assetId: videoAssetId,
        userId: userA_Id,
        operation: 'thumbnail',
      });

      probeSpy.mockRestore();
      enqueueSpy.mockRestore();
    });

    it('5. audio probe success queues waveform job', async () => {
      if (!db) return;

      const audioAssetId = '88888888-8888-8888-8888-888888888882';
      await db
        .insert(mediaAssets)
        .values({
          id: audioAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${audioAssetId}.wav`,
          originalFilename: 'voice_recording.wav',
          mimeType: 'audio/wav',
          fileSizeBytes: 8000000,
          ingestionStatus: 'uploaded',
        })
        .onConflictDoNothing();

      const probeSpy = vi.spyOn(mediaProbeServiceModule, 'probeMediaAsset').mockResolvedValueOnce({
        asset: {
          id: audioAssetId,
          userId: userA_Id,
          mimeType: 'audio/wav',
          metadata: {},
        } as any,
        probedMetadata: {
          audioCodec: 'pcm_s16le',
          durationMs: 60000,
          hasAudio: true,
          container: 'wav',
        } as any,
      });

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob').mockResolvedValue({} as any);

      const mockJob: any = {
        data: { assetId: audioAssetId, userId: userA_Id, operation: 'probe', enqueuedAt: new Date().toISOString() },
        opts: { attempts: 3 },
        attemptsMade: 1,
      };

      const result = await processMediaJob(mockJob);
      expect(result.success).toBe(true);

      // Verify waveform was queued (Requirement 5)
      expect(enqueueSpy).toHaveBeenCalledWith({
        assetId: audioAssetId,
        userId: userA_Id,
        operation: 'waveform',
      });

      // Video proxy/thumbnail should NOT be queued for audio (Requirement 6)
      expect(enqueueSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'proxy' }),
      );
      expect(enqueueSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'thumbnail' }),
      );

      probeSpy.mockRestore();
      enqueueSpy.mockRestore();
    });

    it('9. probe failure does not queue derivatives', async () => {
      if (!db) return;

      const assetId = '88888888-8888-8888-8888-888888888883';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'corrupt_probe.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1000000,
          ingestionStatus: 'uploaded',
        })
        .onConflictDoNothing();

      const probeSpy = vi
        .spyOn(mediaProbeServiceModule, 'probeMediaAsset')
        .mockRejectedValueOnce(new Error('FFprobe moov atom not found'));

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob');

      const mockJob: any = {
        data: { assetId, userId: userA_Id, operation: 'probe', enqueuedAt: new Date().toISOString() },
        opts: { attempts: 3 },
        attemptsMade: 1,
      };

      await expect(processMediaJob(mockJob)).rejects.toThrow('FFprobe moov atom not found');

      // No derivatives should be queued when probe fails
      expect(enqueueSpy).not.toHaveBeenCalled();

      probeSpy.mockRestore();
      enqueueSpy.mockRestore();
    });

    it('13. ownership is preserved: queued jobs strictly retain asset owner userId', async () => {
      if (!db) return;

      const assetId = '88888888-8888-8888-8888-888888888884';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'ownership_check.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1000000,
          ingestionStatus: 'uploaded',
        })
        .onConflictDoNothing();

      const probeSpy = vi.spyOn(mediaProbeServiceModule, 'probeMediaAsset').mockResolvedValueOnce({
        asset: { id: assetId, userId: userA_Id, mimeType: 'video/mp4', metadata: {} } as any,
        probedMetadata: { format: 'mp4', videoCodec: 'h264' } as any,
      });

      const enqueueSpy = vi.spyOn(mediaQueueModule, 'enqueueMediaJob').mockResolvedValue({} as any);

      const mockJob: any = {
        data: { assetId, userId: userA_Id, operation: 'probe', enqueuedAt: new Date().toISOString() },
        opts: { attempts: 1 },
        attemptsMade: 1,
      };

      await processMediaJob(mockJob);

      // Verify every follow-up job preserves owner's userId
      expect(enqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({ userId: userA_Id }),
      );
      expect(enqueueSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ userId: userB_Id }),
      );

      probeSpy.mockRestore();
      enqueueSpy.mockRestore();
    });
  });

  describe('3. Derivative Failure Isolation Rules', () => {
    it('10. proxy failure does not invalidate probe metadata', async () => {
      if (!db) return;

      const assetId = '99999999-9999-9999-9999-999999999991';
      const initialMeta = {
        probe: {
          format: 'mp4',
          videoCodec: 'h264',
          durationMs: 30000,
          status: 'ready',
        },
      };

      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'preserve_probe.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10000000,
          durationMs: 30000,
          width: 1920,
          height: 1080,
          ingestionStatus: 'ready',
          metadata: initialMeta,
        })
        .onConflictDoNothing();

      // Trigger proxy failure
      const proxySpy = vi
        .spyOn(mediaProxyServiceModule, 'generateMediaProxy')
        .mockRejectedValueOnce(new Error('GPU encoder allocation failed'));

      const mockJob: any = {
        data: { assetId, userId: userA_Id, operation: 'proxy', enqueuedAt: new Date().toISOString() },
        opts: { attempts: 3 },
        attemptsMade: 1,
      };

      await expect(processMediaJob(mockJob)).rejects.toThrow('GPU encoder allocation failed');

      // Verify probe metadata in PostgreSQL remains untouched
      const [persisted] = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, assetId))
        .limit(1);

      expect(persisted).toBeDefined();
      expect(persisted.durationMs).toBe(30000);
      expect(persisted.width).toBe(1920);
      expect((persisted.metadata as any).probe).toBeDefined();
      expect((persisted.metadata as any).probe.status).toBe('ready');

      proxySpy.mockRestore();
    });

    it('11. thumbnail failure does not invalidate proxy metadata', async () => {
      if (!db) return;

      const assetId = '99999999-9999-9999-9999-999999999992';
      const initialMeta = {
        probe: { format: 'mp4', status: 'ready' },
        proxy: {
          storageKey: `proxies/${userA_Id}/${assetId}_720p.mp4`,
          width: 1280,
          height: 720,
          status: 'ready',
        },
      };

      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'preserve_proxy.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10000000,
          ingestionStatus: 'ready',
          metadata: initialMeta,
        })
        .onConflictDoNothing();

      // Trigger thumbnail failure
      const thumbSpy = vi
        .spyOn(mediaThumbnailServiceModule, 'generateMediaThumbnail')
        .mockRejectedValueOnce(new Error('Thumbnail frame extraction failed'));

      const mockJob: any = {
        data: { assetId, userId: userA_Id, operation: 'thumbnail', enqueuedAt: new Date().toISOString() },
        opts: { attempts: 3 },
        attemptsMade: 1,
      };

      await expect(processMediaJob(mockJob)).rejects.toThrow('Thumbnail frame extraction failed');

      // Check PostgreSQL record
      const [persisted] = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, assetId))
        .limit(1);

      expect(persisted).toBeDefined();
      const meta = persisted.metadata as any;
      expect(meta.proxy).toBeDefined();
      expect(meta.proxy.status).toBe('ready');
      expect(meta.proxy.storageKey).toBe(`proxies/${userA_Id}/${assetId}_720p.mp4`);

      thumbSpy.mockRestore();
    });

    it('12. waveform failure does not invalidate audio probe metadata', async () => {
      if (!db) return;

      const assetId = '99999999-9999-9999-9999-999999999993';
      const initialMeta = {
        probe: {
          audioCodec: 'aac',
          durationMs: 45000,
          status: 'ready',
        },
      };

      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.aac`,
          originalFilename: 'narration.aac',
          mimeType: 'audio/aac',
          fileSizeBytes: 2000000,
          durationMs: 45000,
          hasAudio: true,
          ingestionStatus: 'ready',
          metadata: initialMeta,
        })
        .onConflictDoNothing();

      const waveSpy = vi
        .spyOn(mediaWaveformServiceModule, 'generateMediaWaveform')
        .mockRejectedValueOnce(new Error('PCM decoding error'));

      const mockJob: any = {
        data: { assetId, userId: userA_Id, operation: 'waveform', enqueuedAt: new Date().toISOString() },
        opts: { attempts: 3 },
        attemptsMade: 1,
      };

      await expect(processMediaJob(mockJob)).rejects.toThrow('PCM decoding error');

      const [persisted] = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, assetId))
        .limit(1);

      expect(persisted).toBeDefined();
      expect(persisted.durationMs).toBe(45000);
      expect((persisted.metadata as any).probe).toBeDefined();
      expect((persisted.metadata as any).probe.status).toBe('ready');

      waveSpy.mockRestore();
    });
  });
});
