import { pgTable, uuid, varchar, timestamp, integer, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

/**
 * Subscriptions table:
 * Mirrors Stripe subscription state and enforces user quota tiers (Free vs Pro).
 */
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).notNull().unique(),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }).unique(),
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  status: varchar('status', { length: 32 }).notNull().default('active'), // 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid'
  tier: varchar('tier', { length: 32 }).notNull().default('free'), // 'free' | 'pro'
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  exportsUsedThisMonth: integer('exports_used_this_month').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('subscriptions_user_id_idx').on(table.userId),
  index('subscriptions_stripe_customer_id_idx').on(table.stripeCustomerId),
  index('subscriptions_status_idx').on(table.status),
]);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));
