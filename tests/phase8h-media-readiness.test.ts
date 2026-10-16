import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { inArray } from 'drizzle-orm';
import request from 'supertest';
import { createExpressApp } from '../server/app';
import { getDb } from '../server/db';
import { users } from '../server/db/schema/users';
import { mediaAssets } from '../server/db/schema/media';
import {
  getMediaReadiness,
  isMediaPreviewReady,
  isDerivativeReady,
  resolveMediaPreviewSource,
  resolveMediaThumbnailUrl,
} from '../src/features/media/utils/mediaReadiness';
import { useMediaProcessingStore } from '../src/features/media/stores/useMediaProcessingStore';
import { useEditorStore, type EditorMediaAsset } from '../src/features/editor/stores/useEditorStore';

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

// Mock R2 so signed URL routes work deterministically in tests
vi.mock('../server/services/r2StorageService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/services/r2StorageService')>();
  return {
    ...actual,
    isR2Configured: vi.fn(() => false),
    verifyR2ObjectExists: vi.fn(async () => ({ exists: true })),
  };
});

describe('Phase 8H: Media Readiness & Editor Integration', () => {
  const db = getDb();
  const app = createExpressApp();

  beforeEach(async () => {
    const store = useMediaProcessingStore.getState();
    store.stopAllPolling();
    useMediaProcessingStore.setState({ jobs: {} });
    useEditorStore.getState().resetEditor();

    if (!db) return;

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

    await db
      .delete(mediaAssets)
      .where(inArray(mediaAssets.id, ['aaaaaaaa-8888-8888-8888-aaaaaaaa8881']));
  });

  afterEach(() => {
    useMediaProcessingStore.getState().stopAllPolling();
    vi.clearAllMocks();
  });

  describe('1. Media Readiness Model & Derivative States', () => {
    it('1. video with all required derivatives (probe, proxy, thumbnail) is fully ready', () => {
      const videoAsset: EditorMediaAsset = {
        id: 'vid-ready-1',
        storageKey: `raw/${userA_Id}/vid-ready-1.mp4`,
        originalFilename: 'cinematic_intro.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 24000000,
        ingestionStatus: 'ready',
        hasAudio: true,
        durationMs: 15000,
        width: 1920,
        height: 1080,
        fps: 30,
        thumbnailUrl: `thumbnails/${userA_Id}/vid-ready-1.jpg`,
        createdAt: new Date().toISOString(),
        metadata: {
          probedAt: new Date().toISOString(),
          videoCodec: 'h264',
          proxy: {
            storageKey: `proxies/${userA_Id}/vid-ready-1_720p.mp4`,
            width: 1280,
            height: 720,
            status: 'ready',
          },
          thumbnail: {
            storageKey: `thumbnails/${userA_Id}/vid-ready-1.jpg`,
            width: 640,
            height: 360,
            status: 'ready',
          },
        },
      };

      const readiness = getMediaReadiness(videoAsset);
      expect(readiness.kind).toBe('video');
      expect(readiness.status).toBe('ready');
      expect(readiness.isFullyReady).toBe(true);
      expect(readiness.isAssetUsable).toBe(true);
      expect(readiness.isPreviewReady).toBe(true);
      expect(readiness.hasFailedDerivatives).toBe(false);
      expect(isDerivativeReady(videoAsset, 'original')).toBe(true);
      expect(isDerivativeReady(videoAsset, 'probe')).toBe(true);
      expect(isDerivativeReady(videoAsset, 'proxy')).toBe(true);
      expect(isDerivativeReady(videoAsset, 'thumbnail')).toBe(true);
    });

    it('2. video with probe processing (or missing derivatives) is not marked fully ready', () => {
      const probingVideo: EditorMediaAsset = {
        id: 'vid-probing-2',
        storageKey: `raw/${userA_Id}/vid-probing-2.mp4`,
        originalFilename: 'raw_capture.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 18000000,
        ingestionStatus: 'processing',
        hasAudio: true,
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      const readiness = getMediaReadiness(probingVideo);
      expect(readiness.status).toBe('processing');
      expect(readiness.isFullyReady).toBe(false);
      expect(readiness.derivatives.probe.status).toBe('processing');
      expect(readiness.derivatives.proxy.status).toBe('pending');
      expect(readiness.derivatives.thumbnail.status).toBe('pending');

      // Even if only thumbnail is ready while proxy is still processing, it must NOT be marked fully ready
      const partialVideo: EditorMediaAsset = {
        ...probingVideo,
        id: 'vid-partial-2b',
        ingestionStatus: 'ready',
        durationMs: 12000,
        width: 1920,
        height: 1080,
        metadata: {
          probedAt: new Date().toISOString(),
          proxy: { status: 'processing' },
          thumbnail: { status: 'ready', storageKey: 'thumb.jpg' },
        },
      };

      const partialReadiness = getMediaReadiness(partialVideo);
      expect(partialReadiness.isFullyReady).toBe(false);
      expect(partialReadiness.status).toBe('processing');
    });

    it('3. video proxy failure is represented correctly while preserving probe and original media', () => {
      const proxyFailedVideo: EditorMediaAsset = {
        id: 'vid-proxy-failed-3',
        storageKey: `raw/${userA_Id}/vid-proxy-failed-3.mp4`,
        originalFilename: 'high_bitrate.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 50000000,
        ingestionStatus: 'ready',
        hasAudio: true,
        durationMs: 30000,
        width: 1920,
        height: 1080,
        createdAt: new Date().toISOString(),
        metadata: {
          probedAt: new Date().toISOString(),
          videoCodec: 'h264',
          proxy: {
            status: 'failed',
            error: 'FFmpeg proxy transcode timeout',
          },
          thumbnail: {
            status: 'ready',
            storageKey: `thumbnails/${userA_Id}/vid-proxy-failed-3.jpg`,
          },
        },
      };

      const readiness = getMediaReadiness(proxyFailedVideo);
      expect(readiness.derivatives.proxy.status).toBe('failed');
      expect(readiness.derivatives.proxy.error).toContain('FFmpeg proxy transcode timeout');
      expect(readiness.derivatives.probe.status).toBe('ready');
      expect(readiness.derivatives.original.status).toBe('ready');
      expect(readiness.derivatives.thumbnail.status).toBe('ready');
      expect(readiness.hasFailedDerivatives).toBe(true);
      expect(readiness.failedDerivatives).toEqual(['proxy']);
      expect(readiness.isFullyReady).toBe(false);
      // Original asset remains usable and preview-ready via fallback
      expect(readiness.isAssetUsable).toBe(true);
      expect(isMediaPreviewReady(proxyFailedVideo)).toBe(true);
      expect(readiness.preferredPreviewSource).toBe('original');
    });

    it('4. thumbnail failure does not invalidate the video asset or its ready proxy', () => {
      const thumbFailedVideo: EditorMediaAsset = {
        id: 'vid-thumb-failed-4',
        storageKey: `raw/${userA_Id}/vid-thumb-failed-4.mp4`,
        originalFilename: 'interview_cam_a.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 32000000,
        ingestionStatus: 'ready',
        hasAudio: true,
        durationMs: 25000,
        width: 1920,
        height: 1080,
        createdAt: new Date().toISOString(),
        metadata: {
          probedAt: new Date().toISOString(),
          videoCodec: 'h264',
          proxy: {
            storageKey: `proxies/${userA_Id}/vid-thumb-failed-4_720p.mp4`,
            width: 1280,
            height: 720,
            status: 'ready',
          },
          thumbnail: {
            status: 'failed',
            error: 'Could not seek to target frame',
          },
        },
      };

      const readiness = getMediaReadiness(thumbFailedVideo);
      expect(readiness.derivatives.thumbnail.status).toBe('failed');
      expect(readiness.derivatives.proxy.status).toBe('ready');
      expect(readiness.derivatives.probe.status).toBe('ready');
      expect(readiness.derivatives.original.status).toBe('ready');
      expect(readiness.isAssetUsable).toBe(true);
      expect(isMediaPreviewReady(thumbFailedVideo)).toBe(true);
      expect(readiness.preferredPreviewSource).toBe('proxy');
      expect(resolveMediaThumbnailUrl(thumbFailedVideo)).toBeNull();
    });

    it('5. audio with probe and waveform ready is fully ready', () => {
      const audioAsset: EditorMediaAsset = {
        id: 'aud-ready-5',
        storageKey: `raw/${userA_Id}/aud-ready-5.mp3`,
        originalFilename: 'soundtrack_master.mp3',
        mimeType: 'audio/mpeg',
        fileSizeBytes: 6000000,
        ingestionStatus: 'ready',
        hasAudio: true,
        durationMs: 90000,
        waveformUrl: `waveforms/${userA_Id}/aud-ready-5.json`,
        createdAt: new Date().toISOString(),
        metadata: {
          probedAt: new Date().toISOString(),
          audioCodec: 'mp3',
          waveform: {
            storageKey: `waveforms/${userA_Id}/aud-ready-5.json`,
            sampleCount: 1000,
            status: 'ready',
          },
        },
      };

      const readiness = getMediaReadiness(audioAsset);
      expect(readiness.kind).toBe('audio');
      expect(readiness.status).toBe('ready');
      expect(readiness.isFullyReady).toBe(true);
      expect(readiness.isAssetUsable).toBe(true);
      expect(readiness.isPreviewReady).toBe(true);
      expect(isDerivativeReady(audioAsset, 'probe')).toBe(true);
      expect(isDerivativeReady(audioAsset, 'waveform')).toBe(true);
      expect(isDerivativeReady(audioAsset, 'proxy')).toBe(false);
    });

    it('6. audio waveform failure does not invalidate the audio asset', () => {
      const waveFailedAudio: EditorMediaAsset = {
        id: 'aud-wave-failed-6',
        storageKey: `raw/${userA_Id}/aud-wave-failed-6.wav`,
        originalFilename: 'voice_stem.wav',
        mimeType: 'audio/wav',
        fileSizeBytes: 9000000,
        ingestionStatus: 'ready',
        hasAudio: true,
        durationMs: 42000,
        createdAt: new Date().toISOString(),
        metadata: {
          probedAt: new Date().toISOString(),
          audioCodec: 'pcm_s16le',
          waveform: {
            status: 'failed',
            error: 'PCM peak extraction failed',
          },
        },
      };

      const readiness = getMediaReadiness(waveFailedAudio);
      expect(readiness.derivatives.waveform.status).toBe('failed');
      expect(readiness.derivatives.probe.status).toBe('ready');
      expect(readiness.derivatives.original.status).toBe('ready');
      expect(readiness.failedDerivatives).toEqual(['waveform']);
      expect(readiness.isAssetUsable).toBe(true);
      expect(isMediaPreviewReady(waveFailedAudio)).toBe(true);
    });

    it('7. image asset does not wait for video or audio derivatives', () => {
      const imageAsset: EditorMediaAsset = {
        id: 'img-ready-7',
        storageKey: `raw/${userA_Id}/img-ready-7.png`,
        originalFilename: 'brand_watermark.png',
        mimeType: 'image/png',
        fileSizeBytes: 420000,
        ingestionStatus: 'ready',
        hasAudio: false,
        width: 1080,
        height: 1080,
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      const readiness = getMediaReadiness(imageAsset);
      expect(readiness.kind).toBe('image');
      expect(readiness.status).toBe('ready');
      expect(readiness.isFullyReady).toBe(true);
      expect(readiness.isAssetUsable).toBe(true);
      expect(isMediaPreviewReady(imageAsset)).toBe(true);
      expect(readiness.derivatives.proxy.required).toBe(false);
      expect(readiness.derivatives.thumbnail.required).toBe(false);
      expect(readiness.derivatives.waveform.required).toBe(false);
    });
  });

  describe('2. Video Preview Source Resolution & Fallback', () => {
    it('8. 720p proxy is preferred for video preview when available', () => {
      const videoAsset: EditorMediaAsset = {
        id: 'vid-proxy-pref-8',
        storageKey: `raw/${userA_Id}/vid-proxy-pref-8.mp4`,
        originalFilename: '4k_source.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 85000000,
        ingestionStatus: 'ready',
        hasAudio: true,
        durationMs: 20000,
        width: 1920,
        height: 1080,
        createdAt: new Date().toISOString(),
        originalPreviewUrl: 'https://signed.r2.dev/raw/vid-proxy-pref-8.mp4',
        proxyPreviewUrl: 'https://signed.r2.dev/proxies/vid-proxy-pref-8_720p.mp4',
        metadata: {
          probedAt: new Date().toISOString(),
          proxy: {
            storageKey: `proxies/${userA_Id}/vid-proxy-pref-8_720p.mp4`,
            status: 'ready',
          },
          thumbnail: {
            storageKey: `thumbnails/${userA_Id}/vid-proxy-pref-8.jpg`,
            status: 'ready',
          },
        },
      };

      const resolved = resolveMediaPreviewSource(videoAsset);
      expect(resolved.source).toBe('proxy');
      expect(resolved.isProxy).toBe(true);
      expect(resolved.isFallback).toBe(false);
      expect(resolved.url).toBe('https://signed.r2.dev/proxies/vid-proxy-pref-8_720p.mp4');
      expect(resolved.fallbackUrl).toBe('https://signed.r2.dev/raw/vid-proxy-pref-8.mp4');
    });

    it('9. original media is used as fallback when proxy is unavailable or failed', () => {
      const videoWithoutProxy: EditorMediaAsset = {
        id: 'vid-fallback-9',
        storageKey: `raw/${userA_Id}/vid-fallback-9.mp4`,
        originalFilename: 'unproxied_clip.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 22000000,
        ingestionStatus: 'ready',
        hasAudio: true,
        durationMs: 18000,
        width: 1920,
        height: 1080,
        createdAt: new Date().toISOString(),
        originalPreviewUrl: 'https://signed.r2.dev/raw/vid-fallback-9.mp4',
        metadata: {
          probedAt: new Date().toISOString(),
          proxy: {
            status: 'failed',
            error: 'Proxy unavailable',
          },
        },
      };

      const resolved = resolveMediaPreviewSource(videoWithoutProxy);
      expect(resolved.source).toBe('original');
      expect(resolved.isProxy).toBe(false);
      expect(resolved.isFallback).toBe(true);
      expect(resolved.url).toBe('https://signed.r2.dev/raw/vid-fallback-9.mp4');
    });
  });

  describe('3. Processing State, Retry Capability & Polling Lifecycle', () => {
    it('10. processing state transitions and reflects active background operations accurately', () => {
      const assetId = 'vid-live-processing-10';
      const baseAsset: EditorMediaAsset = {
        id: assetId,
        storageKey: `raw/${userA_Id}/${assetId}.mp4`,
        originalFilename: 'live_pipeline.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 12000000,
        ingestionStatus: 'ready',
        hasAudio: true,
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      const store = useMediaProcessingStore.getState();

      // Initially pending
      expect(getMediaReadiness(baseAsset).status).toBe('pending');

      // When probe enters processing
      store.setJobState(assetId, 'probe', { status: 'processing' });
      const probeActive = getMediaReadiness(baseAsset);
      expect(probeActive.status).toBe('processing');
      expect(probeActive.processingDerivatives).toContain('probe');
      expect(probeActive.isFullyReady).toBe(false);

      // When probe finishes and proxy/thumbnail enter processing
      store.setJobState(assetId, 'probe', { status: 'ready' });
      store.setJobState(assetId, 'proxy', { status: 'processing' });
      store.setJobState(assetId, 'thumbnail', { status: 'queued' });
      const derivativesActive = getMediaReadiness(baseAsset);
      expect(derivativesActive.status).toBe('processing');
      expect(derivativesActive.isFullyReady).toBe(false);

      // When all complete
      store.setJobState(assetId, 'proxy', {
        status: 'ready',
        proxyUrl: 'https://signed.r2.dev/proxy.mp4',
      });
      store.setJobState(assetId, 'thumbnail', {
        status: 'ready',
        thumbnailUrl: 'https://signed.r2.dev/thumb.jpg',
      });
      const completed = getMediaReadiness(baseAsset);
      expect(completed.status).toBe('ready');
      expect(completed.isFullyReady).toBe(true);
    });

    it('11. failed state exposes retry capability via requestProcessing', async () => {
      const assetId = 'vid-retry-11';
      const store = useMediaProcessingStore.getState();

      // Mark thumbnail as failed
      store.setJobState(assetId, 'probe', { status: 'ready' });
      store.setJobState(assetId, 'proxy', { status: 'ready' });
      store.setJobState(assetId, 'thumbnail', {
        status: 'failed',
        error: 'Temporary R2 upload glitch',
      });

      const asset: EditorMediaAsset = {
        id: assetId,
        storageKey: `raw/${userA_Id}/${assetId}.mp4`,
        originalFilename: 'retryable_clip.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 10000000,
        ingestionStatus: 'ready',
        hasAudio: true,
        createdAt: new Date().toISOString(),
      };

      const failedReadiness = getMediaReadiness(asset);
      expect(failedReadiness.hasFailedDerivatives).toBe(true);
      expect(failedReadiness.failedDerivatives).toEqual(['thumbnail']);

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/process')) {
          return {
            ok: true,
            status: 202,
            json: async () => ({
              jobId: `media:${assetId}:thumbnail`,
              status: 'waiting',
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: `media:${assetId}:thumbnail`,
            state: 'active',
            attemptsMade: 1,
          }),
        };
      });

      const retryRes = await store.requestProcessing(
        assetId,
        'thumbnail',
        'alice-valid-token',
        mockFetch as any,
      );

      expect(retryRes).not.toBeNull();
      expect(retryRes?.jobId).toBe(`media:${assetId}:thumbnail`);
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/media/${assetId}/process`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ operation: 'thumbnail' }),
        }),
      );

      store.stopAllPolling();
    });

    it('12. polling stops automatically when processing completes or fails permanently', async () => {
      const assetId = 'aud-poll-complete-12';
      const jobId = `media:${assetId}:waveform`;
      const store = useMediaProcessingStore.getState();

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes(`/api/media/jobs/${jobId}`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: jobId,
              state: 'completed',
              attemptsMade: 1,
              returnvalue: { success: true },
            }),
          };
        }
        if (url.includes(`/api/media/${assetId}/waveform`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              assetId,
              sampleCount: 1000,
              durationMs: 15000,
              samples: [0.1, 0.5, 0.8],
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      store.pollJobStatus(jobId, assetId, 'waveform', 'alice-valid-token', mockFetch as any, 50);

      // Wait briefly for immediate checkJob() to resolve
      await new Promise((r) => setTimeout(r, 40));

      expect(store.getJobState(assetId, 'waveform').status).toBe('ready');
      expect(store.isPolling(jobId)).toBe(false);
      expect(store.getActivePollingCount()).toBe(0);
    });

    it('13. polling cleanup occurs when stopAssetPolling / unmount cleanup is invoked', () => {
      const assetId = 'vid-unmount-13';
      const store = useMediaProcessingStore.getState();

      const neverResolveFetch = vi.fn().mockImplementation(
        async () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  json: async () => ({ id: `media:${assetId}:proxy`, state: 'active' }),
                }),
              200,
            ),
          ),
      );

      store.setJobState(assetId, 'proxy', { jobId: `media:${assetId}:proxy`, status: 'processing' });
      store.pollJobStatus(
        `media:${assetId}:proxy`,
        assetId,
        'proxy',
        'alice-valid-token',
        neverResolveFetch as any,
        5000,
      );
      store.pollJobStatus(
        `media:${assetId}:thumbnail`,
        assetId,
        'thumbnail',
        'alice-valid-token',
        neverResolveFetch as any,
        5000,
      );

      expect(store.isPolling(`media:${assetId}:proxy`)).toBe(true);
      expect(store.isPolling(`media:${assetId}:thumbnail`)).toBe(true);
      expect(store.getActivePollingCount()).toBe(2);

      // Simulate component unmount cleanup via stopAssetPolling
      store.stopAssetPolling(assetId);

      expect(store.isPolling(`media:${assetId}:proxy`)).toBe(false);
      expect(store.isPolling(`media:${assetId}:thumbnail`)).toBe(false);
      expect(store.getActivePollingCount()).toBe(0);
    });

    it('14. no duplicate polling loops are created for the same job ID', () => {
      const assetId = 'vid-dedup-poll-14';
      const jobId = `media:${assetId}:proxy`;
      const store = useMediaProcessingStore.getState();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: jobId, state: 'active', attemptsMade: 1 }),
      });

      store.pollJobStatus(jobId, assetId, 'proxy', 'alice-valid-token', mockFetch as any, 5000);
      store.pollJobStatus(jobId, assetId, 'proxy', 'alice-valid-token', mockFetch as any, 5000);
      store.pollJobStatus(jobId, assetId, 'proxy', 'alice-valid-token', mockFetch as any, 5000);

      expect(store.getActivePollingCount()).toBe(1);
      // Only the first call triggers immediate checkJob
      expect(mockFetch).toHaveBeenCalledTimes(1);

      store.stopAllPolling();
    });
  });

  describe('4. Security & Authorization Preservation', () => {
    it('15. existing authentication and IDOR authorization protections remain intact across media and derivative endpoints', async () => {
      if (!db) return;

      const aliceAssetId = 'aaaaaaaa-8888-8888-8888-aaaaaaaa8881';
      await db
        .insert(mediaAssets)
        .values({
          id: aliceAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${aliceAssetId}.mp4`,
          originalFilename: 'alice_private_cut.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 15000000,
          ingestionStatus: 'ready',
          durationMs: 10000,
          width: 1920,
          height: 1080,
          thumbnailUrl: `thumbnails/${userA_Id}/${aliceAssetId}.jpg`,
          metadata: {
            probedAt: new Date().toISOString(),
            proxy: {
              storageKey: `proxies/${userA_Id}/${aliceAssetId}_720p.mp4`,
              status: 'ready',
            },
            thumbnail: {
              storageKey: `thumbnails/${userA_Id}/${aliceAssetId}.jpg`,
              status: 'ready',
            },
          },
        })
        .onConflictDoNothing();

      // Unauthenticated requests are rejected with 401
      const unauthList = await request(app).get('/api/media');
      expect(unauthList.status).toBe(401);

      // Bob cannot access Alice's proxy download URL, thumbnail URL, or status (IDOR protection)
      const bobProxyRes = await request(app)
        .get(`/api/media/${aliceAssetId}/download-url?type=proxy`)
        .set('Authorization', 'Bearer bob-valid-token');
      expect(bobProxyRes.status).toBe(404);

      const bobThumbRes = await request(app)
        .get(`/api/media/${aliceAssetId}/thumbnail-url`)
        .set('Authorization', 'Bearer bob-valid-token');
      expect(bobThumbRes.status).toBe(404);

      // Alice can access her own media list with full derivative metadata and signed proxy URL
      const aliceListRes = await request(app)
        .get('/api/media')
        .set('Authorization', 'Bearer alice-valid-token');
      expect(aliceListRes.status).toBe(200);
      const listedAsset = aliceListRes.body.assets.find((a: any) => a.id === aliceAssetId);
      expect(listedAsset).toBeDefined();
      expect(listedAsset.metadata?.proxy?.status).toBe('ready');

      const aliceProxyRes = await request(app)
        .get(`/api/media/${aliceAssetId}/download-url?type=proxy`)
        .set('Authorization', 'Bearer alice-valid-token');
      expect(aliceProxyRes.status).toBe(200);
      expect(aliceProxyRes.body.isProxy).toBe(true);
      expect(aliceProxyRes.body.downloadUrl).toContain(`proxies/${userA_Id}/${aliceAssetId}_720p.mp4`);
    });
  });
});
