import { pgTable, uuid, varchar, text, timestamp, integer, boolean, bigint, numeric, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { clips } from './timelines';

/**
 * Media Assets table:
 * Stores uploaded video, audio, and image assets metadata.
 * Physical files reside in Cloudflare R2 zero-egress object storage.
 */
export const mediaAssets = pgTable('media_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull().unique(), // R2 object key: raw/{userId}/{assetId}.{ext}
  originalFilename: varchar('original_filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 128 }).notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
  durationMs: integer('duration_ms'), // null for static images
  width: integer('width'),
  height: integer('height'),
  fps: numeric('fps', { precision: 6, scale: 2 }),
  hasAudio: boolean('has_audio').notNull().default(false),
  ingestionStatus: varchar('ingestion_status', { length: 32 }).notNull().default('pending'), // 'pending' | 'processing' | 'ready' | 'failed'
  waveformUrl: text('waveform_url'),
  thumbnailUrl: text('thumbnail_url'),
  metadata: jsonb('metadata').default({}).notNull(), // Audio channels, codec name, color space, sample rate
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('media_assets_user_id_idx').on(table.userId),
  index('media_assets_status_idx').on(table.ingestionStatus),
  index('media_assets_mime_type_idx').on(table.mimeType),
]);

export const mediaAssetsRelations = relations(mediaAssets, ({ one, many }) => ({
  user: one(users, {
    fields: [mediaAssets.userId],
    references: [users.id],
  }),
  clips: many(clips),
}));
