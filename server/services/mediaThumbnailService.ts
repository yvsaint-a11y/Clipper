import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { mediaAssets } from '../db/schema/media';
import {
  downloadR2ObjectToFile,
  uploadLocalFileToR2,
  buildUserScopedThumbnailKey,
  isR2Configured,
} from './r2StorageService';
import { MediaIngestionRecord } from './mediaIngestionService';

const execFileAsync = promisify(execFile);

export class MediaThumbnailError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 422) {
    super(message);
    this.name = 'MediaThumbnailError';
    this.statusCode = statusCode;
  }
}

export interface ThumbnailDimensionsResult {
  width: number;
  height: number;
  scaled: boolean;
}

export interface ThumbnailMetadata {
  storageKey: string;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
  fileSizeBytes: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  timestampSeconds: number;
  generatedAt: string;
  error?: string;
}

/**
 * Calculates target dimensions for a video thumbnail:
 * - Maximum width approximately 640px.
 * - Preserves aspect ratio.
 * - Does NOT upscale videos smaller than 640px width.
 * - Enforces even dimensions.
 */
export function calculateThumbnailDimensions(
  sourceWidth?: number | null,
  sourceHeight?: number | null,
): ThumbnailDimensionsResult {
  const MAX_WIDTH = 640;

  if (
    !sourceWidth ||
    !sourceHeight ||
    typeof sourceWidth !== 'number' ||
    typeof sourceHeight !== 'number' ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return { width: MAX_WIDTH, height: 360, scaled: true };
  }

  // If width is already <= 640px, do not upscale
  if (sourceWidth <= MAX_WIDTH) {
    const evenW = sourceWidth % 2 === 0 ? sourceWidth : sourceWidth - 1;
    const evenH = sourceHeight % 2 === 0 ? sourceHeight : sourceHeight - 1;
    return {
      width: Math.max(2, evenW),
      height: Math.max(2, evenH),
      scaled: false,
    };
  }

  // Downscale preserving aspect ratio
  const scale = MAX_WIDTH / sourceWidth;
  let targetWidth = MAX_WIDTH;
  let targetHeight = Math.round(sourceHeight * scale);

  if (targetWidth % 2 !== 0) targetWidth -= 1;
  if (targetHeight % 2 !== 0) targetHeight -= 1;

  return {
    width: Math.max(2, targetWidth),
    height: Math.max(2, targetHeight),
    scaled: true,
  };
}

/**
 * Deterministically chooses a frame timestamp for video thumbnail extraction.
 * Avoids seeking past the end of short videos while capturing meaningful content.
 */
export function selectThumbnailTimestamp(durationMs?: number | null): number {
  if (!durationMs || durationMs <= 0) {
    return 0.0;
  }
  const durationSec = durationMs / 1000;
  if (durationSec <= 1.0) {
    return Math.max(0, durationSec * 0.1);
  }
  if (durationSec <= 4.0) {
    return Number((durationSec * 0.25).toFixed(2));
  }
  return 1.0; // Standard 1.0s offset for typical videos
}

/**
 * Builds discrete FFmpeg CLI arguments for JPEG thumbnail extraction.
 * Never constructs or interpolates shell command strings.
 */
export function buildFFmpegThumbnailArgs(options: {
  inputPath: string;
  outputPath: string;
  targetWidth: number;
  targetHeight: number;
  seekTimestampSeconds: number;
}): string[] {
  return [
    '-y',
    '-ss',
    options.seekTimestampSeconds.toFixed(3),
    '-i',
    options.inputPath,
    '-vframes',
    '1',
    '-c:v',
    'mjpeg',
    '-q:v',
    '3', // High JPEG quality
    '-vf',
    `scale=${options.targetWidth}:${options.targetHeight}`,
    options.outputPath,
  ];
}

/**
 * Safe process execution wrapper for FFmpeg thumbnail extraction.
 */
export async function runFFmpeg(args: string[]): Promise<void> {
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

  try {
    await execFileAsync(ffmpegPath, args, {
      timeout: 30000, // 30-second safeguard
      maxBuffer: 5 * 1024 * 1024,
    });
  } catch (err: unknown) {
    const error = err as { code?: string | number; stderr?: string; message?: string };
    const errMsg = error.stderr || error.message || 'Unknown ffmpeg process error';
    throw new MediaThumbnailError(`FFmpeg thumbnail generation failed: ${errMsg}`, 422);
  }
}

export const thumbnailEngine = {
  runFFmpeg,
  uploadLocalFileToR2,
};

/**
 * Generates a representative JPEG thumbnail for an owned video asset:
 * 1. Checks ownership and IDOR protection.
 * 2. Validates video media type (rejects non-video with 400).
 * 3. Idempotency: Returns existing ready thumbnail if already generated.
 * 4. Downloads source video from private R2 to temporary file.
 * 5. Extracts single frame via FFmpeg with aspect-ratio preservation and max 640px width.
 * 6. Uploads JPEG to private R2 storage.
 * 7. Updates asset metadata.thumbnail without destroying probe/proxy/ingestion status.
 * 8. Guaranteed temporary-file cleanup in finally block.
 */
export async function generateMediaThumbnail(
  assetId: string,
  userId: string,
): Promise<{ asset: MediaIngestionRecord; thumbnail: ThumbnailMetadata }> {
  if (!assetId || typeof assetId !== 'string') {
    throw new MediaThumbnailError('Valid media asset ID is required.', 400);
  }

  const db = getDb();
  if (!db) {
    throw new MediaThumbnailError('Database service is currently unavailable.', 503);
  }

  // 1. Verify existence & ownership
  const [existingAsset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);

  if (!existingAsset) {
    throw new MediaThumbnailError('Media asset not found or access denied.', 404);
  }

  // 2. Validate video media type
  const isVideoMime = existingAsset.mimeType && existingAsset.mimeType.toLowerCase().startsWith('video/');
  const hasVideoCodec = Boolean((existingAsset.metadata as Record<string, unknown>)?.videoCodec);

  if (!isVideoMime && !hasVideoCodec) {
    throw new MediaThumbnailError(
      `Asset "${existingAsset.originalFilename}" is not a video file and cannot have a video thumbnail.`,
      400,
    );
  }

  const existingMeta = (existingAsset.metadata as Record<string, unknown>) || {};
  const existingThumbnail = existingMeta.thumbnail as ThumbnailMetadata | undefined;

  // 3. Idempotency: Return existing thumbnail if already successfully generated
  if (existingThumbnail && existingThumbnail.status === 'ready' && existingAsset.thumbnailUrl) {
    return {
      asset: existingAsset as unknown as MediaIngestionRecord,
      thumbnail: existingThumbnail,
    };
  }

  // Prepare temporary file paths
  const ext = path.extname(existingAsset.originalFilename || existingAsset.storageKey) || '.mp4';
  const safeExt = ext.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 10) || '.mp4';
  const tempInputPath = path.join(os.tmpdir(), `clipper-thumb-in-${Date.now()}-${randomUUID()}${safeExt}`);
  const tempOutputPath = path.join(os.tmpdir(), `clipper-thumb-out-${Date.now()}-${randomUUID()}.jpg`);

  try {
    // 4. Download source from R2
    if (isR2Configured()) {
      await downloadR2ObjectToFile(existingAsset.storageKey, tempInputPath);
    } else {
      const fileExists = fs.existsSync(tempInputPath);
      if (!fileExists) {
        throw new MediaThumbnailError(
          'Storage service is not configured and source file is not available for thumbnail extraction.',
          503,
        );
      }
    }

    // 5. Calculate dimensions and timestamp
    const dimensions = calculateThumbnailDimensions(existingAsset.width, existingAsset.height);
    const timestamp = selectThumbnailTimestamp(existingAsset.durationMs);

    const ffmpegArgs = buildFFmpegThumbnailArgs({
      inputPath: tempInputPath,
      outputPath: tempOutputPath,
      targetWidth: dimensions.width,
      targetHeight: dimensions.height,
      seekTimestampSeconds: timestamp,
    });

    // 6. Run FFmpeg extraction
    await thumbnailEngine.runFFmpeg(ffmpegArgs);

    // 7. Verify output file size
    let fileSizeBytes = 0;
    try {
      const stats = await fs.promises.stat(tempOutputPath);
      fileSizeBytes = stats.size;
    } catch {
      throw new MediaThumbnailError('Thumbnail output file was not created by FFmpeg.', 422);
    }

    // 8. Upload to private R2
    const storageKey = buildUserScopedThumbnailKey(userId, assetId);
    if (isR2Configured()) {
      await thumbnailEngine.uploadLocalFileToR2(tempOutputPath, storageKey, 'image/jpeg');
    }

    const thumbnailMetadata: ThumbnailMetadata = {
      storageKey,
      width: dimensions.width,
      height: dimensions.height,
      mimeType: 'image/jpeg',
      fileSizeBytes,
      status: 'ready',
      timestampSeconds: timestamp,
      generatedAt: new Date().toISOString(),
    };

    // 9. Persist thumbnail metadata and update thumbnailUrl column without affecting existing probe/proxy data
    const updatedMeta = {
      ...existingMeta,
      thumbnail: thumbnailMetadata,
      thumbnailStorageKey: storageKey,
    };

    const [updated] = await db
      .update(mediaAssets)
      .set({
        thumbnailUrl: storageKey,
        metadata: updatedMeta,
        updatedAt: new Date(),
      })
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
      .returning();

    return {
      asset: updated as unknown as MediaIngestionRecord,
      thumbnail: thumbnailMetadata,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown thumbnail error';

    // Record failure in derivative metadata without destroying overall asset status
    try {
      const failedThumbnailMeta: ThumbnailMetadata = {
        storageKey: buildUserScopedThumbnailKey(userId, assetId),
        width: 0,
        height: 0,
        mimeType: 'image/jpeg',
        fileSizeBytes: 0,
        status: 'failed',
        timestampSeconds: 0,
        generatedAt: new Date().toISOString(),
        error: errorMessage,
      };

      await db
        .update(mediaAssets)
        .set({
          metadata: {
            ...existingMeta,
            thumbnail: failedThumbnailMeta,
          },
          updatedAt: new Date(),
        })
        .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)));
    } catch (recordErr) {
      console.error('[MediaThumbnail] Failed to record thumbnail failure in db:', recordErr);
    }

    if (err instanceof MediaThumbnailError) {
      throw err;
    }
    throw new MediaThumbnailError(`Thumbnail generation failed: ${errorMessage}`, 422);
  } finally {
    // 10. Guaranteed cleanup
    try {
      if (fs.existsSync(tempInputPath)) {
        await fs.promises.unlink(tempInputPath);
      }
    } catch (cleanupErr) {
      console.warn('[MediaThumbnail] Could not remove temp input file:', cleanupErr);
    }

    try {
      if (fs.existsSync(tempOutputPath)) {
        await fs.promises.unlink(tempOutputPath);
      }
    } catch (cleanupErr) {
      console.warn('[MediaThumbnail] Could not remove temp output file:', cleanupErr);
    }
  }
}
