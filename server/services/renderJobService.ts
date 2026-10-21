import { getDb } from '../db';
import { renderJobs } from '../db/schema/renderJobs';
import { projects } from '../db/schema/projects';
import { eq, and, desc } from 'drizzle-orm';
import { isR2Configured, generatePresignedDownloadUrl } from './r2StorageService';
import type { ExportResolution } from '../../src/types/render';

export interface CreateRenderJobInput {
  userId: string;
  projectId: string;
  projectVersionId?: string | null;
  idempotencyKey: string;
  resolution: ExportResolution;
  fps: 30 | 60;
  watermark?: boolean;
  renderSpec: Record<string, any>;
}

export interface RenderJobResult {
  job: typeof renderJobs.$inferSelect & { downloadUrl?: string | null };
  isExisting: boolean;
}

/**
 * Retrieves a render job by ID, ensuring strict tenant isolation if userId is provided.
 */
export async function getRenderJobById(
  jobId: string,
  userId?: string,
): Promise<(typeof renderJobs.$inferSelect & { downloadUrl?: string | null }) | null> {
  const db = getDb();
  if (!db) {
    throw new Error('Database service is currently unavailable.');
  }

  const conditions = [eq(renderJobs.id, jobId)];
  if (userId) {
    conditions.push(eq(renderJobs.userId, userId));
  }

  const [job] = await db
    .select()
    .from(renderJobs)
    .where(and(...conditions))
    .limit(1);

  if (!job) {
    return null;
  }

  let downloadUrl: string | null = null;
  if (job.status === 'completed' && job.outputStorageKey && isR2Configured()) {
    try {
      const presigned = await generatePresignedDownloadUrl({
        storageKey: job.outputStorageKey,
        expiresInSeconds: 3600,
        downloadFilename: `clipper_export_${job.id.slice(0, 8)}.${job.format || 'mp4'}`,
      });
      downloadUrl = presigned.downloadUrl;
    } catch (err) {
      console.warn(`[RenderJobService] Could not generate presigned download URL for job ${job.id}:`, err);
    }
  }

  return {
    ...job,
    downloadUrl,
  };
}

/**
 * Searches for an existing render job with the exact same idempotencyKey for the authenticated user.
 */
export async function findExistingRenderJob(
  idempotencyKey: string,
  userId: string,
): Promise<(typeof renderJobs.$inferSelect & { downloadUrl?: string | null }) | null> {
  const db = getDb();
  if (!db) {
    throw new Error('Database service is currently unavailable.');
  }

  const [existing] = await db
    .select()
    .from(renderJobs)
    .where(and(eq(renderJobs.idempotencyKey, idempotencyKey), eq(renderJobs.userId, userId)))
    .orderBy(desc(renderJobs.createdAt))
    .limit(1);

  if (!existing) {
    return null;
  }

  return getRenderJobById(existing.id, userId);
}

/**
 * Creates or retrieves an idempotent render job.
 */
export async function createRenderJob(input: CreateRenderJobInput): Promise<RenderJobResult> {
  const db = getDb();
  if (!db) {
    throw new Error('Database service is currently unavailable.');
  }

  const {
    userId,
    projectId,
    projectVersionId = null,
    idempotencyKey,
    resolution,
    fps,
    watermark = false,
    renderSpec,
  } = input;

  // 1. Check for existing active or completed job with this exact idempotencyKey
  const existing = await findExistingRenderJob(idempotencyKey, userId);
  if (existing && existing.status !== 'failed' && existing.status !== 'canceled') {
    return {
      job: existing,
      isExisting: true,
    };
  }

  // 2. Insert new job record in queued state
  try {
    const [newJob] = await db
      .insert(renderJobs)
      .values({
        userId,
        projectId,
        projectVersionId: projectVersionId || null,
        idempotencyKey,
        resolution,
        fps,
        format: 'mp4',
        watermark: Boolean(watermark),
        status: 'queued',
        progressPercentage: 0,
        currentStep: 'queued',
        renderSpec,
      })
      .returning();

    return {
      job: newJob,
      isExisting: false,
    };
  } catch (err: any) {
    // If unique constraint race condition occurred on idempotencyKey, return existing job
    if (err?.code === '23505' || err?.message?.includes('idempotency_key')) {
      const raced = await findExistingRenderJob(idempotencyKey, userId);
      if (raced) {
        return {
          job: raced,
          isExisting: true,
        };
      }
    }
    throw err;
  }
}

/**
 * Lists all render jobs for a specific project owned by the user.
 */
export async function listProjectRenderJobs(
  projectId: string,
  userId: string,
): Promise<Array<typeof renderJobs.$inferSelect & { downloadUrl?: string | null }>> {
  const db = getDb();
  if (!db) {
    throw new Error('Database service is currently unavailable.');
  }

  const projectJobs = await db
    .select()
    .from(renderJobs)
    .where(and(eq(renderJobs.projectId, projectId), eq(renderJobs.userId, userId)))
    .orderBy(desc(renderJobs.createdAt));

  const results: Array<typeof renderJobs.$inferSelect & { downloadUrl?: string | null }> = [];

  for (const job of projectJobs) {
    let downloadUrl: string | null = null;
    if (job.status === 'completed' && job.outputStorageKey && isR2Configured()) {
      try {
        const presigned = await generatePresignedDownloadUrl({
          storageKey: job.outputStorageKey,
          expiresInSeconds: 3600,
        });
        downloadUrl = presigned.downloadUrl;
      } catch {
        // ignore presigned error on list view
      }
    }
    results.push({ ...job, downloadUrl });
  }

  return results;
}

/**
 * Updates status and progress of an existing render job safely.
 */
export async function updateRenderJobProgress(
  jobId: string,
  updates: {
    status?: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
    progressPercentage?: number;
    currentStep?: string;
    outputStorageKey?: string;
    outputUrl?: string;
    outputFileSizeBytes?: number;
    renderDurationSeconds?: number;
    errorMessage?: string;
  },
): Promise<typeof renderJobs.$inferSelect | null> {
  const db = getDb();
  if (!db) {
    throw new Error('Database service is currently unavailable.');
  }

  const valuesToUpdate: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (updates.status !== undefined) valuesToUpdate.status = updates.status;
  if (updates.progressPercentage !== undefined) valuesToUpdate.progressPercentage = updates.progressPercentage;
  if (updates.currentStep !== undefined) valuesToUpdate.currentStep = updates.currentStep;
  if (updates.outputStorageKey !== undefined) valuesToUpdate.outputStorageKey = updates.outputStorageKey;
  if (updates.outputUrl !== undefined) valuesToUpdate.outputUrl = updates.outputUrl;
  if (updates.outputFileSizeBytes !== undefined) valuesToUpdate.outputFileSizeBytes = updates.outputFileSizeBytes;
  if (updates.renderDurationSeconds !== undefined) valuesToUpdate.renderDurationSeconds = updates.renderDurationSeconds;
  if (updates.errorMessage !== undefined) valuesToUpdate.errorMessage = updates.errorMessage;

  if (updates.status === 'processing') valuesToUpdate.startedAt = new Date();
  if (updates.status === 'completed' || updates.status === 'failed') valuesToUpdate.completedAt = new Date();

  const [updated] = await db
    .update(renderJobs)
    .set(valuesToUpdate)
    .where(eq(renderJobs.id, jobId))
    .returning();

  return updated || null;
}
