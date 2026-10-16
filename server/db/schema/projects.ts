import { pgTable, uuid, varchar, text, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { timelines } from './timelines';
import { renderJobs } from './renderJobs';

/**
 * Projects table:
 * Root relational entity for user video projects.
 * Enforces ownership via userId foreign key.
 */
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  aspectRatio: varchar('aspect_ratio', { length: 16 }).notNull().default('16:9'), // '16:9' | '9:16' | '1:1'
  resolution: varchar('resolution', { length: 16 }).notNull().default('1080p'), // '720p' | '1080p' (Max 1080p in V1)
  fps: integer('fps').notNull().default(30), // 30 | 60
  durationMs: integer('duration_ms').notNull().default(0),
  currentVersionNumber: integer('current_version_number').notNull().default(1),
  thumbnailUrl: text('thumbnail_url'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('projects_user_id_idx').on(table.userId),
  index('projects_updated_at_idx').on(table.updatedAt),
]);

/**
 * Project Versions / Snapshots table:
 * Immutable point-in-time snapshots of the project timeline and clips.
 * Used for undo/redo history, rollback, and deterministic render reproduction.
 */
export const projectVersions = pgTable('project_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  label: varchar('label', { length: 128 }),
  snapshot: jsonb('snapshot').notNull(), // Complete canonical timeline state
  checksum: varchar('checksum', { length: 64 }).notNull(), // SHA-256 hash of canonical snapshot
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('project_versions_project_version_unique_idx').on(table.projectId, table.versionNumber),
  index('project_versions_project_id_idx').on(table.projectId),
  index('project_versions_user_id_idx').on(table.userId),
]);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  timeline: one(timelines, {
    fields: [projects.id],
    references: [timelines.projectId],
  }),
  versions: many(projectVersions),
  renderJobs: many(renderJobs),
}));

export const projectVersionsRelations = relations(projectVersions, ({ one }) => ({
  project: one(projects, {
    fields: [projectVersions.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectVersions.userId],
    references: [users.id],
  }),
}));
