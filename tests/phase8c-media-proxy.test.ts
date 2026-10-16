import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

// Mock R2 Storage Service
vi.mock('../server/services/r2StorageService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/services/r2StorageService')>();
  return {
    ...actual,
    isR2Configured: vi.fn(() => true),
    downloadR2ObjectToFile: vi.fn(async (storageKey: string, destPath: string) => {
      await fs.promises.writeFile(destPath, 'mock-binary-source-video');
    }),
    uploadLocalFileToR2: vi.fn(async (localFilePath: string, storageKey: string) => {
      // Mock upload success
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
import {
  calculateProxyDimensions,
  buildFFmpegProxyArgs,
  proxyEngine,
  MediaProxyError,
} from '../server/services/mediaProxyService';
import * as r2StorageServiceModule from '../server/services/r2StorageService';
import { getMediaIngestionStatus } from '../server/services/mediaIngestionService';

describe('Phase 8C: Media Proxy Generation Foundation', () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Proxy Dimensions & Scaling Logic', () => {
    it('scales 1080p (1920x1080) down to 720p (1280x720)', () => {
      const result = calculateProxyDimensions(1920, 1080);
      expect(result.width).toBe(1280);
      expect(result.height).toBe(720);
      expect(result.scaled).toBe(true);
    });

    it('scales 4K (3840x2160) down to 720p (1280x720)', () => {
      const result = calculateProxyDimensions(3840, 2160);
      expect(result.width).toBe(1280);
      expect(result.height).toBe(720);
      expect(result.scaled).toBe(true);
    });

    it('preserves aspect ratio for 9:16 vertical video (1080x1920)', () => {
      const result = calculateProxyDimensions(1080, 1920);
      expect(result.height).toBe(720);
      expect(result.width).toBe(404); // Even width preserved for 9:16
      expect(result.width % 2).toBe(0);
      expect(result.scaled).toBe(true);
    });

    it('preserves aspect ratio for 1:1 square video (1080x1080)', () => {
      const result = calculateProxyDimensions(1080, 1080);
      expect(result.width).toBe(720);
      expect(result.height).toBe(720);
      expect(result.scaled).toBe(true);
    });

    it('does NOT upscale videos smaller than 720p (640x360)', () => {
      const result = calculateProxyDimensions(640, 360);
      expect(result.width).toBe(640);
      expect(result.height).toBe(360);
      expect(result.scaled).toBe(false);
    });

    it('does NOT upscale 480p videos (854x480)', () => {
      const result = calculateProxyDimensions(854, 480);
      expect(result.width).toBe(854);
      expect(result.height).toBe(480);
      expect(result.scaled).toBe(false);
    });

    it('handles invalid or missing dimensions gracefully', () => {
      const resultNull = calculateProxyDimensions(null, null);
      expect(resultNull.width).toBe(1280);
      expect(resultNull.height).toBe(720);
      expect(resultNull.scaled).toBe(true);

      const resultZero = calculateProxyDimensions(0, 0);
      expect(resultZero.width).toBe(1280);
      expect(resultZero.height).toBe(720);
    });
  });

  describe('2. FFmpeg Command Construction', () => {
    it('builds discrete arguments with web-optimization and H.264 video codec', () => {
      const args = buildFFmpegProxyArgs({
        inputPath: '/tmp/input.mp4',
        outputPath: '/tmp/output.mp4',
        targetWidth: 1280,
        targetHeight: 720,
        hasAudio: true,
      });

      expect(args).toContain('-i');
      expect(args).toContain('/tmp/input.mp4');
      expect(args).toContain('-c:v');
      expect(args).toContain('libx264');
      expect(args).toContain('-preset');
      expect(args).toContain('veryfast');
      expect(args).toContain('-pix_fmt');
      expect(args).toContain('yuv420p');
      expect(args).toContain('-vf');
      expect(args).toContain('scale=1280:720');
      expect(args).toContain('-movflags');
      expect(args).toContain('+faststart');
      expect(args).toContain('/tmp/output.mp4');
    });

    it('preserves audio when source contains audio', () => {
      const args = buildFFmpegProxyArgs({
        inputPath: '/tmp/input.mp4',
        outputPath: '/tmp/output.mp4',
        hasAudio: true,
      });

      expect(args).toContain('-c:a');
      expect(args).toContain('aac');
      expect(args).not.toContain('-an');
    });

    it('disables audio when source has no audio', () => {
      const args = buildFFmpegProxyArgs({
        inputPath: '/tmp/input.mp4',
        outputPath: '/tmp/output.mp4',
        hasAudio: false,
      });

      expect(args).toContain('-an');
      expect(args).not.toContain('-c:a');
    });
  });

  describe('3. API Endpoint (POST /api/media/:assetId/proxy)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/media/any-id/proxy')
        .send();

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/);
    });

    it('returns 404 for nonexistent asset ID', async () => {
      const res = await request(app)
        .post('/api/media/00000000-0000-0000-0000-000000000000/proxy')
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('enforces IDOR protection: Bob cannot generate proxy for Alice’s asset', async () => {
      if (!db) return;

      const aliceAssetId = '66666666-6666-6666-6666-666666666661';
      await db
        .insert(mediaAssets)
        .values({
          id: aliceAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${aliceAssetId}.mp4`,
          originalFilename: 'alice_source_video.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 25000000,
          ingestionStatus: 'ready',
          width: 1920,
          height: 1080,
          hasAudio: true,
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${aliceAssetId}/proxy`)
        .set('Authorization', 'Bearer bob-valid-token') // Bob attempting IDOR
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });

    it('rejects non-video media (images/audio) with 400 Bad Request', async () => {
      if (!db) return;

      const imageAssetId = '66666666-6666-6666-6666-666666666662';
      await db
        .insert(mediaAssets)
        .values({
          id: imageAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${imageAssetId}.jpg`,
          originalFilename: 'thumbnail.jpg',
          mimeType: 'image/jpeg',
          fileSizeBytes: 500000,
          ingestionStatus: 'ready',
          width: 1920,
          height: 1080,
          hasAudio: false,
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${imageAssetId}/proxy`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a video file/i);
    });

    it('successfully generates proxy, uploads to R2, persists metadata, and keeps probe data intact', async () => {
      if (!db) return;

      const videoAssetId = '66666666-6666-6666-6666-666666666663';
      await db
        .insert(mediaAssets)
        .values({
          id: videoAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${videoAssetId}.mov`,
          originalFilename: 'prores_master.mov',
          mimeType: 'video/quicktime',
          fileSizeBytes: 150000000,
          durationMs: 25000,
          width: 3840,
          height: 2160,
          fps: '29.97',
          hasAudio: true,
          ingestionStatus: 'ready',
          metadata: {
            videoCodec: 'prores',
            audioCodec: 'pcm_s16le',
            container: 'mov',
          },
        })
        .onConflictDoNothing();

      // Mock runFFmpeg to simulate fast transcoding creating output file
      const ffmpegSpy = vi.spyOn(proxyEngine, 'runFFmpeg').mockImplementationOnce(async (args) => {
        const outputPath = args[args.length - 1];
        await fs.promises.writeFile(outputPath, 'mock-transcoded-proxy-mp4-stream');
      });

      const uploadSpy = vi.spyOn(r2StorageServiceModule, 'uploadLocalFileToR2');

      const res = await request(app)
        .post(`/api/media/${videoAssetId}/proxy`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/proxy generated successfully/i);
      expect(res.body.proxy).toBeDefined();
      expect(res.body.proxy.width).toBe(1280);
      expect(res.body.proxy.height).toBe(720);
      expect(res.body.proxy.storageKey).toBe(`proxies/${userA_Id}/${videoAssetId}_720p.mp4`);
      expect(res.body.proxy.status).toBe('ready');

      // Verify R2 upload was invoked with correct key
      expect(uploadSpy).toHaveBeenCalledWith(
        expect.any(String),
        `proxies/${userA_Id}/${videoAssetId}_720p.mp4`,
        'video/mp4',
      );

      // Verify database persistence and probe data retention
      const persisted = await getMediaIngestionStatus(videoAssetId, userA_Id);
      expect(persisted.ingestionStatus).toBe('ready');
      expect(persisted.durationMs).toBe(25000);
      expect(persisted.fps).toBe(29.97);
      expect(persisted.metadata.videoCodec).toBe('prores'); // Existing probe metadata preserved!
      expect(persisted.metadata.audioCodec).toBe('pcm_s16le');
      expect(persisted.metadata.proxy).toBeDefined();
      expect((persisted.metadata.proxy as any).storageKey).toBe(`proxies/${userA_Id}/${videoAssetId}_720p.mp4`);
      expect((persisted.metadata.proxy as any).width).toBe(1280);
      expect((persisted.metadata.proxy as any).height).toBe(720);

      ffmpegSpy.mockRestore();
    });

    it('handles FFmpeg failure by marking asset as failed and returning 422', async () => {
      if (!db) return;

      const failAssetId = '66666666-6666-6666-6666-666666666664';
      await db
        .insert(mediaAssets)
        .values({
          id: failAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${failAssetId}.mp4`,
          originalFilename: 'broken_input.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1000,
          ingestionStatus: 'ready',
          width: 1920,
          height: 1080,
          hasAudio: false,
        })
        .onConflictDoNothing();

      const ffmpegSpy = vi.spyOn(proxyEngine, 'runFFmpeg').mockRejectedValueOnce(
        new MediaProxyError('FFmpeg proxy generation failed: Invalid data found when processing input', 422),
      );

      const res = await request(app)
        .post(`/api/media/${failAssetId}/proxy`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/Invalid data found/i);
      expect(res.body.ingestionStatus).toBe('failed');

      // Verify asset status in DB was updated to failed
      const failedAsset = await getMediaIngestionStatus(failAssetId, userA_Id);
      expect(failedAsset.ingestionStatus).toBe('failed');
      expect(failedAsset.metadata.lastError).toMatch(/Invalid data found/i);

      ffmpegSpy.mockRestore();
    });

    it('guarantees temporary-file cleanup in finally block even upon failure', async () => {
      if (!db) return;

      const cleanupAssetId = '66666666-6666-6666-6666-666666666665';
      await db
        .insert(mediaAssets)
        .values({
          id: cleanupAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${cleanupAssetId}.mp4`,
          originalFilename: 'cleanup_test.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 5000,
          ingestionStatus: 'ready',
          width: 1280,
          height: 720,
          hasAudio: false,
        })
        .onConflictDoNothing();

      let createdInputPath = '';
      let createdOutputPath = '';

      const downloadSpy = vi.spyOn(r2StorageServiceModule, 'downloadR2ObjectToFile').mockImplementationOnce(
        async (_key: string, destPath: string) => {
          createdInputPath = destPath;
          await fs.promises.writeFile(destPath, 'temp-source-media');
        },
      );

      const ffmpegSpy = vi.spyOn(proxyEngine, 'runFFmpeg').mockImplementationOnce(async (args) => {
        createdOutputPath = args[args.length - 1];
        await fs.promises.writeFile(createdOutputPath, 'temp-proxy-data');
        throw new Error('Catastrophic transcode crash');
      });

      const res = await request(app)
        .post(`/api/media/${cleanupAssetId}/proxy`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(422);

      // Verify both temporary files were cleaned up
      expect(createdInputPath).toBeTruthy();
      expect(fs.existsSync(createdInputPath)).toBe(false);
      expect(createdOutputPath).toBeTruthy();
      expect(fs.existsSync(createdOutputPath)).toBe(false);

      downloadSpy.mockRestore();
      ffmpegSpy.mockRestore();
    });

    it('allows downloading generated proxy via GET /api/media/:assetId/download-url?type=proxy', async () => {
      if (!db) return;

      const proxyDownloadAssetId = '66666666-6666-6666-6666-666666666666';
      await db
        .insert(mediaAssets)
        .values({
          id: proxyDownloadAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${proxyDownloadAssetId}.mp4`,
          originalFilename: 'interview_clip.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10000000,
          ingestionStatus: 'ready',
          metadata: {
            proxy: {
              storageKey: `proxies/${userA_Id}/${proxyDownloadAssetId}_720p.mp4`,
              width: 1280,
              height: 720,
              fileSizeBytes: 2500000,
              status: 'ready',
            },
          },
        })
        .onConflictDoNothing();

      const res = await request(app)
        .get(`/api/media/${proxyDownloadAssetId}/download-url?type=proxy`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.isProxy).toBe(true);
      expect(res.body.filename).toBe('proxy_interview_clip.mp4');
      expect(res.body.downloadUrl).toBeDefined();
    });
  });
});
