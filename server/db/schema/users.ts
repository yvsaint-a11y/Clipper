import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { projects } from './projects';
import { mediaAssets } from './media';
import { renderJobs } from './renderJobs';
import { subscriptions } from './subscriptions';
import { templates } from './templates';

/**
 * Users / Profiles table
 * id matches Supabase Auth auth.users.id (UUID).
 * Never trust client-supplied user IDs; always derive from verified Supabase JWT.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // References Supabase auth.users(id)
  email: varchar('email', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  subscriptionTier: varchar('subscription_tier', { length: 32 }).notNull().default('free'), // 'free' | 'pro'
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).unique(),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  projects: many(projects),
  mediaAssets: many(mediaAssets),
  renderJobs: many(renderJobs),
  templates: many(templates),
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.userId],
  }),
}));
