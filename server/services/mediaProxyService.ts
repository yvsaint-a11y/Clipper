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
  updateMediaIngestionMetadata,
  updateMediaIngestionStatus,
  MediaIngestionError,
  MediaIngestionRecord,
} from './mediaIngestionService';
import {
  downloadR2ObjectToFile,
  uploadLocalFileToR2,
  buildUserScopedProxyKey,
  isR2Configured,
} from './r2StorageService';

const execFileAsync = promisify(execFile);

export class MediaProxyError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 422) {
    super(message);
    this.name = 'MediaProxyError';
    this.statusCode = statusCode;
  }
}

export interface ProxyDimensionsResult {
  width: number;
  height: number;
  scaled: boolean;
}

export interface BuildProxyArgsOptions {
  inputPath: string;
  outputPath: string;
  targetWidth?: number | null;
  targetHeight?: number | null;
  hasAudio?: boolean;
}

export interface ProxyMetadata {
  storageKey: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;
  status: 'ready';
  hasAudio: boolean;
  generatedAt: string;
}

/**
 * Calculates target dimensions for an editing proxy:
 * - Maximum bounds: 1280x720 (720p).
 * - Preserves aspect ratio.
 * - Does NOT upscale media smaller than 720p in both dimensions.
 * - Enforces even width and height for H.264 / yuv420p compatibility.
 */
export function calculateProxyDimensions(
  sourceWidth?: number | null,
  sourceHeight?: number | null,
): ProxyDimensionsResult {
  const MAX_WIDTH = 1280;
  const MAX_HEIGHT = 720;

  if (
    !sourceWidth ||
    !sourceHeight ||
    typeof sourceWidth !== 'number' ||
    typeof sourceHeight !== 'number' ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return { width: MAX_WIDTH, height: MAX_HEIGHT, scaled: true };
  }

  // If source is already within 720p bounds (no dimension exceeds maximums), do not upscale
  if (sourceWidth <= MAX_WIDTH && sourceHeight <= MAX_HEIGHT) {
    const evenW = sourceWidth % 2 === 0 ? sourceWidth : sourceWidth - 1;
    const evenH = sourceHeight % 2 === 0 ? sourceHeight : sourceHeight - 1;
    return {
      width: Math.max(2, evenW),
      height: Math.max(2, evenH),
      scaled: false,
    };
  }

  // Downscale preserving aspect ratio
  const scale = Math.min(MAX_WIDTH / sourceWidth, MAX_HEIGHT / sourceHeight);
  let targetWidth = Math.round(sourceWidth * scale);
  let targetHeight = Math.round(sourceHeight * scale);

  // Enforce even dimensions for H.264
  if (targetWidth % 2 !== 0) targetWidth -= 1;
  if (targetHeight % 2 !== 0) targetHeight -= 1;

  return {
    width: Math.max(2, targetWidth),
    height: Math.max(2, targetHeight),
    scaled: true,
  };
}

/**
 * Builds discrete FFmpeg CLI arguments for browser-friendly editing proxy generation.
 * Never constructs or interpolates shell command strings.
 */
export function buildFFmpegProxyArgs(options: BuildProxyArgsOptions): string[] {
  const { inputPath, outputPath, targetWidth, targetHeight, hasAudio = false } = options;

  const args: string[] = [
    '-y', // Overwrite destination
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p', // Universal HTML5 browser playback
  ];

  // Scale filter
  if (targetWidth && targetHeight) {
    args.push('-vf', `scale=${targetWidth}:${targetHeight}`);
  } else {
    // Adaptive fallback scale filter with even dimensions and no upscale
    args.push(
      '-vf',
      "scale='min(1280,iw)':min'(720,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    );
  }

  // Bitrate and faststart
  args.push(
    '-crf',
    '23',
    '-maxrate',
    '3500k',
    '-bufsize',
    '7000k',
    '-movflags',
    '+faststart', // Web optimization (moov atom at beginning)
  );

  // Audio handling: preserve if present, disable if absent
  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2');
  } else {
    args.push('-an');
  }

  args.push(outputPath);

  return args;
}

/**
 * Safe process execution wrapper for FFmpeg.
 * Can be mocked or spied on in test environments without real video workloads.
 */
export async function runFFmpeg(args: string[]): Promise<void> {
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

  try {
    await execFileAsync(ffmpegPath, args, {
      timeout: 120000, // 2-minute safety limit for proxy generation
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err: unknown) {
    const error = err as { code?: string | number; stderr?: string; message?: string };
    const errMsg = error.stderr || error.message || 'Unknown ffmpeg process error';
    throw new MediaProxyError(`FFmpeg proxy generation failed: ${errMsg}`, 422);
  }
}

export const proxyEngine = {
  runFFmpeg,
};

/**
 * Generates an editing proxy for an owned video asset:
 * 1. Verifies ownership and access control (prevent IDOR).
 * 2. Validates that the asset is video media.
 * 3. Transitions ingestion status to 'processing'.
 * 4. Downloads source video from private R2 to temporary disk.
 * 5. Transcodes to 720p H.264 web-optimized MP4 using FFmpeg.
 * 6. Uploads proxy to deterministic user-scoped R2 storage key.
 * 7. Persists proxy metadata in database and transitions status to 'ready'.
 * 8. Guaranteed temporary file cleanup in all paths (finally block).
 */
export async function generateMediaProxy(
  assetId: string,
  userId: string,
): Promise<{ asset: MediaIngestionRecord; proxy: ProxyMetadata }> {
  if (!assetId || typeof assetId !== 'string') {
    throw new MediaProxyError('Valid media asset ID is required.', 400);
  }

  const db = getDb();
  if (!db) {
    throw new MediaProxyError('Database service is currently unavailable.', 503);
  }

  // 1. Verify existence & ownership
  const [existingAsset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);

  if (!existingAsset) {
    throw new MediaProxyError('Media asset not found or access denied.', 404);
  }

  // 2. Validate video media
  const isVideoMime = existingAsset.mimeType && existingAsset.mimeType.toLowerCase().startsWith('video/');
  const hasVideoCodec = Boolean((existingAsset.metadata as Record<string, unknown>)?.videoCodec);

  if (!isVideoMime && !hasVideoCodec) {
    throw new MediaProxyError(
      `Asset "${existingAsset.originalFilename}" is not a video file and cannot be converted to a proxy.`,
      400,
    );
  }

  // 3. Mark asset as processing
  await updateMediaIngestionStatus(assetId, userId, 'processing');

  // Prepare temporary file paths
  const ext = path.extname(existingAsset.originalFilename || existingAsset.storageKey) || '.mp4';
  const safeExt = ext.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 10) || '.mp4';
  const tempInputPath = path.join(os.tmpdir(), `clipper-proxy-in-${Date.now()}-${randomUUID()}${safeExt}`);
  const tempOutputPath = path.join(os.tmpdir(), `clipper-proxy-out-${Date.now()}-${randomUUID()}.mp4`);

  try {
    // 4. Download source from R2
    if (isR2Configured()) {
      await downloadR2ObjectToFile(existingAsset.storageKey, tempInputPath);
    } else {
      const fileExists = fs.existsSync(tempInputPath);
      if (!fileExists) {
        throw new MediaProxyError(
          'Storage service is not configured and source file is not available for proxy generation.',
          503,
        );
      }
    }

    // 5. Calculate target dimensions and build arguments
    const dimensions = calculateProxyDimensions(existingAsset.width, existingAsset.height);
    const ffmpegArgs = buildFFmpegProxyArgs({
      inputPath: tempInputPath,
      outputPath: tempOutputPath,
      targetWidth: dimensions.width,
      targetHeight: dimensions.height,
      hasAudio: Boolean(existingAsset.hasAudio),
    });

    // 6. Transcode with FFmpeg
    await proxyEngine.runFFmpeg(ffmpegArgs);

    // 7. Verify output file and get size
    let fileSizeBytes = 0;
    try {
      const stats = await fs.promises.stat(tempOutputPath);
      fileSizeBytes = stats.size;
    } catch {
      throw new MediaProxyError('Generated proxy output file was not created by FFmpeg.', 422);
    }

    // 8. Upload proxy to private R2
    const proxyStorageKey = buildUserScopedProxyKey(userId, assetId);
    if (isR2Configured()) {
      await uploadLocalFileToR2(tempOutputPath, proxyStorageKey, 'video/mp4');
    }

    const proxyMetadata: ProxyMetadata = {
      storageKey: proxyStorageKey,
      width: dimensions.width,
      height: dimensions.height,
      fileSizeBytes,
      mimeType: 'video/mp4',
      status: 'ready',
      hasAudio: Boolean(existingAsset.hasAudio),
      generatedAt: new Date().toISOString(),
    };

    // 9. Persist to database without destroying existing probe metadata
    const updated = await updateMediaIngestionMetadata(
      assetId,
      userId,
      {
        extra: {
          proxy: proxyMetadata,
          proxyStorageKey,
        },
      },
      'ready',
    );

    return {
      asset: updated,
      proxy: proxyMetadata,
    };
  } catch (err: unknown) {
    // Record failure in database
    const errorMessage = err instanceof Error ? err.message : 'Unknown proxy generation error';
    try {
      await updateMediaIngestionStatus(assetId, userId, 'failed', errorMessage);
    } catch (statusErr) {
      console.error('[MediaProxy] Failed to record failure status in db:', statusErr);
    }

    if (err instanceof MediaProxyError || err instanceof MediaIngestionError) {
      throw err;
    }
    throw new MediaProxyError(`Proxy generation failed: ${errorMessage}`, 422);
  } finally {
    // 10. Guaranteed cleanup of temporary files
    try {
      if (fs.existsSync(tempInputPath)) {
        await fs.promises.unlink(tempInputPath);
      }
    } catch (cleanupErr) {
      console.warn('[MediaProxy] Could not remove temp input file:', cleanupErr);
    }

    try {
      if (fs.existsSync(tempOutputPath)) {
        await fs.promises.unlink(tempOutputPath);
      }
    } catch (cleanupErr) {
      console.warn('[MediaProxy] Could not remove temp output file:', cleanupErr);
    }
  }
}
