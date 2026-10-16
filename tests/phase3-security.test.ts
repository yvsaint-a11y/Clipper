import { describe, it, expect, beforeAll } from 'vitest';
import { validateMediaUploadRequest } from '../server/services/mediaValidationService';
import { buildUserScopedStorageKey, sanitizeFilename } from '../server/services/r2StorageService';
import request from 'supertest';
import { createExpressApp } from '../server/app';

describe('Phase 3: Validation & User-Scoped Keys', () => {
  it('sanitizes filenames properly', () => {
    expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('my video@special#chars!.mp4')).toBe('my_video_special_chars_.mp4');
    expect(sanitizeFilename('normal_recording.mp4')).toBe('normal_recording.mp4');
  });

  it('builds strictly user-scoped storage keys', () => {
    const userId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
    const assetId = 'f9e8d7c6-b5a4-3210-fedc-ba9876543210';
    const key = buildUserScopedStorageKey(userId, assetId, 'mp4');
    expect(key).toBe(`raw/${userId}/${assetId}.mp4`);
  });

  it('validates supported video upload requests', () => {
    const valid = validateMediaUploadRequest({
      filename: 'sample_video.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 50 * 1024 * 1024,
    });
    expect(valid.isValid).toBe(true);
    expect(valid.category).toBe('video');
    expect(valid.extension).toBe('mp4');
  });

  it('rejects oversized files beyond V1 limits', () => {
    const oversized = validateMediaUploadRequest({
      filename: 'massive_video.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 600 * 1024 * 1024, // 600MB > 500MB limit
    });
    expect(oversized.isValid).toBe(false);
    expect(oversized.statusCode).toBe(413);
  });

  it('rejects forbidden or unsafe MIME types / extensions', () => {
    const forbidden = validateMediaUploadRequest({
      filename: 'malicious.exe',
      mimeType: 'application/x-msdownload',
      fileSizeBytes: 1024,
    });
    expect(forbidden.isValid).toBe(false);
    expect(forbidden.statusCode).toBe(400);
  });

  it('rejects mismatch between extension and MIME type', () => {
    const mismatch = validateMediaUploadRequest({
      filename: 'fake.png',
      mimeType: 'video/mp4',
      fileSizeBytes: 1024,
    });
    expect(mismatch.isValid).toBe(false);
    expect(mismatch.statusCode).toBe(400);
  });
});

describe('Phase 3: Backend Security & Ownership Enforcement', () => {
  const app = createExpressApp();

  it('rejects unauthenticated requests to /api/auth/me with 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('rejects invalid or malformed bearer token with 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.bogus.jwt');
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated upload requests with 401', async () => {
    const res = await request(app)
      .post('/api/media/upload-url')
      .send({
        filename: 'test.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 1024,
      });
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated download requests with 401', async () => {
    const res = await request(app).get('/api/media/any-asset-id/download-url');
    expect(res.status).toBe(401);
  });

  it('verifies /api/health and /api/db/status remain healthy and never expose secrets', async () => {
    const resHealth = await request(app).get('/api/health');
    expect(resHealth.status).toBe(200);
    expect(resHealth.body.status).toBe('ok');
    expect(JSON.stringify(resHealth.body)).not.toContain('postgres:');
    expect(JSON.stringify(resHealth.body)).not.toContain('supabase.co');

    const resDb = await request(app).get('/api/db/status');
    expect(resDb.status).toBe(200);
    expect(resDb.body.database.isConnected).toBe(true);
    expect(JSON.stringify(resDb.body)).not.toContain('postgres:');

  });
});
