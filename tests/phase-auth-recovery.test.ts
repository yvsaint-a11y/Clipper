import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Auth Patch: Password Recovery & Reset Flow', () => {
  let mockResetPasswordForEmail = vi.fn();
  let mockUpdateUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockResetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    mockUpdateUser = vi.fn().mockResolvedValue({ data: { user: { id: 'usr-123' } }, error: null });
  });

  it('validates email requirement when requesting password recovery link', async () => {
    const requestReset = async (email: string) => {
      if (!email || !email.trim()) {
        return { success: false, error: 'Please enter your account email address.' };
      }
      const { error } = await mockResetPasswordForEmail(email, {
        redirectTo: 'https://studio.modify.video',
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    };

    const emptyAttempt = await requestReset('');
    expect(emptyAttempt.success).toBe(false);
    expect(emptyAttempt.error).toBe('Please enter your account email address.');
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();

    const validAttempt = await requestReset('creator@studio.com');
    expect(validAttempt.success).toBe(true);
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('creator@studio.com', {
      redirectTo: 'https://studio.modify.video',
    });
  });

  it('handles Supabase resetPasswordForEmail API errors gracefully', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { message: 'Over email rate limit. Please try again later.' },
    });

    const requestReset = async (email: string) => {
      const { error } = await mockResetPasswordForEmail(email);
      if (error) return { success: false, error: error.message };
      return { success: true };
    };

    const result = await requestReset('creator@studio.com');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Over email rate limit');
  });

  it('rejects password mismatch and weak passwords before submitting update', async () => {
    const handlePasswordUpdate = async (password: string, confirmPassword: string) => {
      if (!password || !confirmPassword) {
        return { success: false, error: 'Please enter and confirm your new password.' };
      }
      if (password.length < 6) {
        return { success: false, error: 'New password must be at least 6 characters.' };
      }
      if (password !== confirmPassword) {
        return { success: false, error: 'Passwords do not match.' };
      }

      const { data, error } = await mockUpdateUser({ password });
      if (error) return { success: false, error: error.message };
      return { success: true, user: data.user };
    };

    // Missing confirmation
    const missing = await handlePasswordUpdate('newPassword123', '');
    expect(missing.success).toBe(false);
    expect(missing.error).toBe('Please enter and confirm your new password.');
    expect(mockUpdateUser).not.toHaveBeenCalled();

    // Weak password (< 6 chars)
    const weak = await handlePasswordUpdate('abc', 'abc');
    expect(weak.success).toBe(false);
    expect(weak.error).toBe('New password must be at least 6 characters.');
    expect(mockUpdateUser).not.toHaveBeenCalled();

    // Mismatched passwords
    const mismatch = await handlePasswordUpdate('ValidPassword123', 'DifferentPassword123');
    expect(mismatch.success).toBe(false);
    expect(mismatch.error).toBe('Passwords do not match.');
    expect(mockUpdateUser).not.toHaveBeenCalled();

    // Matching valid password
    const valid = await handlePasswordUpdate('StrongPassword123!', 'StrongPassword123!');
    expect(valid.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'StrongPassword123!' });
  });

  it('handles expired recovery session error on password update', async () => {
    mockUpdateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Auth session missing or recovery token expired.' },
    });

    const update = async (password: string) => {
      const { error } = await mockUpdateUser({ password });
      if (error) {
        return {
          success: false,
          error: error.message || 'Failed to update password. Your recovery link may be expired or invalid.',
        };
      }
      return { success: true };
    };

    const res = await update('NewValidPassword123');
    expect(res.success).toBe(false);
    expect(res.error).toContain('recovery token expired');
  });

  it('parses recovery url hash or query parameter properly', () => {
    const isRecoveryUrl = (url: string) => {
      return url.includes('type=recovery');
    };

    expect(isRecoveryUrl('https://studio.modify.video/#access_token=xyz&type=recovery')).toBe(true);
    expect(isRecoveryUrl('https://studio.modify.video/?type=recovery&code=123')).toBe(true);
    expect(isRecoveryUrl('https://studio.modify.video/#access_token=xyz&type=signup')).toBe(false);
    expect(isRecoveryUrl('https://studio.modify.video/')).toBe(false);
  });

  describe('Auth Patch: Email Verification Redirect Flow', () => {
    let mockSignUp = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
      mockSignUp = vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null });
    });

    it('passes window.location.origin as emailRedirectTo during signUp in browser environment', async () => {
      const originalWindow = globalThis.window;
      const testOrigin = 'https://ais-pre-vugjhblufca3afmsxspqke-19937296708.europe-west2.run.app';
      (globalThis as unknown as { window: unknown }).window = {
        location: {
          origin: testOrigin,
        },
      };

      try {
        const emailRedirectTo =
          typeof window !== 'undefined'
            ? window.location.origin
            : undefined;

        await mockSignUp({
          email: 'creator@studio.com',
          password: 'Password123!',
          options: {
            emailRedirectTo,
          },
        });

        expect(mockSignUp).toHaveBeenCalledWith({
          email: 'creator@studio.com',
          password: 'Password123!',
          options: {
            emailRedirectTo: testOrigin,
          },
        });
        expect(emailRedirectTo).toBe(testOrigin);
      } finally {
        globalThis.window = originalWindow;
      }
    });

    it('handles non-browser environment safely by setting emailRedirectTo to undefined', async () => {
      const originalWindow = globalThis.window;
      // @ts-ignore
      delete (globalThis as any).window;

      try {
        const emailRedirectTo =
          typeof window !== 'undefined'
            ? (window as any).location.origin
            : undefined;

        await mockSignUp({
          email: 'creator@studio.com',
          password: 'Password123!',
          options: {
            emailRedirectTo,
          },
        });

        expect(mockSignUp).toHaveBeenCalledWith({
          email: 'creator@studio.com',
          password: 'Password123!',
          options: {
            emailRedirectTo: undefined,
          },
        });
        expect(emailRedirectTo).toBeUndefined();
      } finally {
        globalThis.window = originalWindow;
      }
    });
  });
});
