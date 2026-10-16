import { pgTable, uuid, varchar, timestamp, integer, boolean, numeric, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { projects } from './projects';
import { mediaAssets } from './media';

/**
 * Timelines table:
 * Relational timeline root associated with a project.
 */
export const timelines = pgTable('timelines', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().unique().references(() => projects.id, { onDelete: 'cascade' }),
  durationMs: integer('duration_ms').notNull().default(0),
  fps: integer('fps').notNull().default(30),
  timebase: integer('timebase').notNull().default(1000), // millisecond resolution
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('timelines_project_id_idx').on(table.projectId),
]);

/**
 * Tracks table:
 * Relational lanes representing Z-index layers and track media categories.
 */
export const tracks = pgTable('tracks', {
  id: uuid('id').defaultRandom().primaryKey(),
  timelineId: uuid('timeline_id').notNull().references(() => timelines.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(), // Z-order / vertical hierarchy
  type: varchar('type', { length: 32 }).notNull(), // 'video' | 'audio' | 'text' | 'caption'
  name: varchar('name', { length: 128 }).notNull(),
  isLocked: boolean('is_locked').notNull().default(false),
  isMuted: boolean('is_muted').notNull().default(false),
  volume: numeric('volume', { precision: 4, scale: 2 }).notNull().default('1.00'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('tracks_timeline_index_unique_idx').on(table.timelineId, table.index),
  index('tracks_timeline_id_idx').on(table.timelineId),
]);

/**
 * Clips table:
 * Individual media, text, or caption segments placed on tracks.
 * Core temporal parameters (startMs, endMs, speed) are relational for collision checks and range querying.
 * Complex extensible properties (transforms, transitions, filters, audio curves) are stored in structured JSONB.
 */
export const clips = pgTable('clips', {
  id: uuid('id').defaultRandom().primaryKey(),
  trackId: uuid('track_id').notNull().references(() => tracks.id, { onDelete: 'cascade' }),
  mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 32 }).notNull(), // 'video' | 'audio' | 'image' | 'text' | 'caption'
  name: varchar('name', { length: 128 }).notNull(),
  startMs: integer('start_ms').notNull(),
  endMs: integer('end_ms').notNull(),
  trimStartMs: integer('trim_start_ms').notNull().default(0),
  trimEndMs: integer('trim_end_ms').notNull().default(0),
  speed: numeric('speed', { precision: 4, scale: 2 }).notNull().default('1.00'),
  
  // Structured JSONB configurations (transforms, crops, audio envelopes, text styles, transitions, effects, animations)
  transform: jsonb('transform').notNull().default({
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  }),
  crop: jsonb('crop'), // Optional crop rectangle { x, y, width, height, unit }
  audioProperties: jsonb('audio_properties'), // { volume, fadeInMs, fadeOutMs, muted, pan }
  textProperties: jsonb('text_properties'), // { content, fontFamily, fontSize, color, fontWeight, alignment, background }
  captionProperties: jsonb('caption_properties'), // { words: [{ text, startMs, endMs }], style }
  transitions: jsonb('transitions'), // { in?: Transition, out?: Transition }
  effects: jsonb('effects').default([]).notNull(), // Array of video filters / adjustments
  animations: jsonb('animations').default([]).notNull(), // Keyframe animations
  slotBinding: varchar('slot_binding', { length: 64 }), // Template slot key if bound
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('clips_track_id_idx').on(table.trackId),
  index('clips_media_asset_id_idx').on(table.mediaAssetId),
  index('clips_temporal_range_idx').on(table.trackId, table.startMs, table.endMs),
]);

export const timelinesRelations = relations(timelines, ({ one, many }) => ({
  project: one(projects, {
    fields: [timelines.projectId],
    references: [projects.id],
  }),
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  timeline: one(timelines, {
    fields: [tracks.timelineId],
    references: [timelines.id],
  }),
  clips: many(clips),
}));

export const clipsRelations = relations(clips, ({ one }) => ({
  track: one(tracks, {
    fields: [clips.trackId],
    references: [tracks.id],
  }),
  mediaAsset: one(mediaAssets, {
    fields: [clips.mediaAssetId],
    references: [mediaAssets.id],
  }),
}));
