import { getDb } from '../db';
import { users } from '../db/schema/users';
import { eq } from 'drizzle-orm';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export interface SyncedUserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  subscriptionTier: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Ensures that a corresponding record exists in the `users` table for the authenticated Supabase user.
 * 
 * Rules:
 * - Direct mapping: Supabase Auth UUID -> users.id
 * - Idempotent: If record exists, safely updates email/displayName/avatar if changed.
 * - If not present, creates the user record with 'free' tier default.
 * - Never accepts a client-provided userId; uses verified Supabase user payload.
 */
export async function syncUserProfile(supabaseUser: SupabaseUser): Promise<SyncedUserProfile> {
  const db = getDb();
  if (!db) {
    throw new Error('Database is not available for user synchronization');
  }

  const userId = supabaseUser.id;
  const email = supabaseUser.email || `${userId}@placeholder.supabase.co`;
  const metadata = supabaseUser.user_metadata || {};
  const displayName = (metadata.full_name as string) || (metadata.name as string) || email.split('@')[0] || null;
  const avatarUrl = (metadata.avatar_url as string) || null;

  // Check if user already exists
  const existingUsers = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (existingUsers.length > 0) {
    const existing = existingUsers[0];
    
    // Check if metadata needs sync
    const needsUpdate = 
      existing.email !== email || 
      (displayName && existing.displayName !== displayName) ||
      (avatarUrl && existing.avatarUrl !== avatarUrl);

    if (needsUpdate) {
      const [updated] = await db
        .update(users)
        .set({
          email,
          displayName: displayName || existing.displayName,
          avatarUrl: avatarUrl || existing.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      return {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        avatarUrl: updated.avatarUrl,
        subscriptionTier: updated.subscriptionTier,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    }

    return {
      id: existing.id,
      email: existing.email,
      displayName: existing.displayName,
      avatarUrl: existing.avatarUrl,
      subscriptionTier: existing.subscriptionTier,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
  }

  // User does not exist, insert newly synced user
  const [created] = await db
    .insert(users)
    .values({
      id: userId,
      email,
      displayName,
      avatarUrl,
      subscriptionTier: 'free',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return {
    id: created.id,
    email: created.email,
    displayName: created.displayName,
    avatarUrl: created.avatarUrl,
    subscriptionTier: created.subscriptionTier,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}
