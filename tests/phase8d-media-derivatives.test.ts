import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET_NAME = 'test-bucket';

import { config } from '../server/config/env';
config.r2.accountId = 'test-account-id';
config.r2.accessKeyId = 'test-access-key';
config.r2.secretAccessKey = 'test-secret-key';

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

// Mock R2 storage service
vi.mock('../server/services/r2StorageService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/services/r2StorageService')>();
  return {
    ...actual,
    isR2Configured: vi.fn(() => true),
    downloadR2ObjectToFile: vi.fn(async (_storageKey: string, destPath: string) => {
      await fs.promises.writeFile(destPath, 'mock-binary-source-media');
    }),
    uploadLocalFileToR2: vi.fn(async () => {}),
    uploadBufferToR2: vi.fn(async () => {}),
    downloadR2ObjectToBuffer: vi.fn(async () => {
      return Buffer.from(
        JSON.stringify({
          assetId: 'cached-id',
          sampleCount: 1000,
          durationMs: 60000,
          samples: new Array(1000).fill(0.5),
        }),
      );
    }),
    generatePresignedDownloadUrl: vi.fn(async (params: { storageKey: string }) => ({
      downloadUrl: `https://signed-r2-download.com/${params.storageKey}?token=mock_signed_token`,
      expiresInSeconds: 3600,
    })),
  };
});

import request from 'supertest';
import { createExpressApp } from '../server/app';
import { getDb } from '../server/db';
import { users } from '../server/db/schema/users';
import { mediaAssets } from '../server/db/schema/media';
import { inArray } from 'drizzle-orm';
import {
  calculateThumbnailDimensions,
  selectThumbnailTimestamp,
  buildFFmpegThumbnailArgs,
  thumbnailEngine,
  MediaThumbnailError,
} from '../server/services/mediaThumbnailService';
import {
  computeNormalizedWaveform,
  buildFFmpegWaveformArgs,
  waveformEngine,
  MediaWaveformError,
  DEFAULT_WAVEFORM_SAMPLE_COUNT,
} from '../server/services/mediaWaveformService';
import * as r2StorageServiceModule from '../server/services/r2StorageService';
import { getMediaIngestionStatus } from '../server/services/mediaIngestionService';

describe('Phase 8D: Waveform and Thumbnail Generation Foundation', () => {
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

    // Clean up test media assets for test users to ensure clean state on every test
    await db.delete(mediaAssets).where(inArray(mediaAssets.userId, [userA_Id, userB_Id]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Thumbnail Dimensions & Timing Logic', () => {
    it('scales 1080p (1920x1080) to max 640px width preserving 16:9 ratio', () => {
      const result = calculateThumbnailDimensions(1920, 1080);
      expect(result.width).toBe(640);
      expect(result.height).toBe(360);
      expect(result.scaled).toBe(true);
    });

    it('scales 9:16 vertical video (1080x1920) preserving aspect ratio', () => {
      const result = calculateThumbnailDimensions(1080, 1920);
      expect(result.width).toBe(640);
      expect(result.height).toBe(1138); // Even height
      expect(result.height % 2).toBe(0);
      expect(result.scaled).toBe(true);
    });

    it('scales 1:1 square video (1080x1080) preserving aspect ratio', () => {
      const result = calculateThumbnailDimensions(1080, 1080);
      expect(result.width).toBe(640);
      expect(result.height).toBe(640);
      expect(result.scaled).toBe(true);
    });

    it('does NOT upscale videos smaller than 640px width (480x270)', () => {
      const result = calculateThumbnailDimensions(480, 270);
      expect(result.width).toBe(480);
      expect(result.height).toBe(270);
      expect(result.scaled).toBe(false);
    });

    it('does NOT upscale small 320x240 video', () => {
      const result = calculateThumbnailDimensions(320, 240);
      expect(result.width).toBe(320);
      expect(result.height).toBe(240);
      expect(result.scaled).toBe(false);
    });

    it('handles invalid or zero dimensions with safe fallback', () => {
      const result = calculateThumbnailDimensions(null, null);
      expect(result.width).toBe(640);
      expect(result.height).toBe(360);
      expect(result.scaled).toBe(true);
    });

    it('selects deterministic seek timestamp based on duration', () => {
      // 0s or missing
      expect(selectThumbnailTimestamp(0)).toBe(0.0);
      expect(selectThumbnailTimestamp(null)).toBe(0.0);

      // Very short video (<= 1.0s)
      expect(selectThumbnailTimestamp(800)).toBeCloseTo(0.08, 2);

      // Short video (<= 4.0s)
      expect(selectThumbnailTimestamp(2000)).toBe(0.5);

      // Standard video (> 4.0s)
      expect(selectThumbnailTimestamp(15000)).toBe(1.0);
    });
  });

  describe('2. Waveform Computation & Extraction Logic', () => {
    it('produces exactly 1,000 deterministic samples', () => {
      const pcmData = new Int16Array(8000);
      for (let i = 0; i < pcmData.length; i++) {
        pcmData[i] = Math.sin(i / 10) * 16384;
      }

      const samples = computeNormalizedWaveform(pcmData, DEFAULT_WAVEFORM_SAMPLE_COUNT);
      expect(samples.length).toBe(1000);
    });

    it('normalizes amplitude values strictly into [0.0, 1.0]', () => {
      const pcmData = new Int16Array(4000);
      for (let i = 0; i < pcmData.length; i++) {
        pcmData[i] = 32767; // Full scale amplitude
      }

      const samples = computeNormalizedWaveform(pcmData, 100);
      expect(samples.length).toBe(100);
      for (const val of samples) {
        expect(val).toBeGreaterThanOrEqual(0.0);
        expect(val).toBeLessThanOrEqual(1.0);
        expect(val).toBe(1.0);
      }
    });

    it('handles silence by returning all 0.0 values', () => {
      const silence = new Int16Array(4000).fill(0);
      const samples = computeNormalizedWaveform(silence, 50);
      expect(samples.length).toBe(50);
      expect(samples.every((val) => val === 0.0)).toBe(true);
    });

    it('handles empty PCM buffer without throwing', () => {
      const empty = new Int16Array(0);
      const samples = computeNormalizedWaveform(empty, 50);
      expect(samples.length).toBe(50);
      expect(samples.every((val) => val === 0.0)).toBe(true);
    });
  });

  describe('3. FFmpeg Command Construction', () => {
    it('builds discrete thumbnail arguments with fast seeking and JPEG output', () => {
      const args = buildFFmpegThumbnailArgs({
        inputPath: '/tmp/video.mp4',
        outputPath: '/tmp/thumb.jpg',
        targetWidth: 640,
        targetHeight: 360,
        seekTimestampSeconds: 1.0,
      });

      expect(args).toContain('-ss');
      expect(args).toContain('1.000');
      expect(args).toContain('-i');
      expect(args).toContain('/tmp/video.mp4');
      expect(args).toContain('-vframes');
      expect(args).toContain('1');
      expect(args).toContain('-c:v');
      expect(args).toContain('mjpeg');
      expect(args).toContain('-vf');
      expect(args).toContain('scale=640:360');
      expect(args).toContain('/tmp/thumb.jpg');
    });

    it('builds discrete waveform arguments downsampling audio to raw mono PCM', () => {
      const args = buildFFmpegWaveformArgs('/tmp/audio.mp3', '/tmp/audio.raw');

      expect(args).toContain('-i');
      expect(args).toContain('/tmp/audio.mp3');
      expect(args).toContain('-vn');
      expect(args).toContain('-ac');
      expect(args).toContain('1');
      expect(args).toContain('-ar');
      expect(args).toContain('4000');
      expect(args).toContain('-f');
      expect(args).toContain('s16le');
      expect(args).toContain('/tmp/audio.raw');
    });
  });

  describe('4. API: Thumbnail Generation (POST /api/media/:assetId/thumbnail)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/media/any-asset-id/thumbnail')
        .send();

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/);
    });

    it('returns 404 for nonexistent asset', async () => {
      const res = await request(app)
        .post('/api/media/00000000-0000-0000-0000-000000000000/thumbnail')
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('enforces IDOR protection: Bob cannot generate thumbnail for Alice’s video', async () => {
      if (!db) return;

      const aliceVideoId = '77777777-7777-7777-7777-777777777771';
      await db
        .insert(mediaAssets)
        .values({
          id: aliceVideoId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${aliceVideoId}.mp4`,
          originalFilename: 'alice_video.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 20000000,
          durationMs: 12000,
          width: 1920,
          height: 1080,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${aliceVideoId}/thumbnail`)
        .set('Authorization', 'Bearer bob-valid-token') // Bob attempting IDOR
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });

    it('rejects non-video media (audio files) with 400 Bad Request', async () => {
      if (!db) return;

      const audioAssetId = '77777777-7777-7777-7777-777777777772';
      await db
        .insert(mediaAssets)
        .values({
          id: audioAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${audioAssetId}.mp3`,
          originalFilename: 'podcast_episode.mp3',
          mimeType: 'audio/mpeg',
          fileSizeBytes: 5000000,
          durationMs: 120000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${audioAssetId}/thumbnail`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a video file/i);
    });

    it('generates thumbnail, uploads to R2, updates metadata, and preserves existing probe/proxy data', async () => {
      if (!db) return;

      const videoAssetId = '77777777-7777-7777-7777-777777777773';
      await db
        .insert(mediaAssets)
        .values({
          id: videoAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${videoAssetId}.mp4`,
          originalFilename: 'nature_scenery.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 15000000,
          durationMs: 10000,
          width: 1920,
          height: 1080,
          fps: '30.00',
          ingestionStatus: 'ready',
          metadata: {
            videoCodec: 'h264',
            audioCodec: 'aac',
            proxy: {
              storageKey: `proxies/${userA_Id}/${videoAssetId}_720p.mp4`,
              status: 'ready',
            },
          },
        })
        .onConflictDoNothing();

      const ffmpegSpy = vi.spyOn(thumbnailEngine, 'runFFmpeg').mockImplementationOnce(async (args) => {
        const outputPath = args[args.length - 1];
        await fs.promises.writeFile(outputPath, 'fake-jpeg-image-bytes');
      });

      const uploadSpy = vi.spyOn(thumbnailEngine, 'uploadLocalFileToR2').mockImplementation(async () => {});

      const res = await request(app)
        .post(`/api/media/${videoAssetId}/thumbnail`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/thumbnail generated successfully/i);
      expect(res.body.thumbnail).toBeDefined();
      expect(res.body.thumbnail.width).toBe(640);
      expect(res.body.thumbnail.height).toBe(360);
      expect(res.body.thumbnail.storageKey).toBe(`thumbnails/${userA_Id}/${videoAssetId}.jpg`);
      expect(res.body.thumbnail.status).toBe('ready');

      // Verify R2 upload
      expect(uploadSpy).toHaveBeenCalledWith(
        expect.any(String),
        `thumbnails/${userA_Id}/${videoAssetId}.jpg`,
        'image/jpeg',
      );

      // Verify DB persistence and probe/proxy preservation
      const updatedAsset = await getMediaIngestionStatus(videoAssetId, userA_Id);
      expect(updatedAsset.ingestionStatus).toBe('ready');
      expect(updatedAsset.thumbnailUrl).toBe(`thumbnails/${userA_Id}/${videoAssetId}.jpg`);
      expect(updatedAsset.metadata.videoCodec).toBe('h264'); // Probe data intact
      expect(updatedAsset.metadata.proxy).toBeDefined(); // Proxy data intact
      expect((updatedAsset.metadata.proxy as any).status).toBe('ready');
      expect(updatedAsset.metadata.thumbnail).toBeDefined();

      ffmpegSpy.mockRestore();
    });

    it('is idempotent: returns existing thumbnail without re-invoking FFmpeg', async () => {
      if (!db) return;

      const videoAssetId = '77777777-7777-7777-7777-777777777774';
      await db
        .insert(mediaAssets)
        .values({
          id: videoAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${videoAssetId}.mp4`,
          originalFilename: 'cached_thumb.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10000000,
          durationMs: 8000,
          width: 1280,
          height: 720,
          ingestionStatus: 'ready',
          thumbnailUrl: `thumbnails/${userA_Id}/${videoAssetId}.jpg`,
          metadata: {
            thumbnail: {
              storageKey: `thumbnails/${userA_Id}/${videoAssetId}.jpg`,
              width: 640,
              height: 360,
              mimeType: 'image/jpeg',
              fileSizeBytes: 24500,
              status: 'ready',
              timestampSeconds: 1.0,
            },
          },
        })
        .onConflictDoNothing();

      const ffmpegSpy = vi.spyOn(thumbnailEngine, 'runFFmpeg');

      const res = await request(app)
        .post(`/api/media/${videoAssetId}/thumbnail`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.thumbnail.status).toBe('ready');
      expect(res.body.thumbnail.storageKey).toBe(`thumbnails/${userA_Id}/${videoAssetId}.jpg`);
      // FFmpeg should NOT be called because thumbnail is already ready
      expect(ffmpegSpy).not.toHaveBeenCalled();

      ffmpegSpy.mockRestore();
    });

    it('handles FFmpeg failure without destroying overall asset ready status', async () => {
      if (!db) return;

      const failVideoId = '77777777-7777-7777-7777-777777777775';
      await db
        .insert(mediaAssets)
        .values({
          id: failVideoId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${failVideoId}.mp4`,
          originalFilename: 'fail_thumb.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 5000,
          ingestionStatus: 'ready',
          width: 1280,
          height: 720,
        })
        .onConflictDoNothing();

      const ffmpegSpy = vi.spyOn(thumbnailEngine, 'runFFmpeg').mockRejectedValueOnce(
        new Error('FFmpeg error: corrupt moov atom'),
      );

      const res = await request(app)
        .post(`/api/media/${failVideoId}/thumbnail`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/corrupt moov atom/i);

      // Verify overall asset status remains 'ready' (derivative failure does not destroy asset status)
      const asset = await getMediaIngestionStatus(failVideoId, userA_Id);
      expect(asset.ingestionStatus).toBe('ready');
      expect(asset.metadata.thumbnail).toBeDefined();
      expect((asset.metadata.thumbnail as any).status).toBe('failed');

      ffmpegSpy.mockRestore();
    });

    it('guarantees temporary-file cleanup on thumbnail generation error', async () => {
      if (!db) return;

      const cleanupAssetId = '77777777-7777-7777-7777-777777777776';
      await db
        .insert(mediaAssets)
        .values({
          id: cleanupAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${cleanupAssetId}.mp4`,
          originalFilename: 'cleanup_video.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 5000,
          ingestionStatus: 'ready',
          width: 1280,
          height: 720,
        })
        .onConflictDoNothing();

      let createdInput = '';
      let createdOutput = '';

      const downloadSpy = vi.spyOn(r2StorageServiceModule, 'downloadR2ObjectToFile').mockImplementationOnce(
        async (_key, dest) => {
          createdInput = dest;
          await fs.promises.writeFile(dest, 'mock-video-bytes');
        },
      );

      const ffmpegSpy = vi.spyOn(thumbnailEngine, 'runFFmpeg').mockImplementationOnce(async (args) => {
        createdOutput = args[args.length - 1];
        await fs.promises.writeFile(createdOutput, 'mock-partial-thumb');
        throw new Error('Simulation crash');
      });

      const res = await request(app)
        .post(`/api/media/${cleanupAssetId}/thumbnail`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(422);
      expect(createdInput).toBeTruthy();
      expect(fs.existsSync(createdInput)).toBe(false);
      expect(createdOutput).toBeTruthy();
      expect(fs.existsSync(createdOutput)).toBe(false);

      downloadSpy.mockRestore();
      ffmpegSpy.mockRestore();
    });
  });

  describe('5. API: Waveform Generation (POST /api/media/:assetId/waveform)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/media/any-asset-id/waveform')
        .send();

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/);
    });

    it('returns 404 for nonexistent asset', async () => {
      const res = await request(app)
        .post('/api/media/00000000-0000-0000-0000-000000000000/waveform')
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('enforces IDOR protection: Bob cannot generate waveform for Alice’s audio', async () => {
      if (!db) return;

      const aliceAudioId = '77777777-7777-7777-7777-777777777777';
      await db
        .insert(mediaAssets)
        .values({
          id: aliceAudioId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${aliceAudioId}.mp3`,
          originalFilename: 'alice_voiceover.mp3',
          mimeType: 'audio/mpeg',
          fileSizeBytes: 2000000,
          durationMs: 45000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${aliceAudioId}/waveform`)
        .set('Authorization', 'Bearer bob-valid-token') // Bob attempting IDOR
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });

    it('rejects non-audio media (video files) with 400 Bad Request', async () => {
      if (!db) return;

      const videoAssetId = '77777777-7777-7777-7777-777777777778';
      await db
        .insert(mediaAssets)
        .values({
          id: videoAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${videoAssetId}.mp4`,
          originalFilename: 'sample_video.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10000000,
          durationMs: 5000,
          ingestionStatus: 'ready',
          metadata: { videoCodec: 'h264' },
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${videoAssetId}/waveform`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not an audio file/i);
    });

    it('generates waveform, uploads JSON to R2, updates metadata, and preserves existing probe data', async () => {
      if (!db) return;

      const audioAssetId = '77777777-7777-7777-7777-777777777779';
      await db
        .insert(mediaAssets)
        .values({
          id: audioAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${audioAssetId}.wav`,
          originalFilename: 'studio_master.wav',
          mimeType: 'audio/wav',
          fileSizeBytes: 25000000,
          durationMs: 60000,
          ingestionStatus: 'ready',
          metadata: {
            audioCodec: 'pcm_s16le',
            audioChannels: 2,
            sampleRate: 48000,
          },
        })
        .onConflictDoNothing();

      // Mock runFFmpeg to write raw 16-bit PCM bytes
      const ffmpegSpy = vi.spyOn(waveformEngine, 'runFFmpeg').mockImplementationOnce(async (args) => {
        const outputPath = args[args.length - 1];
        // Create 2000 samples of 16-bit PCM (4000 bytes)
        const pcmBuffer = Buffer.alloc(4000);
        for (let i = 0; i < 2000; i++) {
          pcmBuffer.writeInt16LE(Math.floor(Math.sin(i / 10) * 16384), i * 2);
        }
        await fs.promises.writeFile(outputPath, pcmBuffer);
      });

      const uploadBufferSpy = vi.spyOn(waveformEngine, 'uploadBufferToR2').mockImplementation(async () => {});

      const res = await request(app)
        .post(`/api/media/${audioAssetId}/waveform`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/waveform generated successfully/i);
      expect(res.body.waveform).toBeDefined();
      expect(res.body.waveform.sampleCount).toBe(1000);
      expect(res.body.waveform.durationMs).toBe(60000);
      expect(res.body.waveform.storageKey).toBe(`waveforms/${userA_Id}/${audioAssetId}.json`);
      expect(res.body.waveform.status).toBe('ready');

      expect(res.body.data).toBeDefined();
      expect(res.body.data.samples.length).toBe(1000);

      // Verify R2 upload
      expect(uploadBufferSpy).toHaveBeenCalledWith(
        expect.any(Buffer),
        `waveforms/${userA_Id}/${audioAssetId}.json`,
        'application/json',
      );

      // Verify DB persistence and probe data retention
      const updatedAsset = await getMediaIngestionStatus(audioAssetId, userA_Id);
      expect(updatedAsset.waveformUrl).toBe(`waveforms/${userA_Id}/${audioAssetId}.json`);
      expect(updatedAsset.metadata.audioCodec).toBe('pcm_s16le'); // Probe data preserved
      expect(updatedAsset.metadata.waveform).toBeDefined();
      expect((updatedAsset.metadata.waveform as any).sampleCount).toBe(1000);

      ffmpegSpy.mockRestore();
    });

    it('is idempotent: returns existing waveform without re-invoking FFmpeg', async () => {
      if (!db) return;

      const audioAssetId = '77777777-7777-7777-7777-777777777780';
      await db
        .insert(mediaAssets)
        .values({
          id: audioAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${audioAssetId}.mp3`,
          originalFilename: 'cached_wave.mp3',
          mimeType: 'audio/mpeg',
          fileSizeBytes: 2000000,
          durationMs: 30000,
          ingestionStatus: 'ready',
          waveformUrl: `waveforms/${userA_Id}/${audioAssetId}.json`,
          metadata: {
            waveform: {
              storageKey: `waveforms/${userA_Id}/${audioAssetId}.json`,
              sampleCount: 1000,
              durationMs: 30000,
              mimeType: 'application/json',
              fileSizeBytes: 5200,
              status: 'ready',
            },
          },
        })
        .onConflictDoNothing();

      const ffmpegSpy = vi.spyOn(waveformEngine, 'runFFmpeg');

      const res = await request(app)
        .post(`/api/media/${audioAssetId}/waveform`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.waveform.status).toBe('ready');
      expect(res.body.data.sampleCount).toBe(1000);
      expect(ffmpegSpy).not.toHaveBeenCalled();

      ffmpegSpy.mockRestore();
    });

    it('handles FFmpeg failure without destroying overall asset ready status', async () => {
      if (!db) return;

      const failAudioId = '77777777-7777-7777-7777-777777777781';
      await db
        .insert(mediaAssets)
        .values({
          id: failAudioId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${failAudioId}.mp3`,
          originalFilename: 'corrupt_audio.mp3',
          mimeType: 'audio/mpeg',
          fileSizeBytes: 1000,
          ingestionStatus: 'ready',
          durationMs: 10000,
        })
        .onConflictDoNothing();

      const ffmpegSpy = vi.spyOn(waveformEngine, 'runFFmpeg').mockRejectedValueOnce(
        new Error('FFmpeg error: corrupt MP3 header'),
      );

      const res = await request(app)
        .post(`/api/media/${failAudioId}/waveform`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/corrupt MP3 header/i);

      // Verify asset status remains 'ready'
      const asset = await getMediaIngestionStatus(failAudioId, userA_Id);
      expect(asset.ingestionStatus).toBe('ready');
      expect(asset.metadata.waveform).toBeDefined();
      expect((asset.metadata.waveform as any).status).toBe('failed');

      ffmpegSpy.mockRestore();
    });

    it('guarantees temporary-file cleanup on waveform generation failure', async () => {
      if (!db) return;

      const cleanupAudioId = '77777777-7777-7777-7777-777777777782';
      await db
        .insert(mediaAssets)
        .values({
          id: cleanupAudioId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${cleanupAudioId}.mp3`,
          originalFilename: 'cleanup_wave.mp3',
          mimeType: 'audio/mpeg',
          fileSizeBytes: 5000,
          ingestionStatus: 'ready',
          durationMs: 20000,
        })
        .onConflictDoNothing();

      let createdInput = '';
      let createdOutput = '';

      const downloadSpy = vi.spyOn(r2StorageServiceModule, 'downloadR2ObjectToFile').mockImplementationOnce(
        async (_key, dest) => {
          createdInput = dest;
          await fs.promises.writeFile(dest, 'mock-audio-bytes');
        },
      );

      const ffmpegSpy = vi.spyOn(waveformEngine, 'runFFmpeg').mockImplementationOnce(async (args) => {
        createdOutput = args[args.length - 1];
        await fs.promises.writeFile(createdOutput, 'mock-raw-data');
        throw new Error('Simulation crash during waveform');
      });

      const res = await request(app)
        .post(`/api/media/${cleanupAudioId}/waveform`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(422);
      expect(createdInput).toBeTruthy();
      expect(fs.existsSync(createdInput)).toBe(false);
      expect(createdOutput).toBeTruthy();
      expect(fs.existsSync(createdOutput)).toBe(false);

      downloadSpy.mockRestore();
      ffmpegSpy.mockRestore();
    });
  });

  describe('6. Retrieval Endpoints', () => {
    it('returns signed download URL for existing thumbnail (GET /api/media/:assetId/thumbnail-url)', async () => {
      if (!db) return;

      const thumbAssetId = '77777777-7777-7777-7777-777777777783';
      await db
        .insert(mediaAssets)
        .values({
          id: thumbAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${thumbAssetId}.mp4`,
          originalFilename: 'vlog_intro.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10000000,
          ingestionStatus: 'ready',
          thumbnailUrl: `thumbnails/${userA_Id}/${thumbAssetId}.jpg`,
          metadata: {
            thumbnail: {
              storageKey: `thumbnails/${userA_Id}/${thumbAssetId}.jpg`,
              width: 640,
              height: 360,
              status: 'ready',
            },
          },
        })
        .onConflictDoNothing();

      const res = await request(app)
        .get(`/api/media/${thumbAssetId}/thumbnail-url`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.assetId).toBe(thumbAssetId);
      expect(res.body.mimeType).toBe('image/jpeg');
      expect(res.body.downloadUrl).toBeDefined();
      expect(res.body.downloadUrl).toContain(`thumbnails/${userA_Id}/${thumbAssetId}.jpg`);
    });

    it('returns 404 when thumbnail is not yet generated', async () => {
      if (!db) return;

      const noThumbId = '77777777-7777-7777-7777-777777777784';
      await db
        .insert(mediaAssets)
        .values({
          id: noThumbId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${noThumbId}.mp4`,
          originalFilename: 'no_thumb.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10000000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const res = await request(app)
        .get(`/api/media/${noThumbId}/thumbnail-url`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/thumbnail has not yet been generated/i);
    });

    it('returns waveform JSON for existing waveform (GET /api/media/:assetId/waveform)', async () => {
      if (!db) return;

      const waveAssetId = '77777777-7777-7777-7777-777777777785';
      await db
        .insert(mediaAssets)
        .values({
          id: waveAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${waveAssetId}.mp3`,
          originalFilename: 'music_track.mp3',
          mimeType: 'audio/mpeg',
          fileSizeBytes: 5000000,
          durationMs: 90000,
          ingestionStatus: 'ready',
          waveformUrl: `waveforms/${userA_Id}/${waveAssetId}.json`,
          metadata: {
            waveform: {
              storageKey: `waveforms/${userA_Id}/${waveAssetId}.json`,
              sampleCount: 1000,
              durationMs: 90000,
              status: 'ready',
            },
          },
        })
        .onConflictDoNothing();

      const res = await request(app)
        .get(`/api/media/${waveAssetId}/waveform`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.sampleCount).toBe(1000);
      expect(res.body.samples).toBeDefined();
    });

    it('returns 404 when waveform is not yet generated', async () => {
      if (!db) return;

      const noWaveId = '77777777-7777-7777-7777-777777777786';
      await db
        .insert(mediaAssets)
        .values({
          id: noWaveId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${noWaveId}.mp3`,
          originalFilename: 'no_wave.mp3',
          mimeType: 'audio/mpeg',
          fileSizeBytes: 5000000,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const res = await request(app)
        .get(`/api/media/${noWaveId}/waveform`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/waveform has not yet been generated/i);
    });
  });
});
