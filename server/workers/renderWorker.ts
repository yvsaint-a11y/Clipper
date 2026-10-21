import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { Worker, Job, type ConnectionOptions } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { mediaAssets } from '../db/schema/media';
import {
  getRenderJobById,
  updateRenderJobProgress,
} from '../services/renderJobService';
import {
  uploadLocalFileToR2,
  isR2Configured,
  generatePresignedDownloadUrl,
} from '../services/r2StorageService';
import { RENDER_QUEUE_NAME } from '../queue/renderQueue';
import { getRedisConnection, isRedisConfigured } from '../queue/redis';
import { renderSpecToMp4, RenderEnvironmentError } from '../../workers/remotion/renderPipeline';
import { checkRenderSpecFeatureSupport } from '../../workers/remotion/types';
import { validateCanonicalRenderSpec } from '../../src/features/editor/utils/renderSpec';
import type { VideoRenderJobData } from '../../src/types/queue';
import type { CanonicalRenderSpec } from '../../src/types/render';

export interface RenderJobProcessResult {
  jobId: string;
  success: boolean;
  outputStorageKey?: string;
  error?: string;
  alreadyCompleted?: boolean;
}

/**
 * Core rendering job processor.
 * Executes the complete rendering and delivery workflow for a persisted render job.
 */
export async function processRenderJob(renderJobId: string): Promise<RenderJobProcessResult> {
  // 1. Load job from database
  const job = await getRenderJobById(renderJobId);
  if (!job) {
    throw new Error(`Render job "${renderJobId}" not found in database.`);
  }

  // Idempotency: if already completed, do not re-render
  if (job.status === 'completed' && job.outputStorageKey) {
    return {
      jobId: renderJobId,
      success: true,
      outputStorageKey: job.outputStorageKey,
      alreadyCompleted: true,
    };
  }

  const spec = job.renderSpec as CanonicalRenderSpec;

  try {
    // 2. Validate specification
    const specValidation = validateCanonicalRenderSpec(spec);
    if (!specValidation.valid) {
      throw new Error(`Invalid render specification: ${specValidation.errors.join('; ')}`);
    }

    const supportReport = checkRenderSpecFeatureSupport(spec);
    if (!supportReport.isFullySupported) {
      throw new Error(
        `Specification contains unsupported features: ${supportReport.unsupportedFeatures.join(', ')}`,
      );
    }

    // 3. Mark job as processing
    await updateRenderJobProgress(renderJobId, {
      status: 'processing',
      progressPercentage: 10,
      currentStep: 'Resolving media references',
    });

    // 4. Resolve media references
    const mediaAssetUrls: Record<string, string> = {};
    const referencedAssetIds = (spec.sourceAssetSignatures || []).map((s) => s.assetId);

    const db = getDb();
    if (referencedAssetIds.length > 0) {
      if (!db) {
        throw new Error('Database connection unavailable for media asset resolution.');
      }

      for (const assetId of referencedAssetIds) {
        const [asset] = await db
          .select()
          .from(mediaAssets)
          .where(eq(mediaAssets.id, assetId))
          .limit(1);

        if (!asset) {
          throw new Error(
            `Referenced media asset "${assetId}" was not found in the database. Aborting export to prevent incomplete render.`,
          );
        }

        if (!asset.storageKey) {
          throw new Error(
            `Referenced media asset "${assetId}" has no storage key assigned. Aborting export.`,
          );
        }

        if (!isR2Configured()) {
          throw new Error(
            `Cloudflare R2 storage is not configured; cannot resolve media asset "${assetId}".`,
          );
        }

        try {
          const presigned = await generatePresignedDownloadUrl({
            storageKey: asset.storageKey,
            expiresInSeconds: 7200,
          });
          mediaAssetUrls[assetId] = presigned.downloadUrl;
        } catch (err) {
          throw new Error(
            `Failed to generate secure download URL for media asset "${assetId}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    // 5. Update progress to rendering frames
    await updateRenderJobProgress(renderJobId, {
      status: 'processing',
      progressPercentage: 25,
      currentStep: 'Rendering video frames with Remotion',
    });

    const tempDir = path.join(os.tmpdir(), 'clipper-renders');
    await fs.promises.mkdir(tempDir, { recursive: true });
    const localOutputPath = path.join(tempDir, `${job.id}.mp4`);

    // 6. Invoke Remotion rendering pipeline
    const renderResult = await renderSpecToMp4({
      spec,
      outputFilePath: localOutputPath,
      mediaAssetUrls,
      onProgress: async (percentage) => {
        const scaled = Math.min(79, 25 + Math.round(percentage * 0.54));
        await updateRenderJobProgress(renderJobId, {
          progressPercentage: scaled,
          currentStep: `Encoding frames (${percentage}%)`,
        });
      },
    });

    // 7. Verify file was created
    if (!fs.existsSync(localOutputPath)) {
      throw new Error('Remotion render completed but output MP4 file was not found.');
    }

    // 8. Upload finished MP4 to Cloudflare R2
    await updateRenderJobProgress(renderJobId, {
      status: 'processing',
      progressPercentage: 80,
      currentStep: 'Uploading completed MP4 to Cloudflare R2',
    });

    const s3StorageKey = `renders/${job.userId}/${job.id}.mp4`;
    await uploadLocalFileToR2(localOutputPath, s3StorageKey, 'video/mp4');

    // 9. Mark job completed ONLY after successful upload
    await updateRenderJobProgress(renderJobId, {
      status: 'completed',
      progressPercentage: 100,
      currentStep: 'Completed',
      outputStorageKey: s3StorageKey,
      outputFileSizeBytes: renderResult.fileSizeBytes,
      renderDurationSeconds: renderResult.durationSeconds,
    });

    // Cleanup local temp file
    try {
      await fs.promises.unlink(localOutputPath);
    } catch {
      // ignore unlink failure
    }

    return {
      jobId: renderJobId,
      success: true,
      outputStorageKey: s3StorageKey,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown rendering failure';
    console.error(`[RenderWorker] Failed render job ${renderJobId}:`, err);

    // Safely record failure state in database
    await updateRenderJobProgress(renderJobId, {
      status: 'failed',
      progressPercentage: 0,
      currentStep: 'Failed',
      errorMessage: errorMsg,
    });

    return {
      jobId: renderJobId,
      success: false,
      error: errorMsg,
    };
  }
}

let activeWorkerInstance: Worker<VideoRenderJobData> | null = null;

/**
 * Starts the BullMQ render worker process when Redis queue is available.
 */
export function startRenderWorker(customConnection?: ConnectionOptions): Worker<VideoRenderJobData> | null {
  if (!isRedisConfigured() && !customConnection) {
    return null;
  }

  if (activeWorkerInstance) {
    return activeWorkerInstance;
  }

  const connection = customConnection || (getRedisConnection() as unknown as ConnectionOptions);

  activeWorkerInstance = new Worker<VideoRenderJobData>(
    RENDER_QUEUE_NAME,
    async (job: Job<VideoRenderJobData>) => {
      const { renderJobId } = job.data;
      const result = await processRenderJob(renderJobId);
      if (!result.success) {
        throw new Error(result.error || 'Video rendering failed');
      }
      return result;
    },
    {
      connection,
      concurrency: 1, // Restrict to 1 heavy concurrent render in V1
    },
  );

  activeWorkerInstance.on('completed', (job) => {
    console.log(`[RenderWorker] BullMQ job ${job.id} completed successfully.`);
  });

  activeWorkerInstance.on('failed', (job, err) => {
    console.error(`[RenderWorker] BullMQ job ${job?.id} failed:`, err.message);
  });

  return activeWorkerInstance;
}
