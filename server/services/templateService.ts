import { getDb } from '../db';
import { templates, templateVersions, templateSlots } from '../db/schema/templates';
import { projects, projectVersions } from '../db/schema/projects';
import { timelines, tracks, clips } from '../db/schema/timelines';
import { mediaAssets } from '../db/schema/media';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import {
  buildCanonicalTemplateSnapshot,
  computeTemplateSnapshotChecksum,
  validateTemplateSnapshot,
  type RawTemplateSnapshotInput,
  type RawTemplateSlotInput,
} from './templateSnapshotService';
import type {
  Template,
  TemplateVersion,
  TemplateSlot,
  CanonicalTemplateSnapshot,
  TemplateCategory,
  ProjectToTemplateSlotConfig,
} from '../../src/types/template';

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  category?: string;
  aspectRatio?: string;
  resolution?: string;
  fps?: number;
  durationMs?: number;
  isPublic?: boolean;
  changelog?: string;
  tracks?: any[];
  slots?: RawTemplateSlotInput[];
}

export interface CreateTemplateVersionInput {
  name?: string;
  category?: string;
  aspectRatio?: string;
  resolution?: string;
  fps?: number;
  durationMs?: number;
  changelog?: string;
  tracks?: any[];
  slots?: RawTemplateSlotInput[];
}

export interface UpdateTemplateMetadataInput {
  name?: string;
  description?: string | null;
  category?: string;
  aspectRatio?: string;
  isPublic?: boolean;
  thumbnailUrl?: string | null;
}

export class TemplateServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'TemplateServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Lists templates owned by the authenticated user (and optionally system/public templates).
 */
export async function listTemplates(userId: string, options: { includePublic?: boolean } = {}) {
  const db = getDb();
  if (!db) throw new TemplateServiceError('Database is unavailable.', 503);

  const conditions = [eq(templates.isArchived, false)];

  if (options.includePublic) {
    conditions.push(sql`(${templates.userId} = ${userId} OR ${templates.isPublic} = true OR ${templates.isSystem} = true)`);
  } else {
    conditions.push(eq(templates.userId, userId));
  }

  const results = await db
    .select()
    .from(templates)
    .where(and(...conditions))
    .orderBy(desc(templates.updatedAt));

  // Attach lightweight metadata summary for library cards
  const enhancedResults = await Promise.all(
    results.map(async (tmpl) => {
      const [latest] = await db
        .select({
          id: templateVersions.id,
          versionNumber: templateVersions.versionNumber,
          timelineSnapshot: templateVersions.timelineSnapshot,
          createdAt: templateVersions.createdAt,
        })
        .from(templateVersions)
        .where(eq(templateVersions.templateId, tmpl.id))
        .orderBy(desc(templateVersions.versionNumber))
        .limit(1);

      let slotCount = 0;
      let durationMs = 0;
      let resolution = '1080p';
      let fps = 30;

      if (latest && latest.timelineSnapshot) {
        const snap = latest.timelineSnapshot as any;
        durationMs = snap.durationMs || 0;
        resolution = snap.resolution || '1080p';
        fps = snap.fps || 30;
        slotCount = Array.isArray(snap.slots) ? snap.slots.length : 0;
      }

      return {
        ...tmpl,
        durationMs,
        resolution,
        fps,
        slotCount,
        latestVersionNumber: latest ? latest.versionNumber : tmpl.currentVersionNumber,
      };
    })
  );

  return enhancedResults;
}

/**
 * Retrieves a single template by ID, verifying ownership or public access.
 * Eagerly includes the latest immutable template version and its slots.
 */
export async function getTemplateById(templateId: string, userId: string) {
  const db = getDb();
  if (!db) throw new TemplateServiceError('Database is unavailable.', 503);

  // Strict ownership check (or public/system access)
  const [templateRecord] = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.id, templateId),
        eq(templates.isArchived, false),
        sql`(${templates.userId} = ${userId} OR ${templates.isPublic} = true OR ${templates.isSystem} = true)`
      )
    );

  if (!templateRecord) {
    return null;
  }

  // Fetch the latest version
  const [latestVersionRecord] = await db
    .select()
    .from(templateVersions)
    .where(eq(templateVersions.templateId, templateId))
    .orderBy(desc(templateVersions.versionNumber))
    .limit(1);

  let versionSlots: any[] = [];
  if (latestVersionRecord) {
    versionSlots = await db
      .select()
      .from(templateSlots)
      .where(eq(templateSlots.templateVersionId, latestVersionRecord.id))
      .orderBy(asc(templateSlots.displayOrder), asc(templateSlots.slotKey));
  }

  const snap = (latestVersionRecord?.timelineSnapshot as any) || {};
  return {
    ...templateRecord,
    durationMs: snap.durationMs || 0,
    resolution: snap.resolution || '1080p',
    fps: snap.fps || 30,
    slotCount: versionSlots.length,
    latestVersionNumber: latestVersionRecord?.versionNumber || templateRecord.currentVersionNumber,
    latestVersion: latestVersionRecord
      ? {
          ...latestVersionRecord,
          slots: versionSlots,
        }
      : null,
  };
}

/**
 * Retrieves a specific historical immutable version of a template with its slots.
 */
export async function getTemplateVersionById(
  templateId: string,
  versionIdOrNumber: string | number,
  userId: string
) {
  const db = getDb();
  if (!db) throw new TemplateServiceError('Database is unavailable.', 503);

  // Verify template ownership
  const [templateRecord] = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.id, templateId),
        eq(templates.isArchived, false),
        sql`(${templates.userId} = ${userId} OR ${templates.isPublic} = true OR ${templates.isSystem} = true)`
      )
    );

  if (!templateRecord) {
    return null;
  }

  // Query version by UUID or versionNumber
  const isNumber = !isNaN(Number(versionIdOrNumber));
  const versionCondition = isNumber
    ? and(eq(templateVersions.templateId, templateId), eq(templateVersions.versionNumber, Number(versionIdOrNumber)))
    : and(eq(templateVersions.templateId, templateId), eq(templateVersions.id, String(versionIdOrNumber)));

  const [versionRecord] = await db
    .select()
    .from(templateVersions)
    .where(versionCondition)
    .limit(1);

  if (!versionRecord) {
    return null;
  }

  const slots = await db
    .select()
    .from(templateSlots)
    .where(eq(templateSlots.templateVersionId, versionRecord.id))
    .orderBy(asc(templateSlots.displayOrder), asc(templateSlots.slotKey));

  return {
    template: templateRecord,
    version: {
      ...versionRecord,
      slots,
    },
  };
}

/**
 * Lists all historical versions of a template.
 */
export async function listTemplateVersions(templateId: string, userId: string) {
  const db = getDb();
  if (!db) throw new TemplateServiceError('Database is unavailable.', 503);

  const [templateRecord] = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.id, templateId),
        eq(templates.isArchived, false),
        sql`(${templates.userId} = ${userId} OR ${templates.isPublic} = true OR ${templates.isSystem} = true)`
      )
    );

  if (!templateRecord) {
    return null;
  }

  const versions = await db
    .select({
      id: templateVersions.id,
      templateId: templateVersions.templateId,
      versionNumber: templateVersions.versionNumber,
      changelog: templateVersions.changelog,
      checksum: templateVersions.checksum,
      isPublished: templateVersions.isPublished,
      createdAt: templateVersions.createdAt,
    })
    .from(templateVersions)
    .where(eq(templateVersions.templateId, templateId))
    .orderBy(desc(templateVersions.versionNumber));

  return versions;
}

/**
 * Creates a new template along with its initial immutable version and slots in a database transaction.
 */
export async function createTemplate(input: CreateTemplateInput, userId: string) {
  const db = getDb();
  if (!db) throw new TemplateServiceError('Database is unavailable.', 503);

  // 1. Build canonical snapshot
  const canonicalSnapshot = buildCanonicalTemplateSnapshot({
    name: input.name,
    category: input.category,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    fps: input.fps,
    durationMs: input.durationMs,
    tracks: input.tracks,
    slots: input.slots,
  });

  // 2. Validate snapshot
  const validation = validateTemplateSnapshot(canonicalSnapshot);
  if (!validation.isValid) {
    throw new TemplateServiceError(validation.error || 'Invalid template data.', 400);
  }

  // 3. Compute checksum
  const checksum = computeTemplateSnapshotChecksum(canonicalSnapshot);

  // 4. Execute atomic transaction
  return await db.transaction(async (tx) => {
    // Insert template root
    const [newTemplate] = await tx
      .insert(templates)
      .values({
        userId,
        name: canonicalSnapshot.name,
        description: input.description ? input.description.trim() : null,
        category: canonicalSnapshot.category || 'general',
        aspectRatio: canonicalSnapshot.aspectRatio,
        isPublic: Boolean(input.isPublic),
        isSystem: false,
        isArchived: false,
        currentVersionNumber: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Attach templateId into snapshot
    canonicalSnapshot.templateId = newTemplate.id;

    // Insert version 1
    const [newVersion] = await tx
      .insert(templateVersions)
      .values({
        templateId: newTemplate.id,
        versionNumber: 1,
        timelineSnapshot: canonicalSnapshot,
        changelog: input.changelog || 'Initial template creation',
        checksum,
        isPublished: true,
        createdAt: new Date(),
      })
      .returning();

    // Insert template slots
    const insertedSlots: any[] = [];
    for (const slotDef of canonicalSnapshot.slots) {
      const [newSlot] = await tx
        .insert(templateSlots)
        .values({
          templateVersionId: newVersion.id,
          slotKey: slotDef.slotKey,
          label: slotDef.label,
          type: slotDef.type,
          description: slotDef.description,
          targetClipId: slotDef.targetClipId,
          defaultValue: slotDef.defaultValue,
          constraints: slotDef.constraints || {},
          displayOrder: slotDef.displayOrder,
          createdAt: new Date(),
        })
        .returning();
      insertedSlots.push(newSlot);
    }

    return {
      template: newTemplate,
      version: {
        ...newVersion,
        slots: insertedSlots,
      },
    };
  });
}

/**
 * Creates a new immutable template version under an existing template in a database transaction.
 * Includes checksum comparison to prevent redundant duplicate versions.
 */
export async function createTemplateVersion(
  templateId: string,
  input: CreateTemplateVersionInput,
  userId: string
) {
  const db = getDb();
  if (!db) throw new TemplateServiceError('Database is unavailable.', 503);

  // 1. Verify template ownership
  const [existingTemplate] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId), eq(templates.isArchived, false)));

  if (!existingTemplate) {
    throw new TemplateServiceError('Template not found or access denied.', 404);
  }

  // 2. Build canonical snapshot
  const canonicalSnapshot = buildCanonicalTemplateSnapshot({
    templateId,
    name: input.name || existingTemplate.name,
    category: input.category || existingTemplate.category,
    aspectRatio: input.aspectRatio || existingTemplate.aspectRatio,
    resolution: input.resolution,
    fps: input.fps,
    durationMs: input.durationMs,
    tracks: input.tracks,
    slots: input.slots,
  });

  // 3. Validate snapshot
  const validation = validateTemplateSnapshot(canonicalSnapshot);
  if (!validation.isValid) {
    throw new TemplateServiceError(validation.error || 'Invalid template data.', 400);
  }

  // 4. Compute SHA-256 checksum
  const checksum = computeTemplateSnapshotChecksum(canonicalSnapshot);

  // 5. Check if the latest version already has this exact checksum (idempotency check)
  const [latestVersion] = await db
    .select()
    .from(templateVersions)
    .where(eq(templateVersions.templateId, templateId))
    .orderBy(desc(templateVersions.versionNumber))
    .limit(1);

  if (latestVersion && latestVersion.checksum === checksum) {
    // Return existing version without creating duplicate
    const existingSlots = await db
      .select()
      .from(templateSlots)
      .where(eq(templateSlots.templateVersionId, latestVersion.id))
      .orderBy(asc(templateSlots.displayOrder));

    return {
      isDuplicate: true,
      template: existingTemplate,
      version: {
        ...latestVersion,
        slots: existingSlots,
      },
    };
  }

  const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : existingTemplate.currentVersionNumber + 1;

  // 6. Execute transaction to insert version & slots and update template header
  return await db.transaction(async (tx) => {
    const [newVersion] = await tx
      .insert(templateVersions)
      .values({
        templateId,
        versionNumber: nextVersionNumber,
        timelineSnapshot: canonicalSnapshot,
        changelog: input.changelog || `Version ${nextVersionNumber}`,
        checksum,
        isPublished: true,
        createdAt: new Date(),
      })
      .returning();

    const insertedSlots: any[] = [];
    for (const slotDef of canonicalSnapshot.slots) {
      const [newSlot] = await tx
        .insert(templateSlots)
        .values({
          templateVersionId: newVersion.id,
          slotKey: slotDef.slotKey,
          label: slotDef.label,
          type: slotDef.type,
          description: slotDef.description,
          targetClipId: slotDef.targetClipId,
          defaultValue: slotDef.defaultValue,
          constraints: slotDef.constraints || {},
          displayOrder: slotDef.displayOrder,
          createdAt: new Date(),
        })
        .returning();
      insertedSlots.push(newSlot);
    }

    const [updatedTemplate] = await tx
      .update(templates)
      .set({
        currentVersionNumber: nextVersionNumber,
        aspectRatio: canonicalSnapshot.aspectRatio,
        updatedAt: new Date(),
      })
      .where(eq(templates.id, templateId))
      .returning();

    return {
      isDuplicate: false,
      template: updatedTemplate,
      version: {
        ...newVersion,
        slots: insertedSlots,
      },
    };
  });
}

/**
 * Updates template metadata (name, description, category, aspectRatio, isPublic).
 * Never mutates historical template_versions.
 */
export async function updateTemplateMetadata(
  templateId: string,
  updates: UpdateTemplateMetadataInput,
  userId: string
) {
  const db = getDb();
  if (!db) throw new TemplateServiceError('Database is unavailable.', 503);

  const [existing] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId), eq(templates.isArchived, false)));

  if (!existing) {
    throw new TemplateServiceError('Template not found or access denied.', 404);
  }

  const patchData: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (updates.name !== undefined) {
    if (typeof updates.name !== 'string' || updates.name.trim().length === 0) {
      throw new TemplateServiceError('Template name cannot be blank.', 400);
    }
    patchData.name = updates.name.trim();
  }

  if (updates.description !== undefined) {
    patchData.description = updates.description ? updates.description.trim() : null;
  }

  if (updates.category !== undefined) {
    patchData.category = updates.category.trim();
  }

  if (updates.aspectRatio !== undefined) {
    if (!['16:9', '9:16', '1:1'].includes(updates.aspectRatio)) {
      throw new TemplateServiceError('Invalid aspect ratio.', 400);
    }
    patchData.aspectRatio = updates.aspectRatio;
  }

  if (updates.isPublic !== undefined) {
    patchData.isPublic = Boolean(updates.isPublic);
  }

  if (updates.thumbnailUrl !== undefined) {
    patchData.thumbnailUrl = updates.thumbnailUrl;
  }

  const [updated] = await db
    .update(templates)
    .set(patchData)
    .where(eq(templates.id, templateId))
    .returning();

  return updated;
}

/**
 * Soft-deletes a template by setting isArchived = true.
 * Preserves all immutable historical template_versions and template_slots.
 */
export async function archiveTemplate(templateId: string, userId: string) {
  const db = getDb();
  if (!db) throw new TemplateServiceError('Database is unavailable.', 503);

  const [existing] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId), eq(templates.isArchived, false)));

  if (!existing) {
    throw new TemplateServiceError('Template not found or access denied.', 404);
  }

  await db
    .update(templates)
    .set({
      isArchived: true,
      updatedAt: new Date(),
    })
    .where(eq(templates.id, templateId));

  return { success: true, message: 'Template archived successfully.' };
}

/**
 * Converts an existing project and its timeline into a clean, reusable template recipe.
 * - Extracts reusable tracks, clips, and transforms.
 * - Converts media references into parameterized template slots.
 * - Strips all project-specific presigned URLs and private identifiers.
 */
export async function createTemplateFromProject(
  projectId: string,
  userId: string,
  options: {
    templateName?: string;
    description?: string;
    category?: string;
    isPublic?: boolean;
    slotConfigurations?: ProjectToTemplateSlotConfig[];
  } = {}
) {
  const db = getDb();
  if (!db) throw new TemplateServiceError('Database is unavailable.', 503);

  // Validate templateName if explicitly provided
  if (options.templateName !== undefined) {
    if (typeof options.templateName !== 'string' || options.templateName.trim().length === 0) {
      throw new TemplateServiceError('Template name is required and cannot be blank.', 400);
    }
    if (options.templateName.trim().length > 100) {
      throw new TemplateServiceError('Template name must be 100 characters or fewer.', 400);
    }
  }

  // 1. Fetch project with ownership check
  const [projectRecord] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId), eq(projects.isArchived, false)));

  if (!projectRecord) {
    throw new TemplateServiceError('Project not found or access denied.', 404);
  }

  // 2. Fetch timeline and tracks
  const [timelineRecord] = await db
    .select()
    .from(timelines)
    .where(eq(timelines.projectId, projectId));

  let tracksWithClips: any[] = [];
  if (timelineRecord) {
    const dbTracks = await db
      .select()
      .from(tracks)
      .where(eq(tracks.timelineId, timelineRecord.id))
      .orderBy(asc(tracks.index));

    const trackIds = dbTracks.map((t) => t.id);
    let dbClips: any[] = [];
    if (trackIds.length > 0) {
      dbClips = await db
        .select()
        .from(clips)
        .where(sql`${clips.trackId} IN ${trackIds}`)
        .orderBy(asc(clips.startMs));
    }

    tracksWithClips = dbTracks.map((t) => ({
      id: t.id,
      name: t.name,
      trackType: t.type,
      orderIndex: t.index,
      isMuted: t.isMuted,
      isLocked: t.isLocked,
      volume: Number(t.volume || 1),
      clips: dbClips
        .filter((c) => c.trackId === t.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          clipType: c.type,
          startTimeMs: c.startMs,
          endTimeMs: c.endMs,
          sourceStartMs: c.trimStartMs || 0,
          sourceEndMs: (c.trimStartMs || 0) + (c.endMs - c.startMs),
          mediaAssetId: null, // Detach project-specific private media asset ID
          slotBinding: null,
          transform: c.transform,
          crop: c.crop,
          audioProperties: c.audioProperties,
          textProperties: c.textProperties,
          captionProperties: c.captionProperties,
          transitions: c.transitions,
          effects: c.effects,
          animations: c.animations,
        })),
    }));
  }

  // 3. Generate Template Slots: customized by user or automatically generated fallback
  const slots: RawTemplateSlotInput[] = [];
  let slotIndex = 1;

  if (options.slotConfigurations && Array.isArray(options.slotConfigurations)) {
    const configMap = new Map<string, ProjectToTemplateSlotConfig>();
    for (const cfg of options.slotConfigurations) {
      if (cfg && cfg.targetClipId) {
        configMap.set(cfg.targetClipId, cfg);
      }
    }

    for (const track of tracksWithClips) {
      for (const clip of track.clips) {
        const cfg = configMap.get(clip.id);

        // If explicitly designated not a slot, keep as fixed timeline content
        if (!cfg || cfg.isSlot === false) {
          clip.slotBinding = null;
          continue;
        }

        // Configure replaceable slot
        const slotType = cfg.type || clip.clipType || 'video';
        const slotKey = cfg.slotKey || `slot_${slotIndex}_${slotType}`;
        const slotLabel = cfg.label?.trim() || `Slot: ${clip.name}`;

        if (slotLabel.length > 80) {
          throw new TemplateServiceError(`Slot label "${slotLabel}" exceeds 80 characters.`, 400);
        }

        clip.slotBinding = slotKey;

        slots.push({
          slotKey,
          label: slotLabel,
          type: slotType,
          description: cfg.description?.trim() || `Replaceable ${slotType} placeholder for "${clip.name}"`,
          targetClipId: clip.id,
          constraints: {
            isRequired: cfg.isRequired !== undefined ? Boolean(cfg.isRequired) : true,
            maxDurationMs: clip.endTimeMs - clip.startTimeMs,
          },
          displayOrder: typeof cfg.displayOrder === 'number' ? cfg.displayOrder : slotIndex,
        });

        slotIndex++;
      }
    }
  } else {
    // Automatic fallback for backward-compatibility with Phase 7A
    for (const track of tracksWithClips) {
      for (const clip of track.clips) {
        let slotType = 'video';
        let label = `Media Slot ${slotIndex}`;

        if (clip.clipType === 'video') {
          slotType = 'video';
          label = `Video: ${clip.name}`;
        } else if (clip.clipType === 'audio') {
          slotType = 'audio';
          label = `Audio: ${clip.name}`;
        } else if (clip.clipType === 'image') {
          slotType = 'image';
          label = `Image: ${clip.name}`;
        } else if (clip.clipType === 'text') {
          slotType = 'text';
          label = `Text: ${clip.name}`;
        }

        const slotKey = `slot_${slotIndex}_${clip.clipType}`;
        clip.slotBinding = slotKey;

        slots.push({
          slotKey,
          label,
          type: slotType,
          description: `Replaceable ${slotType} placeholder for clip "${clip.name}"`,
          targetClipId: clip.id,
          constraints: {
            isRequired: true,
            maxDurationMs: clip.endTimeMs - clip.startTimeMs,
          },
          displayOrder: slotIndex,
        });

        slotIndex++;
      }
    }
  }

  // 4. Create the template recipe using createTemplate
  return await createTemplate(
    {
      name: (options.templateName && options.templateName.trim()) || `${projectRecord.name} (Template)`,
      description: options.description?.trim() || projectRecord.description || 'Generated from project',
      category: options.category?.trim() || 'general',
      aspectRatio: projectRecord.aspectRatio,
      resolution: projectRecord.resolution,
      fps: projectRecord.fps,
      durationMs: projectRecord.durationMs,
      isPublic: Boolean(options.isPublic),
      changelog: `Derived from project "${projectRecord.name}"`,
      tracks: tracksWithClips,
      slots,
    },
    userId
  );
}

export interface ApplyTemplateOptions {
  projectName?: string;
  versionNumber?: number;
  versionId?: string;
}

/**
 * Phase 7F: Applies an immutable template recipe to instantiate a brand new editable project.
 * - Enforces strict multi-tenant ownership & IDOR authorization.
 * - The original template, template versions, and template slots remain 100% untouched and immutable.
 * - Operates entirely within a database transaction: failures roll back cleanly with 0 leftover rows.
 * - Instantiates independent tracks and clips preserving all transforms, temporal layout, text, and audio.
 * - Replaces private media on dynamic slots with detached references (slotBinding preserved, mediaAssetId = null).
 * - Creates an initial canonical project snapshot (version 1) with SHA-256 checksum.
 */
export async function applyTemplateToProject(
  templateId: string,
  userId: string,
  options: ApplyTemplateOptions = {}
) {
  const db = getDb();
  if (!db) throw new TemplateServiceError('Database is unavailable.', 503);

  // 1. Verify template exists and user has permission to read it
  const [templateRecord] = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.id, templateId),
        eq(templates.isArchived, false),
        sql`(${templates.userId} = ${userId} OR ${templates.isPublic} = true OR ${templates.isSystem} = true)`
      )
    );

  if (!templateRecord) {
    throw new TemplateServiceError('Template not found or access denied.', 404);
  }

  // 2. Resolve intended template version
  let versionCondition = eq(templateVersions.templateId, templateId);
  if (options.versionId) {
    versionCondition = and(versionCondition, eq(templateVersions.id, options.versionId));
  } else if (typeof options.versionNumber === 'number') {
    versionCondition = and(versionCondition, eq(templateVersions.versionNumber, options.versionNumber));
  }

  const [targetVersion] = await db
    .select()
    .from(templateVersions)
    .where(versionCondition)
    .orderBy(desc(templateVersions.versionNumber))
    .limit(1);

  if (!targetVersion) {
    throw new TemplateServiceError('Template version not found or inaccessible.', 404);
  }

  // 3. Read immutable snapshot
  const snapshot = targetVersion.timelineSnapshot as CanonicalTemplateSnapshot;
  if (!snapshot) {
    throw new TemplateServiceError('Corrupted template version snapshot.', 500);
  }

  // 4. Validate and sanitize project name
  let finalProjectName = '';
  if (options.projectName !== undefined && options.projectName !== null) {
    if (typeof options.projectName !== 'string' || options.projectName.trim().length === 0) {
      throw new TemplateServiceError('Project name is required and cannot be blank.', 400);
    }
    finalProjectName = options.projectName.trim();
    if (finalProjectName.length > 100) {
      throw new TemplateServiceError('Project name must be 100 characters or fewer.', 400);
    }
  } else {
    finalProjectName = `${templateRecord.name} — New Project`;
    if (finalProjectName.length > 100) {
      finalProjectName = finalProjectName.substring(0, 100).trim();
    }
  }

  // 5. Transactional project creation
  const result = await db.transaction(async (tx) => {
    // 5a. Create project entity
    const [newProject] = await tx
      .insert(projects)
      .values({
        userId,
        name: finalProjectName,
        description: templateRecord.description || `Instantiated from template "${templateRecord.name}" v${targetVersion.versionNumber}`,
        aspectRatio: (['16:9', '9:16', '1:1'].includes(snapshot.aspectRatio) ? snapshot.aspectRatio : templateRecord.aspectRatio) as any,
        resolution: (snapshot.resolution === '720p' ? '720p' : '1080p') as any,
        fps: Number(snapshot.fps) === 60 ? 60 : 30,
        durationMs: typeof snapshot.durationMs === 'number' && snapshot.durationMs >= 0 ? Math.round(snapshot.durationMs) : 0,
        currentVersionNumber: 1,
        isArchived: false,
      })
      .returning();

    // 5b. Create timeline
    const [newTimeline] = await tx
      .insert(timelines)
      .values({
        projectId: newProject.id,
        durationMs: newProject.durationMs,
        fps: newProject.fps,
      })
      .returning();

    // 5c. Instantiate tracks and clips from template snapshot
    const snapshotTracks = Array.isArray(snapshot.tracks) ? snapshot.tracks : [];
    const snapshotSlots = Array.isArray(snapshot.slots) ? snapshot.slots : [];
    const slotKeyByClipId = new Map<string, string>();
    for (const slot of snapshotSlots) {
      if (slot && slot.targetClipId && slot.slotKey) {
        slotKeyByClipId.set(slot.targetClipId, slot.slotKey);
      }
    }
    const createdTracksWithClips: any[] = [];

    for (let tIdx = 0; tIdx < snapshotTracks.length; tIdx++) {
      const snapTrack = snapshotTracks[tIdx];
      const [createdTrack] = await tx
        .insert(tracks)
        .values({
          timelineId: newTimeline.id,
          index: typeof snapTrack.orderIndex === 'number' ? snapTrack.orderIndex : tIdx,
          type: String(snapTrack.trackType || 'video'),
          name: String(snapTrack.name || `Track ${tIdx + 1}`),
          isLocked: Boolean(snapTrack.isLocked),
          isMuted: Boolean(snapTrack.isMuted),
          volume: String(snapTrack.volume ?? '1.00'),
        })
        .returning();

      const snapClips = Array.isArray(snapTrack.clips) ? snapTrack.clips : [];
      const createdClips: any[] = [];

      for (let cIdx = 0; cIdx < snapClips.length; cIdx++) {
        const snapClip = snapClips[cIdx];
        const effectiveSlotBinding = snapClip.slotBinding || slotKeyByClipId.get(snapClip.id) || null;

        // Multi-tenant media asset check:
        // If clip has slotBinding (replaceable slot), mediaAssetId is null (detached placeholder ready for user media)
        // If clip has fixed mediaAssetId: we verify if user owns it. If cross-user, set to null to avoid IDOR leak.
        let clipMediaAssetId: string | null = null;
        if (!effectiveSlotBinding && snapClip.mediaAssetId) {
          const [ownedMedia] = await tx
            .select({ id: mediaAssets.id })
            .from(mediaAssets)
            .where(and(eq(mediaAssets.id, snapClip.mediaAssetId), eq(mediaAssets.userId, userId)));
          if (ownedMedia) {
            clipMediaAssetId = snapClip.mediaAssetId;
          }
        }

        const [createdClip] = await tx
          .insert(clips)
          .values({
            trackId: createdTrack.id,
            mediaAssetId: clipMediaAssetId,
            type: String(snapClip.clipType || 'video'),
            name: String(snapClip.name || 'Untitled Clip'),
            startMs: Math.max(0, Number(snapClip.startTimeMs ?? 0)),
            endMs: Math.max(100, Number(snapClip.endTimeMs ?? 5000)),
            trimStartMs: Math.max(0, Number(snapClip.sourceStartMs ?? 0)),
            trimEndMs: Math.max(0, Number(snapClip.sourceEndMs ?? 0)),
            speed: '1.00',
            transform: snapClip.transform || {
              position: { x: 0, y: 0 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              opacity: 1,
            },
            crop: snapClip.crop || null,
            audioProperties: snapClip.audioProperties || null,
            textProperties: snapClip.textProperties || null,
            captionProperties: snapClip.captionProperties || null,
            transitions: snapClip.transitions || null,
            effects: Array.isArray(snapClip.effects) ? snapClip.effects : [],
            animations: Array.isArray(snapClip.animations) ? snapClip.animations : [],
            slotBinding: effectiveSlotBinding ? String(effectiveSlotBinding) : null,
          })
          .returning();

        createdClips.push(createdClip);
      }

      createdTracksWithClips.push({
        ...createdTrack,
        trackType: createdTrack.type,
        orderIndex: createdTrack.index,
        clips: createdClips.map((c) => ({
          id: c.id,
          trackId: c.trackId,
          name: c.name,
          clipType: c.type,
          startTimeMs: c.startMs,
          endTimeMs: c.endMs,
          sourceStartMs: c.trimStartMs,
          sourceEndMs: c.trimEndMs,
          mediaAssetId: c.mediaAssetId,
          slotBinding: c.slotBinding,
          transform: c.transform,
          crop: c.crop,
          audioProperties: c.audioProperties,
          textProperties: c.textProperties,
          captionProperties: c.captionProperties,
          transitions: c.transitions,
          effects: c.effects,
          animations: c.animations,
        })),
      });
    }

    // 5d. Create initial Project Version (Snapshot 1)
    const initialProjectSnapshot = {
      projectId: newProject.id,
      timelineId: newTimeline.id,
      fps: newProject.fps,
      durationMs: newProject.durationMs,
      tracks: createdTracksWithClips,
      createdAt: new Date().toISOString(),
    };

    const checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(initialProjectSnapshot))
      .digest('hex');

    await tx.insert(projectVersions).values({
      projectId: newProject.id,
      userId,
      versionNumber: 1,
      label: `Instantiated from template "${templateRecord.name}" v${targetVersion.versionNumber}`,
      snapshot: initialProjectSnapshot,
      checksum,
    });

    return {
      project: newProject,
      timeline: {
        id: newTimeline.id,
        projectId: newProject.id,
        totalDurationMs: newTimeline.durationMs,
        fps: newTimeline.fps,
        tracks: createdTracksWithClips,
      },
      templateVersionApplied: targetVersion.versionNumber,
    };
  });

  return result;
}

