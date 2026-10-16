import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

let supabaseAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const url = config.supabase.url;
  const key = config.supabase.serviceRoleKey || config.supabase.anonKey;

  if (!url || !key) {
    return null;
  }

  try {
    supabaseAdminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    return supabaseAdminClient;
  } catch (err) {
    console.error('[Auth] Failed to initialize Supabase client:', err);
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  userId?: string;
}

/**
 * Express middleware to authenticate Supabase JWT tokens.
 * Extracts the token from the "Authorization: Bearer <token>" header,
 * verifies it with Supabase Auth, and attaches the authenticated user to req.user / req.userId.
 * NEVER trusts client-provided user IDs.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized: Missing or invalid Authorization header. Expected Bearer token.',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    res.status(503).json({
      error: 'Service Unavailable: Supabase Auth is not configured on the server.',
    });
    return;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        error: 'Unauthorized: Invalid or expired authentication token.',
        details: error?.message,
      });
      return;
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (err) {
    console.error('[Auth] Error verifying Supabase token:', err);
    res.status(500).json({
      error: 'Internal Server Error during authentication.',
    });
  }
}
