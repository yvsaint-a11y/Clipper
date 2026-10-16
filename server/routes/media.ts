import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../db/auth';
import { syncUserProfile } from '../services/userService';
import {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  buildUserScopedStorageKey,
  sanitizeFilename,
  isR2Configured,
  verifyR2ObjectExists,
} from '../services/r2StorageService';
import { validateMediaUploadRequest } from '../services/mediaValidationService';
import {
  getMediaIngestionStatus,
  updateMediaIngestionMetadata,
  MediaIngestionError,
} from '../services/mediaIngestionService';
import { probeMediaAsset, MediaProbeError } from '../services/mediaProbeService';
import { generateMediaProxy, MediaProxyError } from '../services/mediaProxyService';
import { generateMediaThumbnail, MediaThumbnailError } from '../services/mediaThumbnailService';
import { generateMediaWaveform, MediaWaveformError } from '../services/mediaWaveformService';
import {
  enqueueMediaJob,
  getMediaJobSummary,
  isValidMediaOperation,
  VALID_MEDIA_OPERATIONS,
  type MediaOperation,
} from '../queue/mediaQueue';
import { isRedisConfigured } from '../queue/redis';
import { getDb } from '../db';
import { mediaAssets } from '../db/schema/media';
import { projects } from '../db/schema/projects';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

export const mediaRouter = Router();

/**
 * All media routes require authenticated Supabase JWT.
 * Never trusts client-supplied userIds.
 */
mediaRouter.use(requireAuth);

/**
 * POST /api/media/upload-url
 * 
 * Prepares a secure direct upload to Cloudflare R2:
 * 1. Verifies caller authentication via Supabase JWT
 * 2. Synchronizes user profile into PostgreSQL users table
 * 3. Validates MIME type, file size, extension
 * 4. If projectId is provided, verifies that projectId is owned by the authenticated user
 * 5. Generates asset UUID and strictly user-scoped storage key: raw/{userId}/{assetId}.{ext}
 * 6. Creates media_assets row in PostgreSQL with status 'pending'
 * 7. Generates short-lived presigned PUT URL
 * 8. Returns { assetId, uploadUrl, storageKey, expiresInSeconds, headers }
 */
mediaRouter.post('/upload-url', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const user = req.user!;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    // 1. Ensure user is synced
    await syncUserProfile(user);

    // 2. Validate request body
    const { filename, mimeType, fileSizeBytes, projectId } = req.body || {};

    const validation = validateMediaUploadRequest({
      filename: filename || '',
      mimeType: mimeType || '',
      fileSizeBytes: Number(fileSizeBytes),
    });

    if (!validation.isValid) {
      res.status(validation.statusCode || 400).json({ error: validation.error });
      return;
    }

    // 3. If projectId is supplied, verify ownership
    if (projectId) {
      const existingProject = await db
        .select({ id: projects.id, userId: projects.userId })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
        .limit(1);

      if (existingProject.length === 0) {
        res.status(403).json({
          error: 'Forbidden: You do not have permission to attach media to the specified project.',
        });
        return;
      }
    }

    // 4. Generate asset UUID and safe user-scoped storage key
    const assetId = crypto.randomUUID();
    const sanitizedName = sanitizeFilename(filename);
    const storageKey = buildUserScopedStorageKey(userId, assetId, validation.extension!);

    // 5. Generate presigned PUT URL
    let uploadUrlInfo;
    const r2Ready = isR2Configured();

    if (r2Ready) {
      uploadUrlInfo = await generatePresignedUploadUrl({
        storageKey,
        contentType: mimeType,
        fileSizeBytes: Number(fileSizeBytes),
        expiresInSeconds: 900, // 15 minutes
      });
    } else {
      // In development / sandbox without active R2 secrets, generate a structured simulation notice
      uploadUrlInfo = {
        uploadUrl: `https://mock-r2.cloudflarestorage.com/${storageKey}?signature=pending_r2_keys`,
        storageKey,
        expiresInSeconds: 900,
        httpMethod: 'PUT' as const,
        headers: {
          'Content-Type': mimeType,
        },
      };
    }

    // 6. Record asset in PostgreSQL media_assets table
    const [assetRecord] = await db
      .insert(mediaAssets)
      .values({
        id: assetId,
        userId,
        storageKey,
        originalFilename: sanitizedName,
        mimeType,
        fileSizeBytes: Number(fileSizeBytes),
        ingestionStatus: 'pending',
        hasAudio: validation.category === 'audio' || validation.category === 'video',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json({
      asset: {
        id: assetRecord.id,
        userId: assetRecord.userId,
        storageKey: assetRecord.storageKey,
        originalFilename: assetRecord.originalFilename,
        mimeType: assetRecord.mimeType,
        fileSizeBytes: assetRecord.fileSizeBytes,
        ingestionStatus: assetRecord.ingestionStatus,
        createdAt: assetRecord.createdAt,
      },
      upload: {
        uploadUrl: uploadUrlInfo.uploadUrl,
        httpMethod: uploadUrlInfo.httpMethod,
        headers: uploadUrlInfo.headers,
        expiresInSeconds: uploadUrlInfo.expiresInSeconds,
        isR2Configured: r2Ready,
      },
    });
  } catch (err: unknown) {
    console.error('[Media] Error generating upload URL:', err);
    res.status(500).json({ error: 'Failed to prepare media upload.' });
  }
});

/**
 * POST /api/media/:assetId/complete
 * 
 * Confirms that direct R2 upload finished:
 * 1. Verifies caller ownership (asset.userId === authenticated userId)
 * 2. Checks R2 object presence if R2 is configured
 * 3. Updates status from 'pending' to 'ready'
 */
mediaRouter.post('/:assetId/complete', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    // Query asset enforcing ownership strictly
    const foundAssets = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
      .limit(1);

    if (foundAssets.length === 0) {
      res.status(404).json({ error: 'Media asset not found or access denied.' });
      return;
    }

    const asset = foundAssets[0];

    // Verify R2 object if configured
    if (isR2Configured()) {
      const head = await verifyR2ObjectExists(asset.storageKey);
      if (!head.exists) {
        // Upload might still be syncing or failed
        res.status(400).json({
          error: 'Upload verification failed: The file was not found in storage.',
        });
        return;
      }
    }

    // Extract any optional client-reported metadata
    const { durationMs, width, height, fps, hasAudio, metadata } = req.body || {};

    const updated = await updateMediaIngestionMetadata(
      assetId,
      userId,
      {
        durationMs,
        width,
        height,
        fps,
        hasAudio,
        extra: metadata,
      },
      'ready',
    );

    // Phase 8G: Automatic Media Processing Pipeline Trigger
    // For video and audio media, automatically enqueue initial probe job in the background.
    // Images are not processed into video proxies or audio waveforms.
    let queuedJobs: string[] = [];
    const isVideo = updated.mimeType.startsWith('video/');
    const isAudio = updated.mimeType.startsWith('audio/');

    if ((isVideo || isAudio) && isRedisConfigured()) {
      try {
        const probeJob = await enqueueMediaJob({
          assetId: updated.id,
          userId,
          operation: 'probe',
        });
        if (probeJob?.id) {
          queuedJobs.push(probeJob.id);
        }
      } catch (queueErr) {
        console.warn(`[Media] Failed to automatically enqueue probe for asset ${updated.id}:`, queueErr);
      }
    }

    res.status(200).json({
      message: 'Media upload successfully completed.',
      asset: {
        id: updated.id,
        storageKey: updated.storageKey,
        originalFilename: updated.originalFilename,
        mimeType: updated.mimeType,
        fileSizeBytes: updated.fileSizeBytes,
        durationMs: updated.durationMs,
        width: updated.width,
        height: updated.height,
        fps: updated.fps,
        hasAudio: updated.hasAudio,
        ingestionStatus: updated.ingestionStatus,
        updatedAt: updated.updatedAt,
      },
      processing: queuedJobs.length > 0,
      jobs: queuedJobs,
    });
  } catch (err: unknown) {
    if (err instanceof MediaIngestionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[Media] Error completing upload:', err);
    res.status(500).json({ error: 'Failed to complete media upload.' });
  }
});

/**
 * GET /api/media/:assetId/status
 * 
 * Returns the current ingestion status ('pending' | 'processing' | 'ready' | 'failed')
 * and technical metadata for an owned media asset. Enforces strict IDOR protection.
 */
mediaRouter.get('/:assetId/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;

    const record = await getMediaIngestionStatus(assetId, userId);

    res.status(200).json({
      assetId: record.id,
      ingestionStatus: record.ingestionStatus,
      metadata: {
        durationMs: record.durationMs,
        width: record.width,
        height: record.height,
        fps: record.fps,
        hasAudio: record.hasAudio,
        mimeType: record.mimeType,
        fileSizeBytes: record.fileSizeBytes,
        waveformUrl: record.waveformUrl,
        thumbnailUrl: record.thumbnailUrl,
        extra: record.metadata,
      },
      asset: record,
    });
  } catch (err: unknown) {
    if (err instanceof MediaIngestionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[Media] Error retrieving ingestion status:', err);
    res.status(500).json({ error: 'Failed to retrieve media ingestion status.' });
  }
});

/**
 * POST /api/media/:assetId/probe
 * 
 * Safely inspects the actual media file stored in Cloudflare R2 using FFprobe
 * and extracts/persists technical metadata (duration, width, height, FPS, codecs).
 * 
 * Enforces:
 * - Authentication required
 * - IDOR protection (caller must own the asset)
 * - Nonexistent assets return 404
 * - Safe process invocation without shell execution
 * - Guaranteed temporary file cleanup
 * - Status transitions: processing -> ready (or failed)
 */
mediaRouter.post('/:assetId/probe', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;

    const result = await probeMediaAsset(assetId, userId);

    res.status(200).json({
      message: 'Media asset technical probe completed successfully.',
      assetId: result.asset.id,
      ingestionStatus: result.asset.ingestionStatus,
      metadata: {
        durationMs: result.asset.durationMs,
        width: result.asset.width,
        height: result.asset.height,
        fps: result.asset.fps,
        hasAudio: result.asset.hasAudio,
        mimeType: result.asset.mimeType,
        fileSizeBytes: result.asset.fileSizeBytes,
        videoCodec: result.probedMetadata.videoCodec,
        audioCodec: result.probedMetadata.audioCodec,
        container: result.probedMetadata.container,
        audioChannels: result.probedMetadata.audioChannels,
        sampleRate: result.probedMetadata.sampleRate,
      },
      asset: result.asset,
    });
  } catch (err: unknown) {
    if (err instanceof MediaProbeError) {
      res.status(err.statusCode).json({
        error: err.message,
        ingestionStatus: err.statusCode === 422 ? 'failed' : undefined,
      });
      return;
    }
    if (err instanceof MediaIngestionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[Media] Error during FFprobe inspection:', err);
    res.status(500).json({ error: 'Failed to inspect media asset.' });
  }
});

/**
 * POST /api/media/:assetId/proxy
 * 
 * Generates an editing proxy (maximum 720p H.264 MP4 web-optimized) for an owned video asset.
 * 
 * Enforces:
 * - Authentication required
 * - IDOR protection (caller must own the asset)
 * - Video validation (rejects non-video media with 400)
 * - Nonexistent asset returns 404
 * - Automatic aspect ratio preservation and no-upscaling logic
 * - Deterministic user-scoped private R2 storage
 * - Status transitions: processing -> ready (or failed)
 * - Guaranteed temporary file cleanup
 */
mediaRouter.post('/:assetId/proxy', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;

    const result = await generateMediaProxy(assetId, userId);

    res.status(200).json({
      message: 'Media proxy generated successfully.',
      assetId: result.asset.id,
      ingestionStatus: result.asset.ingestionStatus,
      proxy: result.proxy,
      asset: result.asset,
    });
  } catch (err: unknown) {
    if (err instanceof MediaProxyError) {
      res.status(err.statusCode).json({
        error: err.message,
        ingestionStatus: err.statusCode === 422 ? 'failed' : undefined,
      });
      return;
    }
    if (err instanceof MediaIngestionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[Media] Error generating media proxy:', err);
    res.status(500).json({ error: 'Failed to generate media proxy.' });
  }
});

/**
 * POST /api/media/:assetId/thumbnail
 * 
 * Generates a video preview thumbnail (JPEG, max 640px wide, aspect-ratio preserved).
 * Video media only.
 */
mediaRouter.post('/:assetId/thumbnail', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;

    const result = await generateMediaThumbnail(assetId, userId);

    res.status(200).json({
      message: 'Thumbnail generated successfully.',
      assetId: result.asset.id,
      thumbnail: result.thumbnail,
      asset: result.asset,
    });
  } catch (err: unknown) {
    if (err instanceof MediaThumbnailError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[Media] Error generating thumbnail:', err);
    res.status(500).json({ error: 'Failed to generate thumbnail.' });
  }
});

/**
 * POST /api/media/:assetId/waveform
 * 
 * Generates an audio waveform representation (1000 normalized amplitude points).
 * Audio media only.
 */
mediaRouter.post('/:assetId/waveform', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;

    const result = await generateMediaWaveform(assetId, userId);

    res.status(200).json({
      message: 'Waveform generated successfully.',
      assetId: result.asset.id,
      waveform: result.waveform,
      data: result.data,
      asset: result.asset,
    });
  } catch (err: unknown) {
    if (err instanceof MediaWaveformError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[Media] Error generating waveform:', err);
    res.status(500).json({ error: 'Failed to generate waveform.' });
  }
});

/**
 * GET /api/media/:assetId/thumbnail-url
 * 
 * Retrieves short-lived signed download URL for the video thumbnail.
 */
mediaRouter.get('/:assetId/thumbnail-url', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
      .limit(1);

    if (!asset) {
      res.status(404).json({ error: 'Media asset not found or access denied.' });
      return;
    }

    const meta = (asset.metadata as Record<string, unknown>) || {};
    const thumbMeta = meta.thumbnail as { storageKey?: string; status?: string } | undefined;
    const thumbnailStorageKey = thumbMeta?.storageKey || asset.thumbnailUrl;

    if (!thumbnailStorageKey || thumbMeta?.status === 'failed') {
      res.status(404).json({ error: 'Thumbnail has not yet been generated for this asset.' });
      return;
    }

    let downloadUrl: string;
    const r2Ready = isR2Configured();

    if (r2Ready) {
      const signed = await generatePresignedDownloadUrl({
        storageKey: thumbnailStorageKey,
        expiresInSeconds: 3600,
        downloadFilename: `thumb_${asset.originalFilename.replace(/\.[^/.]+$/, '')}.jpg`,
      });
      downloadUrl = signed.downloadUrl;
    } else {
      downloadUrl = `https://mock-r2.cloudflarestorage.com/${thumbnailStorageKey}?token=preview_signed_token`;
    }

    res.status(200).json({
      assetId: asset.id,
      downloadUrl,
      signedUrl: downloadUrl,
      expiresInSeconds: 3600,
      filename: `thumb_${asset.originalFilename.replace(/\.[^/.]+$/, '')}.jpg`,
      mimeType: 'image/jpeg',
      isR2Configured: r2Ready,
    });
  } catch (err: unknown) {
    console.error('[Media] Error getting thumbnail URL:', err);
    res.status(500).json({ error: 'Failed to retrieve thumbnail URL.' });
  }
});

/**
 * GET /api/media/:assetId/waveform
 * 
 * Retrieves the normalized waveform JSON data for an audio asset.
 */
mediaRouter.get('/:assetId/waveform', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
      .limit(1);

    if (!asset) {
      res.status(404).json({ error: 'Media asset not found or access denied.' });
      return;
    }

    const meta = (asset.metadata as Record<string, unknown>) || {};
    const waveformMeta = meta.waveform as { storageKey?: string; sampleCount?: number; durationMs?: number; status?: string } | undefined;

    if (!waveformMeta || waveformMeta.status !== 'ready') {
      res.status(404).json({ error: 'Waveform has not yet been generated for this asset.' });
      return;
    }

    let waveformData: { assetId: string; sampleCount: number; durationMs: number; samples: number[] };
    if (isR2Configured() && waveformMeta.storageKey) {
      try {
        const { downloadR2ObjectToBuffer } = await import('../services/r2StorageService');
        const buffer = await downloadR2ObjectToBuffer(waveformMeta.storageKey);
        waveformData = JSON.parse(buffer.toString('utf-8'));
      } catch {
        waveformData = {
          assetId: asset.id,
          sampleCount: waveformMeta.sampleCount || 1000,
          durationMs: waveformMeta.durationMs || asset.durationMs || 0,
          samples: new Array(waveformMeta.sampleCount || 1000).fill(0.0),
        };
      }
    } else {
      waveformData = {
        assetId: asset.id,
        sampleCount: waveformMeta.sampleCount || 1000,
        durationMs: waveformMeta.durationMs || asset.durationMs || 0,
        samples: new Array(waveformMeta.sampleCount || 1000).fill(0.0),
      };
    }

    res.status(200).json(waveformData);
  } catch (err: unknown) {
    console.error('[Media] Error getting waveform data:', err);
    res.status(500).json({ error: 'Failed to retrieve waveform.' });
  }
});

/**
 * POST /api/media/:assetId/process
 * 
 * Enqueues an asynchronous media processing job (probe, proxy, thumbnail, waveform) into BullMQ.
 */
mediaRouter.post('/:assetId/process', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;
    const { operation } = req.body || {};

    // 1. Validate requested operation
    if (!isValidMediaOperation(operation)) {
      res.status(400).json({
        error: `Invalid or missing operation "${operation}". Supported operations: ${VALID_MEDIA_OPERATIONS.join(', ')}`,
      });
      return;
    }

    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    // 2. Validate asset existence and user ownership (IDOR check)
    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
      .limit(1);

    if (!asset) {
      res.status(404).json({ error: 'Media asset not found or access denied.' });
      return;
    }

    // 3. Upfront media type validation where appropriate
    if (operation === 'thumbnail') {
      const isVideo = asset.mimeType && asset.mimeType.toLowerCase().startsWith('video/');
      const hasVideoCodec = Boolean((asset.metadata as Record<string, unknown>)?.videoCodec);
      if (!isVideo && !hasVideoCodec) {
        res.status(400).json({
          error: `Asset "${asset.originalFilename}" is not a video file and cannot generate a thumbnail.`,
        });
        return;
      }
    } else if (operation === 'waveform') {
      const isAudio = asset.mimeType && asset.mimeType.toLowerCase().startsWith('audio/');
      const meta = (asset.metadata as Record<string, unknown>) || {};
      const hasAudioCodecOnly = Boolean(meta.audioCodec) && !Boolean(meta.videoCodec);
      if (!isAudio && !hasAudioCodecOnly) {
        res.status(400).json({
          error: `Asset "${asset.originalFilename}" is not an audio file and cannot generate a waveform.`,
        });
        return;
      }
    }

    // 4. Verify Redis is available for queueing
    if (!isRedisConfigured()) {
      res.status(503).json({ error: 'Background queue service is not configured or unavailable.' });
      return;
    }

    // 5. Enqueue job into BullMQ
    const job = await enqueueMediaJob({
      assetId,
      userId,
      operation: operation as MediaOperation,
    });

    const state = await job.getState();

    res.status(202).json({
      message: 'Media processing job enqueued successfully.',
      jobId: job.id,
      assetId: asset.id,
      operation,
      status: state || 'waiting',
    });
  } catch (err: unknown) {
    console.error('[Media] Error enqueueing media job:', err);
    res.status(500).json({ error: 'Failed to enqueue media processing job.' });
  }
});

/**
 * GET /api/media/jobs/:jobId
 * 
 * Retrieves the status and details of a background media processing job.
 * Enforces authenticated ownership protection.
 */
mediaRouter.get('/jobs/:jobId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { jobId } = req.params;

    if (!isRedisConfigured()) {
      res.status(503).json({ error: 'Background queue service is not configured or unavailable.' });
      return;
    }

    const summary = await getMediaJobSummary(jobId, userId);

    if (!summary) {
      res.status(404).json({ error: 'Media job not found or access denied.' });
      return;
    }

    res.status(200).json(summary);
  } catch (err: unknown) {
    console.error('[Media] Error retrieving job status:', err);
    res.status(500).json({ error: 'Failed to retrieve job status.' });
  }
});

/**
 * GET /api/media/:assetId
 * 
 * Retrieves an owned media asset by ID with full metadata.
 */
mediaRouter.get('/:assetId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;

    const record = await getMediaIngestionStatus(assetId, userId);
    res.status(200).json({ asset: record });
  } catch (err: unknown) {
    if (err instanceof MediaIngestionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[Media] Error retrieving media asset:', err);
    res.status(500).json({ error: 'Failed to retrieve media asset.' });
  }
});

/**
 * PATCH /api/media/:assetId/metadata
 * 
 * Server-side metadata update endpoint for an owned media asset.
 * Persists duration, dimensions, fps, MIME type, file size, and audio flag.
 */
mediaRouter.patch('/:assetId/metadata', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;
    const { durationMs, width, height, fps, hasAudio, mimeType, fileSizeBytes, status, extra } = req.body || {};

    const updated = await updateMediaIngestionMetadata(
      assetId,
      userId,
      {
        durationMs,
        width,
        height,
        fps,
        hasAudio,
        mimeType,
        fileSizeBytes,
        extra,
      },
      status,
    );

    res.status(200).json({
      message: 'Media metadata successfully updated.',
      asset: updated,
    });
  } catch (err: unknown) {
    if (err instanceof MediaIngestionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[Media] Error updating media metadata:', err);
    res.status(500).json({ error: 'Failed to update media metadata.' });
  }
});

/**
 * GET /api/media/:assetId/download-url
 * 
 * Generates short-lived signed R2 download URL:
 * 1. Checks caller ownership (asset.userId === authenticated userId)
 * 2. Generates short-lived signed GET URL (default 1 hour)
 * 3. Never allows cross-user access (User A cannot access User B's media)
 */
mediaRouter.get('/:assetId/download-url', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { assetId } = req.params;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    // Strict ownership enforcement
    const foundAssets = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
      .limit(1);

    if (foundAssets.length === 0) {
      res.status(404).json({ error: 'Media asset not found or access denied.' });
      return;
    }

    const asset = foundAssets[0];

    const isProxyRequest = req.query.type === 'proxy';
    const proxyMeta = (asset.metadata as Record<string, unknown>)?.proxy as
      | { storageKey?: string; status?: string }
      | undefined;
    const proxyKey =
      proxyMeta?.storageKey ||
      ((asset.metadata as Record<string, unknown>)?.proxyStorageKey as string | undefined);

    if (isProxyRequest && (!proxyKey || proxyMeta?.status === 'failed')) {
      res.status(404).json({ error: 'Proxy media has not yet been generated for this asset.' });
      return;
    }

    const targetStorageKey = isProxyRequest && proxyKey ? proxyKey : asset.storageKey;
    const downloadFilename = isProxyRequest
      ? `proxy_${asset.originalFilename.replace(/\.[^/.]+$/, '')}.mp4`
      : asset.originalFilename;
    const targetMimeType = isProxyRequest ? 'video/mp4' : asset.mimeType;

    let downloadUrl: string;
    const r2Ready = isR2Configured();

    if (r2Ready) {
      const signed = await generatePresignedDownloadUrl({
        storageKey: targetStorageKey,
        expiresInSeconds: 3600,
        downloadFilename,
      });
      downloadUrl = signed.downloadUrl;
    } else {
      downloadUrl = `https://mock-r2.cloudflarestorage.com/${targetStorageKey}?token=preview_signed_token`;
    }

    res.status(200).json({
      assetId: asset.id,
      downloadUrl,
      storageKey: targetStorageKey,
      expiresInSeconds: 3600,
      filename: downloadFilename,
      mimeType: targetMimeType,
      isProxy: isProxyRequest,
      isR2Configured: r2Ready,
    });
  } catch (err: unknown) {
    console.error('[Media] Error generating download URL:', err);
    res.status(500).json({ error: 'Failed to generate download URL.' });
  }
});

/**
 * GET /api/media
 * 
 * Lists media assets owned strictly by the authenticated user.
 */
mediaRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const db = getDb();

    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    const userAssets = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.userId, userId))
      .orderBy(desc(mediaAssets.createdAt))
      .limit(50);

    res.status(200).json({
      assets: userAssets.map((a) => ({
        id: a.id,
        storageKey: a.storageKey,
        originalFilename: a.originalFilename,
        mimeType: a.mimeType,
        fileSizeBytes: a.fileSizeBytes,
        ingestionStatus: a.ingestionStatus,
        hasAudio: a.hasAudio,
        durationMs: a.durationMs,
        width: a.width,
        height: a.height,
        fps: a.fps,
        thumbnailUrl: a.thumbnailUrl,
        waveformUrl: a.waveformUrl,
        metadata: a.metadata,
        createdAt: a.createdAt,
      })),
    });
  } catch (err: unknown) {
    console.error('[Media] Error listing user media:', err);
    res.status(500).json({ error: 'Failed to list media assets.' });
  }
});
