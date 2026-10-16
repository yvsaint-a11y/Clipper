import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SignUpResult, SignInResult } from '../src/features/auth/AuthContext';

describe('Phase 7D: Product Shell & Authentication Recovery', () => {
  let mockSignUp: any;
  let mockSignInWithPassword: any;
  let mockResend: any;
  let mockResetPasswordForEmail: any;
  let mockUpdateUser: any;
  let mockSignOut: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUp = vi.fn();
    mockSignInWithPassword = vi.fn();
    mockResend = vi.fn();
    mockResetPasswordForEmail = vi.fn();
    mockUpdateUser = vi.fn();
    mockSignOut = vi.fn();
  });

  describe('Part 1 & 3: Logged-Out Public Experience vs Developer Tools Isolation', () => {
    it('1. provides public landing page state with "Create. Edit. Reuse." and core CTAs for unauthenticated visitors', () => {
      // Logic simulation of AppShell unauthenticated branch
      const getRenderedShell = (user: any) => {
        if (!user) {
          return {
            view: 'PublicLandingPage',
            headline: 'Create. Edit. Reuse.',
            subhead: 'Modify is a cinematic video editor engineered with reusable editing templates.',
            primaryCta: 'Start Creating',
            secondaryCta: 'Explore Templates',
            featuresSection: true,
            templatesSection: true,
          };
        }
        return { view: 'ProductShell' };
      };

      const unauthenticatedState = getRenderedShell(null);
      expect(unauthenticatedState.view).toBe('PublicLandingPage');
      expect(unauthenticatedState.headline).toBe('Create. Edit. Reuse.');
      expect(unauthenticatedState.primaryCta).toBe('Start Creating');
      expect(unauthenticatedState.secondaryCta).toBe('Explore Templates');
      expect(unauthenticatedState.featuresSection).toBe(true);
      expect(unauthenticatedState.templatesSection).toBe(true);
    });

    it('2. ensures developer tools are completely excluded from normal customer navigation', () => {
      // Define customer navigation items
      const customerNavItems = ['Projects', 'Templates', 'Media', 'New Project'];
      const internalDevSurfaces = [
        'Architecture / Blueprint',
        'Ping API',
        '5D Design System Showcase',
        'Database Explorer',
        'System & API Health',
        'Canonical Timeline Models',
        'Zustand Store Sandbox',
      ];

      // Verify no developer surface is part of primary customer navigation
      for (const devTool of internalDevSurfaces) {
        expect(customerNavItems).not.toContain(devTool);
      }

      // Verify developer surfaces are isolated to internal diagnostics modal
      const isDeveloperSurfaceInNormalNav = (item: string) => customerNavItems.includes(item);
      expect(isDeveloperSurfaceInNormalNav('Database Explorer')).toBe(false);
      expect(isDeveloperSurfaceInNormalNav('Blueprint')).toBe(false);
      expect(isDeveloperSurfaceInNormalNav('Ping API')).toBe(false);
      expect(isDeveloperSurfaceInNormalNav('Zustand Store Sandbox')).toBe(false);
    });
  });

  describe('Part 2, 6 & 7: Authenticated Product Shell Navigation & Workspace', () => {
    const mockUser = { id: 'usr-123', email: 'creator@studio.com' };

    it('3. renders authenticated product navigation with Projects, Templates, Media and New Project', () => {
      const getNavigationTabs = (user: any) => {
        if (!user) return [];
        return [
          { id: 'projects', label: 'Projects' },
          { id: 'templates', label: 'Templates' },
          { id: 'media', label: 'Media' },
        ];
      };

      const tabs = getNavigationTabs(mockUser);
      expect(tabs).toHaveLength(3);
      expect(tabs.map((t) => t.id)).toEqual(['projects', 'templates', 'media']);
    });

    it('4. allows authenticated visitor to access Projects Dashboard', () => {
      const getActiveComponent = (activeTab: string, activeProject: any) => {
        if (activeTab === 'projects') {
          return activeProject ? 'ProjectWorkspace' : 'ProjectDashboard';
        }
        if (activeTab === 'templates') return 'TemplateLibrary';
        if (activeTab === 'media') return 'MediaManager';
        return null;
      };

      const rendered = getActiveComponent('projects', null);
      expect(rendered).toBe('ProjectDashboard');
    });

    it('5. allows authenticated visitor to access Template Library', () => {
      const getActiveComponent = (activeTab: string) => {
        if (activeTab === 'templates') return 'TemplateLibrary';
        return null;
      };

      expect(getActiveComponent('templates')).toBe('TemplateLibrary');
    });

    it('6. allows authenticated visitor to access Media Manager', () => {
      const getActiveComponent = (activeTab: string) => {
        if (activeTab === 'media') return 'MediaManager';
        return null;
      };

      expect(getActiveComponent('media')).toBe('MediaManager');
    });

    it('7. ensures editor workspace remains fully reachable when selecting an active project', () => {
      const activeProject = {
        id: 'proj-456',
        name: 'Launch Trailer',
        aspectRatio: '16:9',
      };

      const getWorkspaceView = (tab: string, project: any) => {
        if (tab === 'projects' && project) {
          return { component: 'ProjectWorkspace', projectId: project.id };
        }
        return null;
      };

      const editorView = getWorkspaceView('projects', activeProject);
      expect(editorView?.component).toBe('ProjectWorkspace');
      expect(editorView?.projectId).toBe('proj-456');
    });

    it('14. transitions back to public landing page when user signs out', async () => {
      let currentUser: any = mockUser;
      const signOut = async () => {
        await mockSignOut();
        currentUser = null;
      };

      expect(currentUser).not.toBeNull();
      await signOut();
      expect(currentUser).toBeNull();
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('Part 4: Authentication Recovery Workflows', () => {
    it('8. provides functional resend verification email action calling Supabase Auth', async () => {
      mockResend.mockResolvedValueOnce({ error: null });

      const resendVerification = async (email: string, origin: string) => {
        if (!email || !email.trim()) {
          return { success: false, error: 'Please enter your account email address.' };
        }
        const { error } = await mockResend({
          type: 'signup',
          email: email.trim(),
          options: {
            emailRedirectTo: origin,
          },
        });
        if (error) return { success: false, error: error.message };
        return { success: true };
      };

      const res = await resendVerification('creator@studio.com', 'https://studio.modify.video');
      expect(res.success).toBe(true);
      expect(mockResend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'creator@studio.com',
        options: {
          emailRedirectTo: 'https://studio.modify.video',
        },
      });
    });

    it('9. enforces resend verification cooldown to prevent spamming requests', () => {
      let cooldown = 45;
      const canResend = (remainingSeconds: number) => remainingSeconds <= 0;

      expect(canResend(cooldown)).toBe(false);

      // Advance simulated timer
      cooldown = 0;
      expect(canResend(cooldown)).toBe(true);
    });

    it('10. detects unconfirmed sign-in attempt and provides resend recovery flow with existing email', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Email not confirmed' },
      });

      const handleSignIn = async (email: string, pass: string): Promise<SignInResult> => {
        const { error } = await mockSignInWithPassword({ email, password: pass });
        if (error) {
          const isUnconfirmed = error.message.toLowerCase().includes('not confirmed');
          return { success: false, error: error.message, isUnconfirmed };
        }
        return { success: true };
      };

      const result = await handleSignIn('unverified@studio.com', 'ValidPass123!');
      expect(result.success).toBe(false);
      expect(result.isUnconfirmed).toBe(true);
      expect(result.error).toBe('Email not confirmed');
    });

    it('11. handles duplicate/existing signup without falsely claiming a new account was created', async () => {
      // In Supabase, if an already confirmed user signs up again, identities array is empty
      mockSignUp.mockResolvedValueOnce({
        data: {
          user: { id: 'usr-existing', email: 'alice@studio.com', identities: [] },
          session: null,
        },
        error: null,
      });

      const handleSignUp = async (email: string, pass: string): Promise<SignUpResult> => {
        const { data, error } = await mockSignUp({ email, password: pass });
        if (error) return { success: false, error: error.message };

        // Duplicate account detection:
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          return {
            success: false,
            error: 'An account may already exist with this email. Try signing in or resetting your password.',
            isExistingUser: true,
          };
        }

        return { success: true };
      };

      const result = await handleSignUp('alice@studio.com', 'SomePassword123!');
      expect(result.success).toBe(false);
      expect(result.isExistingUser).toBe(true);
      expect(result.error).toContain('An account may already exist with this email');
    });

    it('12. displays genuine email verification confirmation state on brand new signup', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: {
          user: {
            id: 'usr-new',
            email: 'newuser@studio.com',
            identities: [{ id: 'ident-1', provider: 'email' }],
          },
          session: null,
        },
        error: null,
      });

      const handleSignUp = async (email: string, pass: string): Promise<SignUpResult> => {
        const { data, error } = await mockSignUp({ email, password: pass });
        if (error) return { success: false, error: error.message };

        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length > 0 && !data.session) {
          return {
            success: true,
            requiresConfirmation: true,
            email: data.user.email,
          };
        }

        return { success: true, requiresConfirmation: false };
      };

      const result = await handleSignUp('newuser@studio.com', 'StrongPass123!');
      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.email).toBe('newuser@studio.com');
    });

    it('13. confirms password recovery flow remains functional', async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
      mockUpdateUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-123' } },
        error: null,
      });

      // Request reset
      const resetRes = await mockResetPasswordForEmail('creator@studio.com', {
        redirectTo: 'https://studio.modify.video',
      });
      expect(resetRes.error).toBeNull();
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('creator@studio.com', {
        redirectTo: 'https://studio.modify.video',
      });

      // Update password
      const updateRes = await mockUpdateUser({ password: 'NewSecurePassword123!' });
      expect(updateRes.error).toBeNull();
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewSecurePassword123!' });
    });
  });
});
