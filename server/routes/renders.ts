import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../db/auth';
import { getDb } from '../db';
import { projects } from '../db/schema/projects';
import { eq, and } from 'drizzle-orm';
import {
  createRenderJob,
  getRenderJobById,
  listProjectRenderJobs,
} from '../services/renderJobService';
import {
  validateExportResolution,
  validateExportFps,
  validateCanonicalRenderSpec,
  computeRenderSpecHashSync,
} from '../../src/features/editor/utils/renderSpec';
import { isRedisConfigured } from '../queue/redis';

export const rendersRouter = Router();

// Enforce authentication on all render endpoints
rendersRouter.use(requireAuth);

/**
 * POST /api/projects/:id/export
 * Enqueues or returns an idempotent render job for the project.
 */
rendersRouter.post('/projects/:id/export', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id: projectId } = req.params;
    const { resolution, fps, watermark = false, renderSpec } = req.body || {};

    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    // 1. Validate project ID and verify authenticated user ownership
    if (!projectId || typeof projectId !== 'string') {
      res.status(400).json({ error: 'Valid project ID is required in URL path.' });
      return;
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: 'Project not found or access denied.' });
      return;
    }

    // 2. Validate resolution and FPS (V1 bounds strictly to 720p or 1080p, 30 or 60 FPS)
    if (!validateExportResolution(resolution)) {
      res.status(400).json({
        error: `Invalid export resolution "${resolution}". V1 supports only 720p and 1080p. 4K is not supported.`,
      });
      return;
    }

    if (!validateExportFps(fps)) {
      res.status(400).json({
        error: `Invalid frame rate "${fps}". V1 supports only 30 and 60 FPS.`,
      });
      return;
    }

    // 3. Validate submitted render specification
    if (!renderSpec || typeof renderSpec !== 'object') {
      res.status(400).json({ error: 'Missing render specification object (renderSpec).' });
      return;
    }

    const specValidation = validateCanonicalRenderSpec(renderSpec);
    if (!specValidation.valid) {
      res.status(400).json({
        error: 'Malformed canonical render specification.',
        details: specValidation.errors,
      });
      return;
    }

    // 4. Recompute canonical SHA-256 idempotency hash server-side
    // Never trust an arbitrary client-provided hash without verification
    const idempotencyKey = computeRenderSpecHashSync(renderSpec);

    // 5. Look up existing job or create new queued job
    const result = await createRenderJob({
      userId,
      projectId,
      projectVersionId: null,
      idempotencyKey,
      resolution,
      fps,
      watermark: Boolean(watermark),
      renderSpec,
    });

    const isRedisReady = isRedisConfigured();

    if (result.isExisting) {
      res.status(200).json({
        job: result.job,
        isExisting: true,
        isRedisConfigured: isRedisReady,
        message: 'Existing render job retrieved for identical specification.',
      });
      return;
    }

    // If Redis is configured, enqueue to BullMQ video-render queue
    if (isRedisReady) {
      try {
        const { enqueueRenderJob } = await import('../queue/renderQueue');
        await enqueueRenderJob({
          renderJobId: result.job.id,
          userId,
          projectId,
          renderSpec,
          resolution,
          fps,
          watermark: Boolean(watermark),
        });
      } catch (queueErr) {
        console.warn('[Renders] Failed to enqueue to BullMQ render queue:', queueErr);
      }
    }

    res.status(201).json({
      job: result.job,
      isExisting: false,
      isRedisConfigured: isRedisReady,
      message: isRedisReady
        ? 'Render job enqueued successfully.'
        : 'Render job persisted in queued state. Queue worker offline in development.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create export render job.';
    console.error('[Renders] Error in POST /api/projects/:id/export:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/projects/:id/renders
 * Lists render jobs associated with a specific project.
 */
rendersRouter.get('/projects/:id/renders', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id: projectId } = req.params;

    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database service is currently unavailable.' });
      return;
    }

    // Verify project ownership
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: 'Project not found or access denied.' });
      return;
    }

    const projectRenders = await listProjectRenderJobs(projectId, userId);
    res.json({ renders: projectRenders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve project render history.';
    console.error('[Renders] Error in GET /api/projects/:id/renders:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/renders/:jobId
 * Retrieves real-time status and artifact download information for a render job.
 */
rendersRouter.get('/renders/:jobId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { jobId } = req.params;

    if (!jobId || typeof jobId !== 'string') {
      res.status(400).json({ error: 'Valid render job ID is required.' });
      return;
    }

    // Strict tenant boundary check: query enforces userId
    const job = await getRenderJobById(jobId, userId);

    if (!job) {
      res.status(404).json({ error: 'Render job not found or access denied.' });
      return;
    }

    res.json({ job });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve render job status.';
    console.error('[Renders] Error in GET /api/renders/:jobId:', err);
    res.status(500).json({ error: msg });
  }
});
