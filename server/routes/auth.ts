import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../db/auth';
import { syncUserProfile } from '../services/userService';
import { isR2Configured } from '../services/r2StorageService';
import { config } from '../config/env';

export const authRouter = Router();

/**
 * GET /api/auth/me
 * 
 * Verifies caller JWT token, synchronizes Supabase profile with PostgreSQL users table,
 * and returns the authenticated user context.
 */
authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const profile = await syncUserProfile(user);

    res.status(200).json({
      user: {
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        subscriptionTier: profile.subscriptionTier,
        createdAt: profile.createdAt,
      },
      storage: {
        r2Configured: isR2Configured(),
        bucketName: config.r2.bucketName,
      },
    });
  } catch (err: unknown) {
    console.error('[Auth] Error fetching user profile:', err);
    res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
});
