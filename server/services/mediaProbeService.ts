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
  getMediaIngestionStatus,
  updateMediaIngestionMetadata,
  updateMediaIngestionStatus,
  MediaIngestionError,
  MediaIngestionRecord,
} from './mediaIngestionService';
import { downloadR2ObjectToFile, isR2Configured } from './r2StorageService';

const execFileAsync = promisify(execFile);

export class MediaProbeError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 422) {
    super(message);
    this.name = 'MediaProbeError';
    this.statusCode = statusCode;
  }
}

export interface FFprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string | number;
  sample_rate?: string | number;
  channels?: number;
  [key: string]: unknown;
}

export interface FFprobeFormat {
  format_name?: string;
  duration?: string | number;
  size?: string | number;
  bit_rate?: string | number;
  [key: string]: unknown;
}

export interface FFprobeRawOutput {
  streams?: FFprobeStream[];
  format?: FFprobeFormat;
}

export interface ProbedMediaMetadata {
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  container: string | null;
  hasAudio: boolean;
  audioChannels: number | null;
  sampleRate: number | null;
  fileSizeBytes: number | null;
  rawStreamsCount: number;
}

/**
 * Normalizes fractional or decimal frame rate string/number to a clean 2-decimal float.
 * E.g., "30/1" -> 30, "30000/1001" -> 29.97, "24000/1001" -> 23.98, "60/1" -> 60.
 */
export function normalizeFps(rawFps?: string | number | null): number | null {
  if (rawFps === undefined || rawFps === null) return null;

  if (typeof rawFps === 'number') {
    return Number.isFinite(rawFps) && rawFps > 0 ? Number(rawFps.toFixed(2)) : null;
  }

  const str = String(rawFps).trim();
  if (!str || str === '0/0' || str.toUpperCase() === 'N/A') return null;

  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 2) {
      const num = Number(parts[0]);
      const den = Number(parts[1]);
      if (!isNaN(num) && !isNaN(den) && den > 0 && num > 0) {
        const val = num / den;
        return Number.isFinite(val) ? Number(val.toFixed(2)) : null;
      }
    }
    return null;
  }

  const parsed = parseFloat(str);
  return !isNaN(parsed) && parsed > 0 && Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

/**
 * Normalizes duration in seconds (from FFprobe format or stream) into integer milliseconds.
 * E.g., "10.033" -> 10033 ms, 5.5 -> 5500 ms.
 */
export function normalizeDurationMs(rawDuration?: string | number | null): number | null {
  if (rawDuration === undefined || rawDuration === null) return null;

  const num = typeof rawDuration === 'number' ? rawDuration : parseFloat(String(rawDuration));
  if (isNaN(num) || num < 0 || !Number.isFinite(num)) return null;

  return Math.round(num * 1000);
}

/**
 * Parses raw FFprobe JSON output into structured, normalized media metadata.
 * Validates container, video, and audio streams.
 */
export function parseFFprobeOutput(raw: unknown): ProbedMediaMetadata {
  if (!raw || typeof raw !== 'object') {
    throw new MediaProbeError('Invalid probe output: expected JSON object.', 422);
  }

  const data = raw as FFprobeRawOutput;
  const streams = Array.isArray(data.streams) ? data.streams : [];
  const format = data.format && typeof data.format === 'object' ? data.format : {};

  if (streams.length === 0 && !format.duration) {
    throw new MediaProbeError('Invalid or corrupt media file: no streams or duration detected.', 422);
  }

  // 1. Video stream inspection
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const width = videoStream && typeof videoStream.width === 'number' && videoStream.width > 0 ? videoStream.width : null;
  const height = videoStream && typeof videoStream.height === 'number' && videoStream.height > 0 ? videoStream.height : null;

  // Frame rate priority: avg_frame_rate then r_frame_rate
  const fps = videoStream
    ? normalizeFps(videoStream.avg_frame_rate) ?? normalizeFps(videoStream.r_frame_rate)
    : null;

  const videoCodec = videoStream?.codec_name ? String(videoStream.codec_name).toLowerCase() : null;

  // 2. Audio stream inspection
  const audioStream = streams.find((s) => s.codec_type === 'audio');
  const hasAudio = Boolean(audioStream);
  const audioCodec = audioStream?.codec_name ? String(audioStream.codec_name).toLowerCase() : null;
  const audioChannels = audioStream && typeof audioStream.channels === 'number' && audioStream.channels > 0
    ? audioStream.channels
    : audioStream?.channels ? parseInt(String(audioStream.channels), 10) || null : null;
  const sampleRate = audioStream?.sample_rate ? parseInt(String(audioStream.sample_rate), 10) || null : null;

  // 3. Duration inspection (format duration preferred, fallback to video then audio)
  const durationMs =
    normalizeDurationMs(format.duration) ??
    normalizeDurationMs(videoStream?.duration) ??
    normalizeDurationMs(audioStream?.duration);

  // 4. Container / format
  const container = format.format_name ? String(format.format_name).trim() : null;

  // 5. File size in bytes
  const fileSizeBytes = format.size ? parseInt(String(format.size), 10) || null : null;

  return {
    durationMs,
    width,
    height,
    fps,
    videoCodec,
    audioCodec,
    container,
    hasAudio,
    audioChannels,
    sampleRate,
    fileSizeBytes,
    rawStreamsCount: streams.length,
  };
}

/**
 * Safely executes FFprobe CLI process on a local file path with strict argument separation.
 * Never passes user-controlled strings into shell.
 */
export async function runFFprobe(filePath: string): Promise<FFprobeRawOutput> {
  const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

  // Safe arguments array passed directly to OS process (no shell interpolation)
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ];

  try {
    const { stdout } = await execFileAsync(ffprobePath, args, {
      timeout: 20000, // 20s timeout safeguard
      maxBuffer: 10 * 1024 * 1024, // 10MB JSON buffer max
    });

    try {
      return JSON.parse(stdout) as FFprobeRawOutput;
    } catch {
      throw new MediaProbeError('Failed to parse FFprobe technical metadata output.', 422);
    }
  } catch (err: unknown) {
    if (err instanceof MediaProbeError) {
      throw err;
    }
    const error = err as { code?: string | number; stderr?: string; message?: string };
    const errMsg = error.stderr || error.message || 'Unknown ffprobe process error';
    throw new MediaProbeError(`FFprobe failed to inspect media: ${errMsg}`, 422);
  }
}

export const probeEngine = {
  runFFprobe,
};

/**
 * Probes technical metadata for an owned media asset:
 * 1. Checks asset ownership (asset.userId === authenticated userId) to prevent IDOR.
 * 2. Sets ingestion status to 'processing'.
 * 3. Downloads file from private R2 storage into a temporary local file.
 * 4. Runs FFprobe safely and extracts duration, width, height, fps, codecs, and audio presence.
 * 5. Updates media asset record with persisted metadata and transitions status to 'ready'.
 * 6. On failure, records the failure and transitions status to 'failed'.
 * 7. Guaranteed cleanup: Unlinks temporary file in all execution paths (success or error).
 */
export async function probeMediaAsset(
  assetId: string,
  userId: string,
): Promise<{ asset: MediaIngestionRecord; probedMetadata: ProbedMediaMetadata }> {
  if (!assetId || typeof assetId !== 'string') {
    throw new MediaProbeError('Valid media asset ID is required.', 400);
  }

  const db = getDb();
  if (!db) {
    throw new MediaProbeError('Database service is currently unavailable.', 503);
  }

  // 1. Verify existence & ownership
  const [existingAsset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);

  if (!existingAsset) {
    throw new MediaProbeError('Media asset not found or access denied.', 404);
  }

  // 2. Mark asset as 'processing'
  await updateMediaIngestionStatus(assetId, userId, 'processing');

  // Generate safe temporary file path in OS temp directory
  const ext = path.extname(existingAsset.originalFilename || existingAsset.storageKey) || '.bin';
  const safeExt = ext.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 10) || '.bin';
  const tempFilePath = path.join(os.tmpdir(), `clipper-probe-${Date.now()}-${randomUUID()}${safeExt}`);

  try {
    // 3. Download from private R2 storage
    if (isR2Configured()) {
      await downloadR2ObjectToFile(existingAsset.storageKey, tempFilePath);
    } else {
      // In dev or test environments where R2 credentials might be stubbed,
      // verify if the file was placed in temp by a test mock or throw
      const fileExists = fs.existsSync(tempFilePath);
      if (!fileExists) {
        throw new MediaProbeError('Storage service not configured and file not available for probing.', 503);
      }
    }

    // 4. Run FFprobe
    const rawProbeData = await probeEngine.runFFprobe(tempFilePath);

    // 5. Parse and normalize technical metadata
    const probed = parseFFprobeOutput(rawProbeData);

    // 6. Persist metadata to database and transition status to 'ready'
    const updated = await updateMediaIngestionMetadata(
      assetId,
      userId,
      {
        durationMs: probed.durationMs,
        width: probed.width,
        height: probed.height,
        fps: probed.fps,
        hasAudio: probed.hasAudio,
        fileSizeBytes: probed.fileSizeBytes ?? Number(existingAsset.fileSizeBytes),
        extra: {
          videoCodec: probed.videoCodec,
          audioCodec: probed.audioCodec,
          container: probed.container,
          audioChannels: probed.audioChannels,
          sampleRate: probed.sampleRate,
          probedAt: new Date().toISOString(),
        },
      },
      'ready',
    );

    return {
      asset: updated,
      probedMetadata: probed,
    };
  } catch (err: unknown) {
    // 7. On failure, update asset status to 'failed' and record error
    const errorMessage = err instanceof Error ? err.message : 'Unknown probing failure';
    try {
      await updateMediaIngestionStatus(assetId, userId, 'failed', errorMessage);
    } catch (statusUpdateErr) {
      console.error('[MediaProbe] Failed to record failure status in db:', statusUpdateErr);
    }

    if (err instanceof MediaProbeError || err instanceof MediaIngestionError) {
      throw err;
    }
    throw new MediaProbeError(`Media probe failed: ${errorMessage}`, 422);
  } finally {
    // 8. Guaranteed temporary file cleanup
    try {
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
      }
    } catch (cleanupErr) {
      console.warn('[MediaProbe] Warning: Could not remove temporary probe file:', cleanupErr);
    }
  }
}
