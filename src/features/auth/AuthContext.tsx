import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabase } from '../../lib/supabase';


export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  subscriptionTier: string;
  createdAt: string;
}

export interface SignUpResult {
  success: boolean;
  error?: string;
  isExistingUser?: boolean;
  requiresConfirmation?: boolean;
  email?: string;
}

export interface SignInResult {
  success: boolean;
  error?: string;
  isUnconfirmed?: boolean;
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  accessToken: string | null;
  isLoading: boolean;
  isConfigured: boolean;
  error: string | null;
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  resendVerificationEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPasswordForEmail: (email: string, redirectTo?: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const supabase = useMemo(() => getSupabase(), []);
  const isConfigured = Boolean(supabase);

  // Synchronize profile with backend /api/auth/me
  const syncProfile = async (token: string) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data.user);
      }
    } catch (err) {
      console.warn('[AuthContext] Failed to sync profile with backend:', err);
    }
  };

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    // Check URL hash/query for recovery indicators
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (hash.includes('type=recovery') || search.includes('type=recovery')) {
        setIsPasswordRecovery(true);
      }
    }

    // 1. Initial Session Restoration
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession }, error: sessionError }) => {
        if (!isMounted) return;

        if (sessionError) {
          console.error('[AuthContext] getSession error:', sessionError);
          setError(sessionError.message);
        }

        if (initialSession) {
          setSession(initialSession);
          setUser(initialSession.user);
          syncProfile(initialSession.access_token);
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('[AuthContext] Session initialization exception:', err);
        setIsLoading(false);
      });

    // 2. Listen to Auth State Changes (SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!isMounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }

      setSession(currentSession);
      setUser(currentSession?.user || null);

      if (currentSession?.access_token) {
        await syncProfile(currentSession.access_token);
      } else {
        setProfile(null);
      }

      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    if (!supabase) {
      return { success: false, error: 'Supabase authentication client is not configured.' };
    }
    setError(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        const lowerMsg = signInError.message.toLowerCase();
        const isUnconfirmed =
          lowerMsg.includes('not confirmed') ||
          lowerMsg.includes('unconfirmed') ||
          (signInError as any).code === 'email_not_confirmed';
        return { success: false, error: signInError.message, isUnconfirmed };
      }

      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        await syncProfile(data.session.access_token);
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed unexpectedly.';
      setError(msg);
      const isUnconfirmed = msg.toLowerCase().includes('not confirmed') || msg.toLowerCase().includes('unconfirmed');
      return { success: false, error: msg, isUnconfirmed };
    }
  };

  const signUp = async (email: string, password: string): Promise<SignUpResult> => {
    if (!supabase) {
      return { success: false, error: 'Supabase authentication client is not configured.' };
    }
    setError(null);
    try {
      const emailRedirectTo =
        typeof window !== 'undefined'
          ? window.location.origin
          : undefined;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
        },
      });

      if (signUpError) {
        const lowerMsg = signUpError.message.toLowerCase();
        const isDuplicate =
          lowerMsg.includes('already registered') ||
          lowerMsg.includes('already exists') ||
          (signUpError as any).code === 'user_already_exists';
        setError(signUpError.message);
        return { success: false, error: signUpError.message, isExistingUser: isDuplicate };
      }

      // Supabase Auth duplicate account detection:
      // When an existing confirmed user signs up again, Supabase returns HTTP 200 with an empty identities array
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return {
          success: false,
          error: 'An account may already exist with this email. Try signing in or resetting your password.',
          isExistingUser: true,
        };
      }

      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        await syncProfile(data.session.access_token);
        return { success: true, requiresConfirmation: false };
      }

      // Genuine signup awaiting email confirmation
      return {
        success: true,
        requiresConfirmation: true,
        email: data.user?.email || email,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign up failed unexpectedly.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const resendVerificationEmail = async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabase) {
      return { success: false, error: 'Supabase authentication client is not configured.' };
    }
    if (!email || !email.trim()) {
      return { success: false, error: 'Please enter your account email address.' };
    }
    setError(null);
    try {
      const emailRedirectTo =
        typeof window !== 'undefined'
          ? window.location.origin
          : undefined;

      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo,
        },
      });

      if (resendError) {
        setError(resendError.message);
        return { success: false, error: resendError.message };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend verification email.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const resetPasswordForEmail = async (email: string, redirectTo?: string) => {
    if (!supabase) {
      return { success: false, error: 'Supabase authentication client is not configured.' };
    }
    setError(null);
    try {
      // Use current browser origin by default
      const defaultRedirect = typeof window !== 'undefined' ? `${window.location.origin}` : undefined;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo || defaultRedirect,
      });

      if (resetError) {
        setError(resetError.message);
        return { success: false, error: resetError.message };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to request password reset.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const updatePassword = async (newPassword: string) => {
    if (!supabase) {
      return { success: false, error: 'Supabase authentication client is not configured.' };
    }
    setError(null);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
        return { success: false, error: updateError.message };
      }

      if (data.user) {
        setUser(data.user);
      }

      // Recovery flow is complete
      setIsPasswordRecovery(false);

      // Clean up hash fragment without page reload
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false);
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      setIsPasswordRecovery(false);
    } catch (err) {
      console.error('[AuthContext] Sign out error:', err);
    }
  };

  const refreshProfile = async () => {
    if (session?.access_token) {
      await syncProfile(session.access_token);
    }
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    accessToken: session?.access_token || null,
    isLoading,
    isConfigured,
    error,
    isPasswordRecovery,
    signIn,
    signUp,
    resendVerificationEmail,
    resetPasswordForEmail,
    updatePassword,
    signOut,
    refreshProfile,
    clearPasswordRecovery,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
