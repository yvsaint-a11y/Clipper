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
      // Create a mock temp file
      await fs.promises.writeFile(destPath, 'mock-binary-video-content');
    }),
    uploadLocalFileToR2: vi.fn(async () => {}),
    uploadBufferToR2: vi.fn(async () => {}),
  };
});

import request from 'supertest';
import { createExpressApp } from '../server/app';
import { getDb } from '../server/db';
import { users } from '../server/db/schema/users';
import { mediaAssets } from '../server/db/schema/media';
import {
  normalizeFps,
  normalizeDurationMs,
  parseFFprobeOutput,
  MediaProbeError,
  probeMediaAsset,
  probeEngine,
} from '../server/services/mediaProbeService';
import * as mediaProbeServiceModule from '../server/services/mediaProbeService';
import * as r2StorageServiceModule from '../server/services/r2StorageService';
import { getMediaIngestionStatus } from '../server/services/mediaIngestionService';

describe('Phase 8B: FFmpeg Metadata Probe Foundation', () => {
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

  describe('1. FPS Normalization Unit Tests', () => {
    it('normalizes common integer fractional frame rates', () => {
      expect(normalizeFps('30/1')).toBe(30);
      expect(normalizeFps('60/1')).toBe(60);
      expect(normalizeFps('24/1')).toBe(24);
      expect(normalizeFps('25/1')).toBe(25);
    });

    it('normalizes NTSC standard fractional frame rates to 2 decimals', () => {
      expect(normalizeFps('30000/1001')).toBe(29.97);
      expect(normalizeFps('24000/1001')).toBe(23.98);
      expect(normalizeFps('60000/1001')).toBe(59.94);
    });

    it('normalizes decimal strings and direct numbers', () => {
      expect(normalizeFps('29.970030')).toBe(29.97);
      expect(normalizeFps(29.97)).toBe(29.97);
      expect(normalizeFps(60)).toBe(60);
    });

    it('handles zero, N/A, and invalid FPS gracefully', () => {
      expect(normalizeFps('0/0')).toBeNull();
      expect(normalizeFps('N/A')).toBeNull();
      expect(normalizeFps(null)).toBeNull();
      expect(normalizeFps(undefined)).toBeNull();
      expect(normalizeFps('')).toBeNull();
      expect(normalizeFps('-24/1')).toBeNull();
    });
  });

  describe('2. Duration Conversion Unit Tests', () => {
    it('converts floating-point seconds into integer milliseconds', () => {
      expect(normalizeDurationMs('10.5')).toBe(10500);
      expect(normalizeDurationMs('10.033333')).toBe(10033);
      expect(normalizeDurationMs(12.345)).toBe(12345);
      expect(normalizeDurationMs('0.040000')).toBe(40);
    });

    it('converts integer seconds to milliseconds', () => {
      expect(normalizeDurationMs('60')).toBe(60000);
      expect(normalizeDurationMs(30)).toBe(30000);
      expect(normalizeDurationMs(0)).toBe(0);
      expect(normalizeDurationMs('0.0')).toBe(0);
    });

    it('handles invalid or empty durations gracefully', () => {
      expect(normalizeDurationMs(null)).toBeNull();
      expect(normalizeDurationMs(undefined)).toBeNull();
      expect(normalizeDurationMs('')).toBeNull();
      expect(normalizeDurationMs('invalid')).toBeNull();
      expect(normalizeDurationMs(-10)).toBeNull();
    });
  });

  describe('3. FFprobe Technical Output Parsing', () => {
    it('successfully extracts video, audio, container, and duration metadata', () => {
      const mockFFprobeJson = {
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
            r_frame_rate: '30/1',
            avg_frame_rate: '30000/1001',
            duration: '12.500000',
          },
          {
            codec_type: 'audio',
            codec_name: 'aac',
            sample_rate: '48000',
            channels: 2,
            duration: '12.512000',
          },
        ],
        format: {
          format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
          duration: '12.512000',
          size: '15728640',
        },
      };

      const result = parseFFprobeOutput(mockFFprobeJson);

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.fps).toBe(29.97);
      expect(result.videoCodec).toBe('h264');
      expect(result.audioCodec).toBe('aac');
      expect(result.hasAudio).toBe(true);
      expect(result.audioChannels).toBe(2);
      expect(result.sampleRate).toBe(48000);
      expect(result.container).toBe('mov,mp4,m4a,3gp,3g2,mj2');
      expect(result.durationMs).toBe(12512);
      expect(result.fileSizeBytes).toBe(15728640);
    });

    it('parses silent video without audio streams', () => {
      const mockSilentVideo = {
        streams: [
          {
            codec_type: 'video',
            codec_name: 'vp9',
            width: 3840,
            height: 2160,
            avg_frame_rate: '60/1',
            duration: '8.000000',
          },
        ],
        format: {
          format_name: 'matroska,webm',
          duration: '8.000000',
          size: '10485760',
        },
      };

      const result = parseFFprobeOutput(mockSilentVideo);

      expect(result.width).toBe(3840);
      expect(result.height).toBe(2160);
      expect(result.fps).toBe(60);
      expect(result.videoCodec).toBe('vp9');
      expect(result.hasAudio).toBe(false);
      expect(result.audioCodec).toBeNull();
      expect(result.audioChannels).toBeNull();
      expect(result.sampleRate).toBeNull();
      expect(result.durationMs).toBe(8000);
    });

    it('parses audio-only media file', () => {
      const mockAudioOnly = {
        streams: [
          {
            codec_type: 'audio',
            codec_name: 'mp3',
            sample_rate: '44100',
            channels: 2,
            duration: '45.200000',
          },
        ],
        format: {
          format_name: 'mp3',
          duration: '45.200000',
          size: '2097152',
        },
      };

      const result = parseFFprobeOutput(mockAudioOnly);

      expect(result.width).toBeNull();
      expect(result.height).toBeNull();
      expect(result.fps).toBeNull();
      expect(result.videoCodec).toBeNull();
      expect(result.hasAudio).toBe(true);
      expect(result.audioCodec).toBe('mp3');
      expect(result.audioChannels).toBe(2);
      expect(result.sampleRate).toBe(44100);
      expect(result.durationMs).toBe(45200);
    });

    it('throws MediaProbeError when given corrupt or empty probe data', () => {
      expect(() => parseFFprobeOutput({})).toThrow(MediaProbeError);
      expect(() => parseFFprobeOutput({ streams: [] })).toThrow(MediaProbeError);
      expect(() => parseFFprobeOutput(null)).toThrow(MediaProbeError);
    });
  });

  describe('4. Probe API Endpoint (POST /api/media/:assetId/probe)', () => {
    it('rejects unauthenticated probe requests with 401', async () => {
      const res = await request(app)
        .post('/api/media/any-asset-id/probe')
        .send();

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/);
    });

    it('returns 404 for nonexistent asset ID', async () => {
      const res = await request(app)
        .post('/api/media/00000000-0000-0000-0000-000000000000/probe')
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('enforces IDOR protection: Bob cannot probe Alice’s asset', async () => {
      if (!db) return;

      const aliceAssetId = '55555555-5555-5555-5555-555555555551';
      await db
        .insert(mediaAssets)
        .values({
          id: aliceAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${aliceAssetId}.mp4`,
          originalFilename: 'alice_private_recording.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 8192000,
          ingestionStatus: 'pending',
          hasAudio: false,
        })
        .onConflictDoNothing();

      const res = await request(app)
        .post(`/api/media/${aliceAssetId}/probe`)
        .set('Authorization', 'Bearer bob-valid-token') // Bob attempting IDOR
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });

    it('successfully probes Alice’s asset, extracts technical metadata, and sets status to ready', async () => {
      if (!db) return;

      const assetId = '55555555-5555-5555-5555-555555555552';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'cinematic_b_roll.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 12500000,
          ingestionStatus: 'pending',
          hasAudio: false,
        })
        .onConflictDoNothing();

      // Mock runFFprobe via probeEngine
      const probeSpy = vi.spyOn(probeEngine, 'runFFprobe').mockResolvedValueOnce({
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
            avg_frame_rate: '60/1',
            duration: '15.000000',
          },
          {
            codec_type: 'audio',
            codec_name: 'aac',
            sample_rate: '48000',
            channels: 2,
            duration: '15.010000',
          },
        ],
        format: {
          format_name: 'mp4',
          duration: '15.010000',
          size: '12500000',
        },
      });

      const res = await request(app)
        .post(`/api/media/${assetId}/probe`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/probe completed successfully/i);
      expect(res.body.ingestionStatus).toBe('ready');
      expect(res.body.metadata.durationMs).toBe(15010);
      expect(res.body.metadata.width).toBe(1920);
      expect(res.body.metadata.height).toBe(1080);
      expect(res.body.metadata.fps).toBe(60);
      expect(res.body.metadata.hasAudio).toBe(true);
      expect(res.body.metadata.videoCodec).toBe('h264');
      expect(res.body.metadata.audioCodec).toBe('aac');

      // Verify database persistence
      const persisted = await getMediaIngestionStatus(assetId, userA_Id);
      expect(persisted.ingestionStatus).toBe('ready');
      expect(persisted.durationMs).toBe(15010);
      expect(persisted.width).toBe(1920);
      expect(persisted.height).toBe(1080);
      expect(persisted.fps).toBe(60);
      expect(persisted.hasAudio).toBe(true);
      expect(persisted.metadata.videoCodec).toBe('h264');
      expect(persisted.metadata.audioCodec).toBe('aac');
      expect(persisted.metadata.container).toBe('mp4');

      probeSpy.mockRestore();
    });

    it('handles probe failure by marking asset as failed and returning 422', async () => {
      if (!db) return;

      const corruptAssetId = '55555555-5555-5555-5555-555555555553';
      await db
        .insert(mediaAssets)
        .values({
          id: corruptAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${corruptAssetId}.mp4`,
          originalFilename: 'corrupt_file.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 500,
          ingestionStatus: 'pending',
          hasAudio: false,
        })
        .onConflictDoNothing();

      // Mock runFFprobe failing (e.g. corrupt header)
      const probeSpy = vi.spyOn(probeEngine, 'runFFprobe').mockRejectedValueOnce(
        new MediaProbeError('FFprobe failed to inspect media: Invalid data found when processing input', 422),
      );

      const res = await request(app)
        .post(`/api/media/${corruptAssetId}/probe`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/Invalid data found/i);
      expect(res.body.ingestionStatus).toBe('failed');

      // Verify asset status in database is transitioned to 'failed'
      const failedAsset = await getMediaIngestionStatus(corruptAssetId, userA_Id);
      expect(failedAsset.ingestionStatus).toBe('failed');
      expect(failedAsset.metadata.lastError).toMatch(/Invalid data found/i);

      probeSpy.mockRestore();
    });

    it('guarantees temporary file cleanup even if ffprobe throws', async () => {
      if (!db) return;

      const cleanupAssetId = '55555555-5555-5555-5555-555555555554';
      await db
        .insert(mediaAssets)
        .values({
          id: cleanupAssetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${cleanupAssetId}.mp4`,
          originalFilename: 'cleanup_test.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1000,
          ingestionStatus: 'pending',
          hasAudio: false,
        })
        .onConflictDoNothing();

      let createdTempPath = '';
      const downloadSpy = vi.spyOn(r2StorageServiceModule, 'downloadR2ObjectToFile').mockImplementationOnce(
        async (_key: string, destPath: string) => {
          createdTempPath = destPath;
          await fs.promises.writeFile(destPath, 'temporary-test-data');
        },
      );

      const probeSpy = vi.spyOn(probeEngine, 'runFFprobe').mockImplementationOnce(async () => {
        // Confirm temp file exists during probing
        expect(fs.existsSync(createdTempPath)).toBe(true);
        throw new Error('Simulation of catastrophic probe failure');
      });

      const res = await request(app)
        .post(`/api/media/${cleanupAssetId}/probe`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send();

      expect(res.status).toBe(422);
      // Temp file MUST be removed in the finally block
      expect(fs.existsSync(createdTempPath)).toBe(false);

      downloadSpy.mockRestore();
      probeSpy.mockRestore();
    });
  });
});
