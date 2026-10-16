import { pgTable, uuid, varchar, text, timestamp, integer, boolean, bigint, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { projects, projectVersions } from './projects';

/**
 * Render Jobs table:
 * Persistent queue and completion record for video rendering pipelines (FFmpeg / Remotion).
 * Idempotency is enforced by unique idempotencyKey (SHA-256 of the normalized canonical render specification).
 * If a user initiates an identical export of an unchanged timeline version and settings,
 * the system returns the existing job or completed asset rather than triggering redundant compute.
 */
export const renderJobs = pgTable('render_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectVersionId: uuid('project_version_id').references(() => projectVersions.id, { onDelete: 'set null' }),
  
  // SHA-256 hash of canonical render spec (project state + resolution + fps + watermark)
  idempotencyKey: varchar('idempotency_key', { length: 64 }).notNull(),
  
  status: varchar('status', { length: 32 }).notNull().default('queued'), // 'queued' | 'processing' | 'completed' | 'failed' | 'canceled'
  resolution: varchar('resolution', { length: 16 }).notNull().default('1080p'), // '720p' | '1080p' (Max 1080p V1 ceiling)
  fps: integer('fps').notNull().default(30), // 30 | 60
  format: varchar('format', { length: 16 }).notNull().default('mp4'),
  watermark: boolean('watermark').notNull().default(false),
  
  progressPercentage: integer('progress_percentage').notNull().default(0),
  currentStep: varchar('current_step', { length: 64 }).default('queued'),
  
  // Frozen canonical render spec JSONB passed directly to the rendering worker
  renderSpec: jsonb('render_spec').notNull(),
  
  // Output artifact pointers in Cloudflare R2
  outputStorageKey: text('output_storage_key'), // e.g. "renders/{userId}/{jobId}.mp4"
  outputUrl: text('output_url'),
  outputFileSizeBytes: bigint('output_file_size_bytes', { mode: 'number' }),
  renderDurationSeconds: integer('render_duration_seconds'),
  errorMessage: text('error_message'),
  
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('render_jobs_idempotency_key_idx').on(table.idempotencyKey),
  index('render_jobs_user_id_idx').on(table.userId),
  index('render_jobs_project_id_idx').on(table.projectId),
  index('render_jobs_status_idx').on(table.status),
  index('render_jobs_created_at_idx').on(table.createdAt),
]);

export const renderJobsRelations = relations(renderJobs, ({ one }) => ({
  user: one(users, {
    fields: [renderJobs.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [renderJobs.projectId],
    references: [projects.id],
  }),
  projectVersion: one(projectVersions, {
    fields: [renderJobs.projectVersionId],
    references: [projectVersions.id],
  }),
}));
