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
  uploadBufferToR2,
  downloadR2ObjectToBuffer,
  buildUserScopedWaveformKey,
  isR2Configured,
} from './r2StorageService';
import { MediaIngestionRecord } from './mediaIngestionService';

const execFileAsync = promisify(execFile);

export const DEFAULT_WAVEFORM_SAMPLE_COUNT = 1000;

export class MediaWaveformError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 422) {
    super(message);
    this.name = 'MediaWaveformError';
    this.statusCode = statusCode;
  }
}

export interface WaveformMetadata {
  storageKey: string;
  sampleCount: number;
  durationMs: number;
  mimeType: 'application/json';
  fileSizeBytes: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  generatedAt: string;
  error?: string;
}

export interface WaveformData {
  assetId: string;
  sampleCount: number;
  durationMs: number;
  samples: number[];
}

/**
 * Computes deterministic normalized amplitude values [0.0, 1.0] from raw 16-bit PCM audio samples.
 * Bins samples into exactly `targetSampleCount` buckets and extracts peak normalized amplitude per bucket.
 */
export function computeNormalizedWaveform(
  int16Samples: Int16Array,
  targetSampleCount: number = DEFAULT_WAVEFORM_SAMPLE_COUNT,
): number[] {
  if (!int16Samples || int16Samples.length === 0) {
    return new Array(targetSampleCount).fill(0.0);
  }

  const result: number[] = new Array(targetSampleCount);
  const totalSamples = int16Samples.length;
  const blockSize = totalSamples / targetSampleCount;

  for (let i = 0; i < targetSampleCount; i++) {
    const start = Math.floor(i * blockSize);
    const end = Math.min(totalSamples, Math.floor((i + 1) * blockSize));

    let peak = 0;
    for (let j = start; j < end; j++) {
      const val = Math.abs(int16Samples[j]);
      if (val > peak) {
        peak = val;
      }
    }

    // Normalize 16-bit PCM amplitude to [0.0, 1.0] rounded to 3 decimal places
    const normalized = Math.min(1.0, peak / 32768.0);
    result[i] = Number(normalized.toFixed(3));
  }

  return result;
}

/**
 * Builds discrete FFmpeg CLI arguments to decode audio into compact mono 16-bit PCM raw samples.
 * Never constructs or interpolates shell command strings.
 */
export function buildFFmpegWaveformArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-y',
    '-i',
    inputPath,
    '-vn', // Discard video stream
    '-ac',
    '1', // Downmix to mono
    '-ar',
    '4000', // Downsample to 4kHz for fast, lightweight processing
    '-f',
    's16le', // Raw 16-bit signed little-endian PCM
    outputPath,
  ];
}

/**
 * Safe process execution wrapper for FFmpeg audio extraction.
 */
export async function runFFmpeg(args: string[]): Promise<void> {
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

  try {
    await execFileAsync(ffmpegPath, args, {
      timeout: 60000, // 60-second safeguard
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err: unknown) {
    const error = err as { code?: string | number; stderr?: string; message?: string };
    const errMsg = error.stderr || error.message || 'Unknown ffmpeg process error';
    throw new MediaWaveformError(`FFmpeg waveform extraction failed: ${errMsg}`, 422);
  }
}

export const waveformEngine = {
  runFFmpeg,
  uploadBufferToR2,
};

/**
 * Generates a compact normalized audio waveform for an owned audio asset:
 * 1. Checks ownership and IDOR protection.
 * 2. Validates audio media type (rejects non-audio with 400).
 * 3. Idempotency: Returns existing ready waveform if already generated.
 * 4. Downloads source audio from private R2 to temporary file.
 * 5. Extracts raw mono PCM via FFmpeg.
 * 6. Normalizes amplitudes into exactly 1,000 samples [0.0, 1.0].
 * 7. Uploads waveform JSON to private R2 storage.
 * 8. Updates asset metadata.waveform without destroying probe/proxy/ingestion status.
 * 9. Guaranteed temporary-file cleanup in finally block.
 */
export async function generateMediaWaveform(
  assetId: string,
  userId: string,
  targetSampleCount: number = DEFAULT_WAVEFORM_SAMPLE_COUNT,
): Promise<{ asset: MediaIngestionRecord; waveform: WaveformMetadata; data: WaveformData }> {
  if (!assetId || typeof assetId !== 'string') {
    throw new MediaWaveformError('Valid media asset ID is required.', 400);
  }

  const db = getDb();
  if (!db) {
    throw new MediaWaveformError('Database service is currently unavailable.', 503);
  }

  // 1. Verify existence & ownership
  const [existingAsset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);

  if (!existingAsset) {
    throw new MediaWaveformError('Media asset not found or access denied.', 404);
  }

  // 2. Validate audio media type (reject non-audio)
  const isAudioMime = existingAsset.mimeType && existingAsset.mimeType.toLowerCase().startsWith('audio/');
  const meta = (existingAsset.metadata as Record<string, unknown>) || {};
  const hasAudioCodecOnly = Boolean(meta.audioCodec) && !Boolean(meta.videoCodec);

  if (!isAudioMime && !hasAudioCodecOnly) {
    throw new MediaWaveformError(
      `Asset "${existingAsset.originalFilename}" is not an audio file and cannot generate an audio waveform.`,
      400,
    );
  }

  const existingWaveformMeta = meta.waveform as WaveformMetadata | undefined;

  // 3. Idempotency: Return existing waveform if already successfully generated
  if (existingWaveformMeta && existingWaveformMeta.status === 'ready' && existingAsset.waveformUrl) {
    let cachedData: WaveformData;
    if (isR2Configured()) {
      try {
        const buffer = await downloadR2ObjectToBuffer(existingWaveformMeta.storageKey);
        cachedData = JSON.parse(buffer.toString('utf-8')) as WaveformData;
      } catch {
        // Fallback to minimal data if retrieval fails
        cachedData = {
          assetId: existingAsset.id,
          sampleCount: existingWaveformMeta.sampleCount,
          durationMs: existingWaveformMeta.durationMs,
          samples: [],
        };
      }
    } else {
      cachedData = {
        assetId: existingAsset.id,
        sampleCount: existingWaveformMeta.sampleCount,
        durationMs: existingWaveformMeta.durationMs,
        samples: new Array(existingWaveformMeta.sampleCount).fill(0.0),
      };
    }

    return {
      asset: existingAsset as unknown as MediaIngestionRecord,
      waveform: existingWaveformMeta,
      data: cachedData,
    };
  }

  // Prepare temporary file paths
  const ext = path.extname(existingAsset.originalFilename || existingAsset.storageKey) || '.mp3';
  const safeExt = ext.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 10) || '.mp3';
  const tempInputPath = path.join(os.tmpdir(), `clipper-wave-in-${Date.now()}-${randomUUID()}${safeExt}`);
  const tempOutputPath = path.join(os.tmpdir(), `clipper-wave-out-${Date.now()}-${randomUUID()}.raw`);

  try {
    // 4. Download source from R2
    if (isR2Configured()) {
      await downloadR2ObjectToFile(existingAsset.storageKey, tempInputPath);
    } else {
      const fileExists = fs.existsSync(tempInputPath);
      if (!fileExists) {
        throw new MediaWaveformError(
          'Storage service is not configured and source file is not available for waveform extraction.',
          503,
        );
      }
    }

    // 5. Decode audio to raw PCM
    const ffmpegArgs = buildFFmpegWaveformArgs(tempInputPath, tempOutputPath);
    await waveformEngine.runFFmpeg(ffmpegArgs);

    // 6. Read PCM buffer and compute normalized waveform samples
    let pcmBuffer: Buffer;
    try {
      pcmBuffer = await fs.promises.readFile(tempOutputPath);
    } catch {
      throw new MediaWaveformError('FFmpeg failed to produce raw audio output.', 422);
    }

    const int16Samples = new Int16Array(
      pcmBuffer.buffer,
      pcmBuffer.byteOffset,
      Math.floor(pcmBuffer.byteLength / 2),
    );

    const samples = computeNormalizedWaveform(int16Samples, targetSampleCount);
    const durationMs = existingAsset.durationMs || 0;

    const waveformData: WaveformData = {
      assetId: existingAsset.id,
      sampleCount: targetSampleCount,
      durationMs,
      samples,
    };

    // 7. Upload compact waveform JSON to private R2
    const storageKey = buildUserScopedWaveformKey(userId, assetId);
    const jsonBuffer = Buffer.from(JSON.stringify(waveformData));

    if (isR2Configured()) {
      await waveformEngine.uploadBufferToR2(jsonBuffer, storageKey, 'application/json');
    }

    const waveformMetadata: WaveformMetadata = {
      storageKey,
      sampleCount: targetSampleCount,
      durationMs,
      mimeType: 'application/json',
      fileSizeBytes: jsonBuffer.length,
      status: 'ready',
      generatedAt: new Date().toISOString(),
    };

    // 8. Persist waveform metadata and update waveformUrl column
    const updatedMeta = {
      ...meta,
      waveform: waveformMetadata,
      waveformStorageKey: storageKey,
    };

    const [updated] = await db
      .update(mediaAssets)
      .set({
        waveformUrl: storageKey,
        metadata: updatedMeta,
        updatedAt: new Date(),
      })
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
      .returning();

    return {
      asset: updated as unknown as MediaIngestionRecord,
      waveform: waveformMetadata,
      data: waveformData,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown waveform error';

    // Record failure in derivative metadata without destroying overall asset status
    try {
      const failedWaveformMeta: WaveformMetadata = {
        storageKey: buildUserScopedWaveformKey(userId, assetId),
        sampleCount: targetSampleCount,
        durationMs: existingAsset.durationMs || 0,
        mimeType: 'application/json',
        fileSizeBytes: 0,
        status: 'failed',
        generatedAt: new Date().toISOString(),
        error: errorMessage,
      };

      await db
        .update(mediaAssets)
        .set({
          metadata: {
            ...meta,
            waveform: failedWaveformMeta,
          },
          updatedAt: new Date(),
        })
        .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)));
    } catch (recordErr) {
      console.error('[MediaWaveform] Failed to record waveform failure in db:', recordErr);
    }

    if (err instanceof MediaWaveformError) {
      throw err;
    }
    throw new MediaWaveformError(`Waveform generation failed: ${errorMessage}`, 422);
  } finally {
    // 9. Guaranteed cleanup
    try {
      if (fs.existsSync(tempInputPath)) {
        await fs.promises.unlink(tempInputPath);
      }
    } catch (cleanupErr) {
      console.warn('[MediaWaveform] Could not remove temp input file:', cleanupErr);
    }

    try {
      if (fs.existsSync(tempOutputPath)) {
        await fs.promises.unlink(tempOutputPath);
      }
    } catch (cleanupErr) {
      console.warn('[MediaWaveform] Could not remove temp output file:', cleanupErr);
    }
  }
}
