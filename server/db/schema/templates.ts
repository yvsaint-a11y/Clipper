import { pgTable, uuid, varchar, text, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

/**
 * Templates table:
 * Root entity header for reusable video recipe collections.
 * Points to the latest published version, but all consumer projects reference
 * immutable template_versions, never this mutable header directly.
 */
export const templates = pgTable('templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // null if system curated
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 64 }).notNull().default('general'), // 'marketing' | 'social' | 'tutorial' | 'corporate'
  aspectRatio: varchar('aspect_ratio', { length: 16 }).notNull().default('16:9'),
  isPublic: boolean('is_public').notNull().default(false),
  isSystem: boolean('is_system').notNull().default(false),
  thumbnailUrl: text('thumbnail_url'),
  previewVideoUrl: text('preview_video_url'),
  currentVersionNumber: integer('current_version_number').notNull().default(1),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('templates_user_id_idx').on(table.userId),
  index('templates_category_idx').on(table.category),
  index('templates_is_public_idx').on(table.isPublic),
  index('templates_is_archived_idx').on(table.isArchived),
]);

/**
 * Template Versions table:
 * STRICTLY IMMUTABLE.
 * Once written with a checksum, a template version is frozen permanently.
 * Applying a template in a project clones or references this immutable version snapshot,
 * guaranteeing reproducible rendering even if template creators edit the parent template later.
 */
export const templateVersions = pgTable('template_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id').notNull().references(() => templates.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  timelineSnapshot: jsonb('timeline_snapshot').notNull(), // Complete canonical timeline recipe & placeholders
  changelog: text('changelog'),
  checksum: varchar('checksum', { length: 64 }).notNull(), // SHA-256 fingerprint
  isPublished: boolean('is_published').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('template_versions_template_version_unique_idx').on(table.templateId, table.versionNumber),
  index('template_versions_template_id_idx').on(table.templateId),
  index('template_versions_checksum_idx').on(table.checksum),
]);

/**
 * Template Slots table:
 * Dynamic customizable inputs (e.g. headline text, logo swap, background media, music).
 * Strictly bound to an immutable template_version_id, ensuring slot validation matches the exact timeline version.
 */
export const templateSlots = pgTable('template_slots', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateVersionId: uuid('template_version_id').notNull().references(() => templateVersions.id, { onDelete: 'cascade' }),
  slotKey: varchar('slot_key', { length: 64 }).notNull(), // e.g. "product_title", "hero_video", "cta_text"
  label: varchar('label', { length: 128 }).notNull(),
  type: varchar('type', { length: 32 }).notNull(), // 'text' | 'image' | 'video' | 'audio' | 'color'
  description: text('description'),
  targetClipId: varchar('target_clip_id', { length: 64 }).notNull(), // Maps to clip within the version snapshot
  defaultValue: jsonb('default_value'), // Default slot payload
  constraints: jsonb('constraints').default({}).notNull(), // e.g. { maxCharacters, allowedAspectRatios, minDurationMs }
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('template_slots_version_key_unique_idx').on(table.templateVersionId, table.slotKey),
  index('template_slots_version_id_idx').on(table.templateVersionId),
]);

export const templatesRelations = relations(templates, ({ one, many }) => ({
  user: one(users, {
    fields: [templates.userId],
    references: [users.id],
  }),
  versions: many(templateVersions),
}));

export const templateVersionsRelations = relations(templateVersions, ({ one, many }) => ({
  template: one(templates, {
    fields: [templateVersions.templateId],
    references: [templates.id],
  }),
  slots: many(templateSlots),
}));

export const templateSlotsRelations = relations(templateSlots, ({ one }) => ({
  templateVersion: one(templateVersions, {
    fields: [templateSlots.templateVersionId],
    references: [templateVersions.id],
  }),
}));
