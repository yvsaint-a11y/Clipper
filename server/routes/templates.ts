import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../db/auth';
import { syncUserProfile } from '../services/userService';
import {
  listTemplates,
  getTemplateById,
  getTemplateVersionById,
  listTemplateVersions,
  createTemplate,
  createTemplateVersion,
  updateTemplateMetadata,
  archiveTemplate,
  createTemplateFromProject,
  applyTemplateToProject,
  TemplateServiceError,
} from '../services/templateService';

export const templatesRouter = Router();

// Enforce authenticated Supabase JWT for all template operations
templatesRouter.use(requireAuth);

/**
 * GET /api/templates
 * Lists non-archived templates owned by the authenticated user.
 */
templatesRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const user = req.user!;
    await syncUserProfile(user);

    const includePublic = req.query.includePublic === 'true';
    const userTemplates = await listTemplates(userId, { includePublic });

    res.json({ templates: userTemplates });
  } catch (err: unknown) {
    if (err instanceof TemplateServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to retrieve templates.';
    console.error('Error in GET /api/templates:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/templates/:id
 * Fetches a single template with ownership enforcement, including latest version & slots.
 */
templatesRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const templateData = await getTemplateById(id, userId);

    if (!templateData) {
      res.status(404).json({ error: 'Template not found or access denied.' });
      return;
    }

    res.json({ template: templateData });
  } catch (err: unknown) {
    if (err instanceof TemplateServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to fetch template.';
    console.error('Error in GET /api/templates/:id:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/templates
 * Creates a new template with initial immutable version (version 1) and slots in a transaction.
 */
templatesRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const user = req.user!;
    await syncUserProfile(user);

    const {
      name,
      description,
      category,
      aspectRatio,
      resolution,
      fps,
      durationMs,
      isPublic,
      changelog,
      tracks,
      slots,
    } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Template name is required and cannot be blank.' });
      return;
    }

    const result = await createTemplate(
      {
        name,
        description,
        category,
        aspectRatio,
        resolution,
        fps,
        durationMs,
        isPublic,
        changelog,
        tracks: Array.isArray(tracks) ? tracks : [],
        slots: Array.isArray(slots) ? slots : [],
      },
      userId
    );

    res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof TemplateServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to create template.';
    console.error('Error in POST /api/templates:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/templates/from-project/:projectId
 * Backend foundation for "Save Project as Template": converts project into reusable template recipe.
 */
templatesRouter.post('/from-project/:projectId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { projectId } = req.params;
    const { templateName, description, category, isPublic, slotConfigurations } = req.body || {};

    const result = await createTemplateFromProject(projectId, userId, {
      templateName,
      description,
      category,
      isPublic,
      slotConfigurations,
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof TemplateServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to create template from project.';
    console.error('Error in POST /api/templates/from-project/:projectId:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/templates/:id/apply
 * Applies an immutable template recipe to instantiate a brand new editable project.
 * Multi-tenant safe, IDOR protected, transactional.
 */
templatesRouter.post('/:id/apply', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const user = req.user!;
    await syncUserProfile(user);

    const { id } = req.params;
    const { projectName, versionNumber, versionId } = req.body || {};

    const result = await applyTemplateToProject(id, userId, {
      projectName,
      versionNumber,
      versionId,
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof TemplateServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to apply template.';
    console.error('Error in POST /api/templates/:id/apply:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/templates/:id/versions
 * Creates a new immutable template version under an existing template.
 * Validates checksum against latest version to prevent redundant duplicate rows.
 */
templatesRouter.post('/:id/versions', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const {
      name,
      category,
      aspectRatio,
      resolution,
      fps,
      durationMs,
      changelog,
      tracks,
      slots,
    } = req.body || {};

    const result = await createTemplateVersion(
      id,
      {
        name,
        category,
        aspectRatio,
        resolution,
        fps,
        durationMs,
        changelog,
        tracks: Array.isArray(tracks) ? tracks : [],
        slots: Array.isArray(slots) ? slots : [],
      },
      userId
    );

    // Return 200 if duplicate/idempotent, 201 if fresh version created
    res.status(result.isDuplicate ? 200 : 201).json(result);
  } catch (err: unknown) {
    if (err instanceof TemplateServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to create template version.';
    console.error('Error in POST /api/templates/:id/versions:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/templates/:id/versions
 * Lists all historical versions of a template.
 */
templatesRouter.get('/:id/versions', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const versions = await listTemplateVersions(id, userId);
    if (!versions) {
      res.status(404).json({ error: 'Template not found or access denied.' });
      return;
    }

    res.json({ versions });
  } catch (err: unknown) {
    if (err instanceof TemplateServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to retrieve template versions.';
    console.error('Error in GET /api/templates/:id/versions:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/templates/:id/versions/:versionId
 * Retrieves a specific immutable historical version and its slots.
 */
templatesRouter.get('/:id/versions/:versionId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id, versionId } = req.params;

    const result = await getTemplateVersionById(id, versionId, userId);
    if (!result) {
      res.status(404).json({ error: 'Template version not found or access denied.' });
      return;
    }

    res.json(result);
  } catch (err: unknown) {
    if (err instanceof TemplateServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to retrieve template version.';
    console.error('Error in GET /api/templates/:id/versions/:versionId:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * PATCH /api/templates/:id
 * Updates mutable template-level metadata only. Never mutates historical template_versions.
 */
templatesRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { name, description, category, aspectRatio, isPublic, thumbnailUrl } = req.body || {};

    const updated = await updateTemplateMetadata(
      id,
      {
        name,
        description,
        category,
        aspectRatio,
        isPublic,
        thumbnailUrl,
      },
      userId
    );

    res.json({ template: updated });
  } catch (err: unknown) {
    if (err instanceof TemplateServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to update template.';
    console.error('Error in PATCH /api/templates/:id:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * DELETE /api/templates/:id
 * Soft-deletes/archives the template. Preserves immutable historical versions and slots.
 */
templatesRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await archiveTemplate(id, userId);
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof TemplateServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to delete template.';
    console.error('Error in DELETE /api/templates/:id:', err);
    res.status(500).json({ error: msg });
  }
});
