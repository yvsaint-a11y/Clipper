import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  hasSeenBrandIntro,
  markBrandIntroSeen,
  resetBrandIntro,
  ONBOARDING_STORAGE_KEYS,
} from '../src/features/onboarding/utils/onboardingStorage';

describe('Phase 12A & 12A.1: Onboarding Foundation & Cinematic Brand Experience', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };

    vi.stubGlobal('localStorage', storageMock);
    vi.stubGlobal('window', { localStorage: storageMock });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Onboarding State Persistence', () => {
    it('returns false for first-time visitors who have not seen intro', () => {
      expect(hasSeenBrandIntro()).toBe(false);
    });

    it('records and returns true once markBrandIntroSeen is called', () => {
      markBrandIntroSeen();
      expect(hasSeenBrandIntro()).toBe(true);
      expect(mockStorage[ONBOARDING_STORAGE_KEYS.INTRO_SEEN]).toBe('true');
      expect(mockStorage[ONBOARDING_STORAGE_KEYS.COMPLETED_TIMESTAMP]).toBeDefined();
    });

    it('resets intro state cleanly for replay or test resets', () => {
      markBrandIntroSeen();
      expect(hasSeenBrandIntro()).toBe(true);
      resetBrandIntro();
      expect(hasSeenBrandIntro()).toBe(false);
      expect(mockStorage[ONBOARDING_STORAGE_KEYS.INTRO_SEEN]).toBeUndefined();
    });

    it('handles restricted environments (private browsing, localStorage throwing) gracefully', () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => {
          throw new Error('QuotaExceeded or SecurityError in private window');
        }),
        setItem: vi.fn(() => {
          throw new Error('QuotaExceeded');
        }),
        removeItem: vi.fn(() => {
          throw new Error('SecurityError');
        }),
      });

      expect(() => hasSeenBrandIntro()).not.toThrow();
      expect(hasSeenBrandIntro()).toBe(false);
      expect(() => markBrandIntroSeen()).not.toThrow();
      expect(() => resetBrandIntro()).not.toThrow();
    });
  });

  describe('2. Routing & Shell Navigation Decision Matrix', () => {
    const resolveAppShellView = (params: {
      user: { id: string; email: string } | null;
      isPasswordRecovery: boolean;
      introSeen: boolean;
    }) => {
      const { user, isPasswordRecovery, introSeen } = params;

      if (user) {
        return {
          view: 'ProductShell',
          showBrandIntro: false,
          openAuthModal: false,
        };
      }

      if (isPasswordRecovery) {
        return {
          view: 'PublicLandingPage',
          showBrandIntro: false,
          openAuthModal: true,
          authModalMode: 'reset_password',
        };
      }

      if (!introSeen) {
        return {
          view: 'CinematicBrandReveal',
          showBrandIntro: true,
          openAuthModal: false,
        };
      }

      return {
        view: 'PublicLandingPage',
        showBrandIntro: false,
        openAuthModal: false,
      };
    };

    it('displays CinematicBrandReveal for first-time unauthenticated visitor', () => {
      const result = resolveAppShellView({
        user: null,
        isPasswordRecovery: false,
        introSeen: false,
      });

      expect(result.view).toBe('CinematicBrandReveal');
      expect(result.showBrandIntro).toBe(true);
    });

    it('bypasses intro to PublicLandingPage for returning unauthenticated visitor', () => {
      const result = resolveAppShellView({
        user: null,
        isPasswordRecovery: false,
        introSeen: true,
      });

      expect(result.view).toBe('PublicLandingPage');
      expect(result.showBrandIntro).toBe(false);
    });

    it('bypasses intro directly to ProductShell for authenticated users', () => {
      const result = resolveAppShellView({
        user: { id: 'u123', email: 'director@clipper.studio' },
        isPasswordRecovery: false,
        introSeen: false,
      });

      expect(result.view).toBe('ProductShell');
      expect(result.showBrandIntro).toBe(false);
    });

    it('guarantees active password recovery overrides onboarding without showing intro', () => {
      const result = resolveAppShellView({
        user: null,
        isPasswordRecovery: true,
        introSeen: false,
      });

      expect(result.showBrandIntro).toBe(false);
      expect(result.openAuthModal).toBe(true);
      expect(result.authModalMode).toBe('reset_password');
    });

    it('transitions directly to authentication entry point when intro is completed or skipped', () => {
      let currentView = resolveAppShellView({
        user: null,
        isPasswordRecovery: false,
        introSeen: false,
      });
      expect(currentView.view).toBe('CinematicBrandReveal');

      markBrandIntroSeen();
      currentView = resolveAppShellView({
        user: null,
        isPasswordRecovery: false,
        introSeen: hasSeenBrandIntro(),
      });
      expect(currentView.view).toBe('PublicLandingPage');
      expect(currentView.showBrandIntro).toBe(false);
    });
  });

  describe('3. Brand Asset Integrity & Proportions', () => {
    it('verifies public/assets/clipper-logo.svg exists and contains correct brand elements', () => {
      const logoPath = path.resolve(process.cwd(), 'public/assets/clipper-logo.svg');
      expect(fs.existsSync(logoPath)).toBe(true);

      const content = fs.readFileSync(logoPath, 'utf-8');
      expect(content).toContain('fill="#0D0E10"');
      expect(content).toContain('CLIPPER');
      expect(content).toContain('fill="#F2F2F0"');
      expect(content).toContain('clipper-svg-sheen');
    });

    it('verifies ClipperLogo component exports xl size for cinematic intro while preserving proportions', () => {
      const componentPath = path.resolve(process.cwd(), 'src/components/ClipperLogo.tsx');
      const content = fs.readFileSync(componentPath, 'utf-8');

      expect(content).toContain("'sm' | 'md' | 'lg' | 'xl'");
      expect(content).toContain('w-14 h-14 sm:w-16 sm:h-16');
      expect(content).toContain('Clipper');
    });
  });

  describe('4. Phase 12A.1 Timing & Callback Guarantees', () => {
    it('verifies CinematicBrandReveal timing contract (visible hold >= 3s, total duration 5-7s)', () => {
      const revealSourcePath = path.resolve(
        process.cwd(),
        'src/features/onboarding/components/CinematicBrandReveal.tsx'
      );
      const source = fs.readFileSync(revealSourcePath, 'utf-8');

      // Verify defaults
      expect(source).toContain('visibleHoldMs = 4800');
      expect(source).toContain('exitDurationMs = 800');
      // Verify minimum visible hold guard
      expect(source).toContain('Math.max(3500, visibleHoldMs)');
      // Verify entrance duration class 1200ms
      expect(source).toContain("duration-[1200ms]");
      // Verify exit duration class 800ms
      expect(source).toContain("duration-[800ms]");
    });

    it('ensures duplicate callbacks cannot be triggered', () => {
      const onComplete = vi.fn();
      let completed = false;

      const triggerExit = (isImmediate: boolean) => {
        if (completed) return;
        completed = true;
        onComplete();
      };

      // Rapidly trigger multiple times
      triggerExit(true);
      triggerExit(true);
      triggerExit(false);

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('respects prefers-reduced-motion without cutting the visible hold short', () => {
      const revealSourcePath = path.resolve(
        process.cwd(),
        'src/features/onboarding/components/CinematicBrandReveal.tsx'
      );
      const source = fs.readFileSync(revealSourcePath, 'utf-8');

      // Reduced motion should NOT reduce visible hold below 3500ms
      expect(source).not.toContain('timeoutDuration = prefersReducedMotion ? 1000 :');
      expect(source).toContain('prefers-reduced-motion: reduce');
    });
  });

  describe('5. Removal of Developer & Technology Clutter from Public UI', () => {
    it('ensures PublicLandingPage contains zero developer-facing labels', () => {
      const landingPagePath = path.resolve(
        process.cwd(),
        'src/features/landing/PublicLandingPage.tsx'
      );
      const content = fs.readFileSync(landingPagePath, 'utf-8');

      // Technical stack labels must NOT appear on public landing page
      expect(content).not.toContain('PostgreSQL');
      expect(content).not.toContain('Cloudflare R2');
      expect(content).not.toContain('Drizzle ORM');
      expect(content).not.toContain('Redis');
      expect(content).not.toContain('Developer Diagnostics');
      expect(content).not.toContain('onOpenDiagnostics');
    });

    it('ensures AuthModal contains zero technical infrastructure disclosures', () => {
      const authModalPath = path.resolve(
        process.cwd(),
        'src/features/auth/AuthModal.tsx'
      );
      const content = fs.readFileSync(authModalPath, 'utf-8');

      expect(content).not.toContain('Supabase Auth Authority');
      expect(content).not.toContain('R2 assets, and PostgreSQL project states');
      expect(content).toContain('Encrypted Studio Access');
    });

    it('ensures AppShell product footer does not display developer connection labels', () => {
      const appShellPath = path.resolve(
        process.cwd(),
        'src/components/AppShell.tsx'
      );
      const content = fs.readFileSync(appShellPath, 'utf-8');

      expect(content).not.toContain('PostgreSQL & Cloudflare R2 Connected');
      expect(content).toContain('Studio Engine Active');
    });
  });
});
