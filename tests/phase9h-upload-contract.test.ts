import { describe, it, expect, vi } from 'vitest';
import { parsePresignUploadResponse } from '../src/features/media/uploadContract';

const userA_Id = '11111111-1111-1111-1111-111111111111';
const userA_Email = 'alice.creator@clipper.dev';

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
      } else {
        res.status(401).json({ error: 'Unauthorized: Invalid authentication token.' });
      }
    },
    getSupabaseAdmin: () => null,
  };
});

import request from 'supertest';
import { createExpressApp } from '../server/app';

describe('Phase 9H-2H: Media Upload Response Contract & Client Parsing', () => {
  describe('parsePresignUploadResponse Unit Tests', () => {
    it('correctly resolves nested canonical backend response schema', () => {
      const nestedBackendResponse = {
        asset: {
          id: 'asset-uuid-1234',
          userId: userA_Id,
          storageKey: 'raw/11111111-1111-1111-1111-111111111111/asset-uuid-1234.mp4',
          originalFilename: 'b_roll.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 10485760,
          ingestionStatus: 'pending',
          createdAt: new Date().toISOString(),
        },
        upload: {
          uploadUrl: 'https://clipper-media.r2.cloudflarestorage.com/raw/test.mp4?X-Amz-Signature=abc',
          httpMethod: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
          },
          expiresInSeconds: 900,
          isR2Configured: true,
        },
      };

      const resolved = parsePresignUploadResponse(nestedBackendResponse);

      expect(resolved.assetId).toBe('asset-uuid-1234');
      expect(resolved.uploadUrl).toBe(
        'https://clipper-media.r2.cloudflarestorage.com/raw/test.mp4?X-Amz-Signature=abc',
      );
      expect(resolved.requiredHeaders).toEqual({
        'Content-Type': 'video/mp4',
      });
    });

    it('correctly resolves legacy flat schema for backwards compatibility', () => {
      const flatResponse = {
        assetId: 'flat-asset-5678',
        uploadUrl: 'https://clipper-media.r2.cloudflarestorage.com/raw/flat.mp4',
        requiredHeaders: {
          'Content-Type': 'video/mp4',
        },
      };

      const resolved = parsePresignUploadResponse(flatResponse);

      expect(resolved.assetId).toBe('flat-asset-5678');
      expect(resolved.uploadUrl).toBe('https://clipper-media.r2.cloudflarestorage.com/raw/flat.mp4');
      expect(resolved.requiredHeaders).toEqual({
        'Content-Type': 'video/mp4',
      });
    });

    it('handles mixed schemas where asset is nested but upload fields are flat or vice versa', () => {
      const mixedResponse1 = {
        asset: { id: 'asset-nested-only' },
        uploadUrl: 'https://upload.example.com/direct',
      };
      const resolved1 = parsePresignUploadResponse(mixedResponse1);
      expect(resolved1.assetId).toBe('asset-nested-only');
      expect(resolved1.uploadUrl).toBe('https://upload.example.com/direct');

      const mixedResponse2 = {
        assetId: 'asset-flat-only',
        upload: { uploadUrl: 'https://upload.example.com/nested' },
      };
      const resolved2 = parsePresignUploadResponse(mixedResponse2);
      expect(resolved2.assetId).toBe('asset-flat-only');
      expect(resolved2.uploadUrl).toBe('https://upload.example.com/nested');
    });

    it('throws validation error when assetId is missing', () => {
      const invalid = {
        upload: {
          uploadUrl: 'https://upload.example.com',
        },
      };
      expect(() => parsePresignUploadResponse(invalid)).toThrow(
        /server response missing asset ID/i,
      );
    });

    it('throws validation error when uploadUrl is missing (prevents PUT /undefined)', () => {
      const invalid = {
        asset: {
          id: 'asset-999',
        },
      };
      expect(() => parsePresignUploadResponse(invalid)).toThrow(
        /server response missing upload URL/i,
      );
    });

    it('throws validation error on null or non-object payload', () => {
      expect(() => parsePresignUploadResponse(null)).toThrow(/invalid response payload/i);
      expect(() => parsePresignUploadResponse(undefined)).toThrow(/invalid response payload/i);
      expect(() => parsePresignUploadResponse('string')).toThrow(/invalid response payload/i);
    });
  });

  describe('End-to-End API Route Contract Verification', () => {
    const app = createExpressApp();

    it('POST /api/media/upload-url returns nested response schema matching parser expectations', async () => {
      const res = await request(app)
        .post('/api/media/upload-url')
        .set('Authorization', 'Bearer alice-valid-token')
        .send({
          filename: 'contract_check.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 2048576,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('asset');
      expect(res.body).toHaveProperty('upload');
      expect(typeof res.body.asset.id).toBe('string');
      expect(typeof res.body.upload.uploadUrl).toBe('string');
      expect(res.body.upload.httpMethod).toBe('PUT');

      // Crucially verify that passing res.body through parsePresignUploadResponse works flawlessly
      const parsed = parsePresignUploadResponse(res.body);
      expect(parsed.assetId).toBe(res.body.asset.id);
      expect(parsed.uploadUrl).toBe(res.body.upload.uploadUrl);
      expect(parsed.uploadUrl).not.toBe('undefined');
      expect(parsed.uploadUrl.length).toBeGreaterThan(10);
    });
  });
});
