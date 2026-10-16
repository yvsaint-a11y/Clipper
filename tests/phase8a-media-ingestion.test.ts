import { describe, it, expect, beforeEach, vi } from 'vitest';

const userA_Id = '11111111-1111-1111-1111-111111111111';
const userA_Email = 'alice.creator@clipper.dev';

const userB_Id = '22222222-2222-2222-2222-222222222222';
const userB_Email = 'bob.intruder@clipper.dev';

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

import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createExpressApp } from '../server/app';
import { getDb } from '../server/db';
import { users } from '../server/db/schema/users';
import { mediaAssets } from '../server/db/schema/media';
import {
  getMediaIngestionStatus,
  updateMediaIngestionMetadata,
  updateMediaIngestionStatus,
  MediaIngestionError,
  INGESTION_STATUSES,
} from '../server/services/mediaIngestionService';

describe('Phase 8A: Media Ingestion Foundation', () => {
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

  describe('1. Service Abstraction & Status Transitions', () => {
    it('defines the four canonical ingestion statuses', () => {
      expect(INGESTION_STATUSES).toEqual(['pending', 'processing', 'ready', 'failed']);
    });

    it('creates an asset and retrieves its ingestion status and metadata', async () => {
      if (!db) return;

      const assetId = '33333333-3333-3333-3333-333333333331';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'hero_b_roll.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 2048000,
          ingestionStatus: 'pending',
          hasAudio: true,
          durationMs: null,
          width: null,
          height: null,
        })
        .onConflictDoNothing();

      const record = await getMediaIngestionStatus(assetId, userA_Id);

      expect(record.id).toBe(assetId);
      expect(record.userId).toBe(userA_Id);
      expect(record.originalFilename).toBe('hero_b_roll.mp4');
      expect(record.ingestionStatus).toBe('pending');
      expect(record.hasAudio).toBe(true);
      expect(record.durationMs).toBeNull();
    });

    it('updates ingestion metadata and moves status to ready', async () => {
      if (!db) return;

      const assetId = '33333333-3333-3333-3333-333333333332';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'drone_4k.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 52428800,
          ingestionStatus: 'pending',
          hasAudio: false,
        })
        .onConflictDoNothing();

      const updated = await updateMediaIngestionMetadata(
        assetId,
        userA_Id,
        {
          durationMs: 14500,
          width: 3840,
          height: 2160,
          fps: 59.94,
          hasAudio: true,
          extra: { codec: 'h264', colorSpace: 'bt709' },
        },
        'ready',
      );

      expect(updated.ingestionStatus).toBe('ready');
      expect(updated.durationMs).toBe(14500);
      expect(updated.width).toBe(3840);
      expect(updated.height).toBe(2160);
      expect(updated.fps).toBe(59.94);
      expect(updated.hasAudio).toBe(true);
      expect(updated.metadata).toMatchObject({ codec: 'h264', colorSpace: 'bt709' });
    });

    it('transitions to failed status and records failure reason in jsonb metadata', async () => {
      if (!db) return;

      const assetId = '33333333-3333-3333-3333-333333333333';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mov`,
          originalFilename: 'corrupted_clip.mov',
          mimeType: 'video/quicktime',
          fileSizeBytes: 1024,
          ingestionStatus: 'processing',
        })
        .onConflictDoNothing();

      const failedRecord = await updateMediaIngestionStatus(
        assetId,
        userA_Id,
        'failed',
        'Invalid MOOV atom header in QuickTime container.',
      );

      expect(failedRecord.ingestionStatus).toBe('failed');
      expect((failedRecord.metadata as any).lastError).toBe('Invalid MOOV atom header in QuickTime container.');
      expect((failedRecord.metadata as any).failedAt).toBeDefined();
    });

    it('validates metadata inputs and rejects invalid dimensions or negative duration', async () => {
      if (!db) return;

      const assetId = '33333333-3333-3333-3333-333333333331';

      await expect(
        updateMediaIngestionMetadata(assetId, userA_Id, { durationMs: -500 }),
      ).rejects.toThrow(MediaIngestionError);

      await expect(
        updateMediaIngestionMetadata(assetId, userA_Id, { width: -1920 }),
      ).rejects.toThrow(MediaIngestionError);

      await expect(
        updateMediaIngestionMetadata(assetId, userA_Id, { fps: -30 }),
      ).rejects.toThrow(MediaIngestionError);

      await expect(
        updateMediaIngestionMetadata(assetId, userA_Id, {}, 'invalid-status' as any),
      ).rejects.toThrow(MediaIngestionError);
    });
  });

  describe('2. HTTP Endpoint: Authenticated Metadata & Status Access', () => {
    it('requires Bearer authentication header on GET /api/media/:assetId/status', async () => {
      const res = await request(app).get('/api/media/33333333-3333-3333-3333-333333333331/status');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('returns 200 with status and metadata for an owned media asset', async () => {
      if (!db) return;

      const assetId = '44444444-4444-4444-4444-444444444441';
      await db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'sunset_timelapse.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 8388608,
          durationMs: 30000,
          width: 1920,
          height: 1080,
          fps: '30.00',
          hasAudio: false,
          ingestionStatus: 'ready',
        })
        .onConflictDoNothing();

      const res = await request(app)
        .get(`/api/media/${assetId}/status`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.assetId).toBe(assetId);
      expect(res.body.ingestionStatus).toBe('ready');
      expect(res.body.metadata).toEqual(
        expect.objectContaining({
          durationMs: 30000,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: false,
          mimeType: 'video/mp4',
          fileSizeBytes: 8388608,
        }),
      );
      expect(res.body.asset.originalFilename).toBe('sunset_timelapse.mp4');
    });

    it('returns full asset via GET /api/media/:assetId', async () => {
      const assetId = '44444444-4444-4444-4444-444444444441';
      const res = await request(app)
        .get(`/api/media/${assetId}`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(200);
      expect(res.body.asset.id).toBe(assetId);
      expect(res.body.asset.originalFilename).toBe('sunset_timelapse.mp4');
      expect(res.body.asset.ingestionStatus).toBe('ready');
    });

    it('returns 404 when querying a non-existent asset ID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-999999999999';
      const res = await request(app)
        .get(`/api/media/${nonExistentId}/status`)
        .set('Authorization', 'Bearer alice-valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found or access denied');
    });
  });

  describe('3. IDOR Protection & Ownership Enforcement', () => {
    it('prevents Bob from viewing the ingestion status of Alice’s private media asset', async () => {
      const aliceAssetId = '44444444-4444-4444-4444-444444444441';

      // Bob uses his own valid token to inspect Alice's asset
      const res = await request(app)
        .get(`/api/media/${aliceAssetId}/status`)
        .set('Authorization', 'Bearer bob-valid-token');

      // Must be 404 to avoid leaking existence of Alice's asset
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found or access denied');
    });

    it('prevents Bob from updating metadata on Alice’s private media asset via PATCH', async () => {
      const aliceAssetId = '44444444-4444-4444-4444-444444444441';

      const res = await request(app)
        .patch(`/api/media/${aliceAssetId}/metadata`)
        .set('Authorization', 'Bearer bob-valid-token')
        .send({
          durationMs: 99999,
          width: 100,
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found or access denied');
    });

    it('allows Alice to update metadata on her own asset via PATCH /api/media/:assetId/metadata', async () => {
      const aliceAssetId = '44444444-4444-4444-4444-444444444441';

      const res = await request(app)
        .patch(`/api/media/${aliceAssetId}/metadata`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          durationMs: 31200,
          fps: 29.97,
          hasAudio: true,
          extra: { audioCodec: 'aac', sampleRate: 48000 },
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('updated');
      expect(res.body.asset.durationMs).toBe(31200);
      expect(res.body.asset.fps).toBe(29.97);
      expect(res.body.asset.hasAudio).toBe(true);
      expect(res.body.asset.metadata).toMatchObject({ audioCodec: 'aac', sampleRate: 48000 });
    });
  });

  describe('4. Complete Upload Flow with Server-Side Metadata Persistence', () => {
    it('persists client-provided metadata upon upload completion and sets status to ready', async () => {
      if (!db) return;

      const assetId = '55555555-5555-5555-5555-555555555551';
      await db
        .insert(mediaAssets)
        .values({
          id: assetId,
          userId: userA_Id,
          storageKey: `raw/${userA_Id}/${assetId}.mp4`,
          originalFilename: 'interview_take1.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 15728640,
          ingestionStatus: 'pending',
          hasAudio: true,
        })
        .onConflictDoNothing();

      const completeRes = await request(app)
        .post(`/api/media/${assetId}/complete`)
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          durationMs: 45000,
          width: 1920,
          height: 1080,
          fps: 24,
          hasAudio: true,
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.asset.ingestionStatus).toBe('ready');
      expect(completeRes.body.asset.durationMs).toBe(45000);
      expect(completeRes.body.asset.width).toBe(1920);
      expect(completeRes.body.asset.height).toBe(1080);
      expect(completeRes.body.asset.fps).toBe(24);
    });
  });
});
