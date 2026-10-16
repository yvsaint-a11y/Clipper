import { Worker, Job, type ConnectionOptions } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { mediaAssets } from '../db/schema/media';
import {
  MEDIA_QUEUE_NAME,
  MediaJobData,
  MediaJobResult,
  MediaOperation,
  enqueueMediaJob,
} from '../queue/mediaQueue';
import { getRedisConnection, closeRedisConnection, getMaskedRedisUrl } from '../queue/redis';
import { probeMediaAsset, MediaProbeError } from '../services/mediaProbeService';
import { generateMediaProxy, MediaProxyError } from '../services/mediaProxyService';
import { generateMediaThumbnail, MediaThumbnailError } from '../services/mediaThumbnailService';
import { generateMediaWaveform, MediaWaveformError } from '../services/mediaWaveformService';

export class PermanentJobError extends Error {
  isPermanent = true;
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

/**
 * Determines whether an error is a permanent, non-retryable failure.
 * Non-retryable errors include:
 * - Ownership / authorization mismatch
 * - Missing or nonexistent media asset
 * - Incompatible media types (e.g., trying to generate thumbnail from audio)
 */
export function isPermanentError(err: unknown): boolean {
  if (err instanceof PermanentJobError) return true;

  if (err instanceof MediaProbeError && err.statusCode === 400) return true;
  if (err instanceof MediaThumbnailError && err.statusCode === 400) return true;
  if (err instanceof MediaWaveformError && err.statusCode === 400) return true;
  if (err instanceof MediaProxyError && err.statusCode === 400) return true;

  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (
    msg.includes('not found') ||
    msg.includes('access denied') ||
    msg.includes('not a video file') ||
    msg.includes('not an audio file') ||
    msg.includes('unsupported media type') ||
    msg.includes('unsupported mime type')
  ) {
    return true;
  }

  return false;
}

/**
 * Helper to prevent BullMQ from executing further retries on permanent failures.
 */
function discardJobRetries(job: Job<MediaJobData, MediaJobResult>): void {
  if (job?.opts) {
    job.opts.attempts = job.attemptsMade ?? 1;
  }
  if (typeof (job as any)?.discard === 'function') {
    (job as any).discard();
  }
}

/**
 * Core business processor for a media job.
 * 1. Validates ownership and resource existence in PostgreSQL.
 * 2. Routes to the appropriate existing media service.
 * 3. Distinguishes permanent validation errors from transient errors.
 */
export async function processMediaJob(
  job: Job<MediaJobData, MediaJobResult>,
): Promise<MediaJobResult> {
  const { assetId, userId, operation } = job.data;

  const db = getDb();
  if (!db) {
    throw new Error('Database service is currently unavailable.');
  }

  // 1. Worker-level authorization and existence verification
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);

  if (!asset) {
    const permErr = new PermanentJobError(
      `Media asset "${assetId}" was not found or ownership mismatch for user "${userId}".`,
    );
    // Discard further retries for permanent authorization/existence failures
    discardJobRetries(job);
    throw permErr;
  }

  try {
    let operationResult: Record<string, unknown> = {};

    // 2. Explicit routing to existing services
    switch (operation) {
      case 'probe': {
        const probed = await probeMediaAsset(assetId, userId);
        operationResult = { asset: probed.asset, probedMetadata: probed.probedMetadata };

        // Phase 8G: Automatic Media Processing Pipeline Chaining
        // After successful probe, automatically enqueue follow-up derivative jobs
        const assetMime = probed.asset.mimeType || '';
        const existingMeta = (probed.asset.metadata as Record<string, any>) || {};

        if (assetMime.startsWith('video/')) {
          // Video: enqueue proxy and thumbnail if not already ready
          if (existingMeta.proxy?.status !== 'ready') {
            try {
              await enqueueMediaJob({ assetId, userId, operation: 'proxy' });
            } catch (chainErr) {
              console.warn(`[Worker] Failed to chain proxy job for asset ${assetId}:`, chainErr);
            }
          }
          if (existingMeta.thumbnail?.status !== 'ready') {
            try {
              await enqueueMediaJob({ assetId, userId, operation: 'thumbnail' });
            } catch (chainErr) {
              console.warn(`[Worker] Failed to chain thumbnail job for asset ${assetId}:`, chainErr);
            }
          }
        } else if (assetMime.startsWith('audio/')) {
          // Audio: enqueue waveform if not already ready
          if (existingMeta.waveform?.status !== 'ready') {
            try {
              await enqueueMediaJob({ assetId, userId, operation: 'waveform' });
            } catch (chainErr) {
              console.warn(`[Worker] Failed to chain waveform job for asset ${assetId}:`, chainErr);
            }
          }
        }
        break;
      }
      case 'proxy': {
        const proxied = await generateMediaProxy(assetId, userId);
        operationResult = { asset: proxied.asset, proxy: proxied.proxy };
        break;
      }
      case 'thumbnail': {
        const thumb = await generateMediaThumbnail(assetId, userId);
        operationResult = { asset: thumb.asset, thumbnail: thumb.thumbnail };
        break;
      }
      case 'waveform': {
        const wave = await generateMediaWaveform(assetId, userId);
        operationResult = { asset: wave.asset, waveform: wave.waveform, sampleCount: wave.data.sampleCount };
        break;
      }
      default: {
        const unknownOpErr = new PermanentJobError(`Unsupported media operation: "${operation}".`);
        discardJobRetries(job);
        throw unknownOpErr;
      }
    }

    return {
      assetId,
      userId,
      operation,
      success: true,
      result: operationResult,
      completedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    if (isPermanentError(err)) {
      discardJobRetries(job); // Stop pointless retries for permanent errors
    }
    throw err;
  }
}

export interface MediaWorkerOptions {
  concurrency?: number;
  connection?: ConnectionOptions;
}

/**
 * Creates and starts a BullMQ Worker for the media-processing queue.
 */
export function createMediaWorker(options?: MediaWorkerOptions): Worker<MediaJobData, MediaJobResult> {
  const connection = options?.connection || (getRedisConnection() as unknown as ConnectionOptions);
  const concurrency = options?.concurrency ?? 2;

  const worker = new Worker<MediaJobData, MediaJobResult>(
    MEDIA_QUEUE_NAME,
    async (job) => processMediaJob(job),
    {
      connection,
      concurrency,
    },
  );

  worker.on('completed', (job: Job<MediaJobData, MediaJobResult>) => {
    console.log(
      `[MediaWorker] Job ${job.id} (${job.data.operation}) completed for asset ${job.data.assetId}`,
    );
  });

  worker.on('failed', (job: Job<MediaJobData, MediaJobResult> | undefined, err: Error) => {
    if (job) {
      console.warn(
        `[MediaWorker] Job ${job.id} (${job.data.operation}) failed (attempt ${job.attemptsMade}/${job.opts.attempts || 1}): ${err.message}`,
      );
    } else {
      console.error(`[MediaWorker] Worker error: ${err.message}`);
    }
  });

  return worker;
}

let activeWorker: Worker<MediaJobData, MediaJobResult> | null = null;

/**
 * Starts the media worker service with graceful shutdown handling.
 */
export async function startMediaWorker(options?: MediaWorkerOptions): Promise<Worker<MediaJobData, MediaJobResult>> {
  if (activeWorker) {
    return activeWorker;
  }

  activeWorker = createMediaWorker(options);
  console.log(`[MediaWorker] Started processing queue "${MEDIA_QUEUE_NAME}" via Redis at ${getMaskedRedisUrl()}`);

  const handleShutdown = async (signal: string) => {
    console.log(`[MediaWorker] Received ${signal}. Initiating graceful shutdown...`);
    if (activeWorker) {
      try {
        await activeWorker.close();
        console.log('[MediaWorker] Worker closed.');
      } catch (err) {
        console.error('[MediaWorker] Error closing worker:', err);
      } finally {
        activeWorker = null;
      }
    }
    await closeRedisConnection();
    console.log('[MediaWorker] Redis connections closed.');
  };

  process.once('SIGINT', () => handleShutdown('SIGINT'));
  process.once('SIGTERM', () => handleShutdown('SIGTERM'));

  return activeWorker;
}

// CLI entry point support: `npm run worker`
if (process.argv[1] && process.argv[1].endsWith('mediaWorker.ts')) {
  startMediaWorker().catch((err) => {
    console.error('[MediaWorker] Fatal startup error:', err);
    process.exit(1);
  });
}
