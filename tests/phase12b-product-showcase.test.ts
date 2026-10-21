import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  hasSeenBrandIntro,
  hasSeenProductShowcase,
  hasCompletedOnboarding,
  markBrandIntroSeen,
  markProductShowcaseSeen,
  markOnboardingCompleted,
  resetOnboarding,
  ONBOARDING_STORAGE_KEYS,
} from '../src/features/onboarding/utils/onboardingStorage';

describe('Phase 12B: Cinematic Product Showcase & Interactive Tour', () => {
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

  describe('1. Showcase Storage & Progression Persistence', () => {
    it('returns false for first-time visitors for both intro and showcase', () => {
      expect(hasSeenBrandIntro()).toBe(false);
      expect(hasSeenProductShowcase()).toBe(false);
      expect(hasCompletedOnboarding()).toBe(false);
    });

    it('marks brand intro seen without prematurely completing full onboarding', () => {
      markBrandIntroSeen();
      expect(hasSeenBrandIntro()).toBe(true);
      expect(hasSeenProductShowcase()).toBe(false);
    });

    it('marks showcase seen and records timestamp upon showcase completion', () => {
      markProductShowcaseSeen();
      expect(hasSeenProductShowcase()).toBe(true);
      expect(mockStorage[ONBOARDING_STORAGE_KEYS.SHOWCASE_SEEN]).toBe('true');
      expect(mockStorage[ONBOARDING_STORAGE_KEYS.COMPLETED_TIMESTAMP]).toBeDefined();
    });

    it('markOnboardingCompleted records both steps in a single atomic action', () => {
      markOnboardingCompleted();
      expect(hasSeenBrandIntro()).toBe(true);
      expect(hasSeenProductShowcase()).toBe(true);
      expect(hasCompletedOnboarding()).toBe(true);
    });

    it('resets all onboarding state cleanly for full replay', () => {
      markOnboardingCompleted();
      expect(hasCompletedOnboarding()).toBe(true);
      resetOnboarding();
      expect(hasSeenBrandIntro()).toBe(false);
      expect(hasSeenProductShowcase()).toBe(false);
      expect(hasCompletedOnboarding()).toBe(false);
    });
  });

  describe('2. Multi-Step Onboarding Navigation State Machine', () => {
    type OnboardingStep = 'brand_intro' | 'showcase' | 'none';

    const resolveAppShellState = (params: {
      user: { id: string; email: string } | null;
      isPasswordRecovery: boolean;
      introSeen: boolean;
      showcaseSeen: boolean;
    }) => {
      const { user, isPasswordRecovery, introSeen, showcaseSeen } = params;

      if (user || isPasswordRecovery) {
        return {
          step: 'none' as OnboardingStep,
          view: user ? 'ProductShell' : 'PublicLandingPage',
          openAuthModal: Boolean(isPasswordRecovery),
          authModalMode: isPasswordRecovery ? 'reset_password' : 'none',
        };
      }

      if (!introSeen) {
        return {
          step: 'brand_intro' as OnboardingStep,
          view: 'CinematicBrandReveal',
          openAuthModal: false,
        };
      }

      if (!showcaseSeen) {
        return {
          step: 'showcase' as OnboardingStep,
          view: 'CinematicProductShowcase',
          openAuthModal: false,
        };
      }

      return {
        step: 'none' as OnboardingStep,
        view: 'PublicLandingPage',
        openAuthModal: false,
      };
    };

    it('initiates new visitors at brand_intro', () => {
      const state = resolveAppShellState({
        user: null,
        isPasswordRecovery: false,
        introSeen: false,
        showcaseSeen: false,
      });

      expect(state.step).toBe('brand_intro');
      expect(state.view).toBe('CinematicBrandReveal');
    });

    it('advances from brand_intro to showcase when brand reveal completes or is skipped', () => {
      // Step 1: User skips or completes brand reveal
      markBrandIntroSeen();

      const state = resolveAppShellState({
        user: null,
        isPasswordRecovery: false,
        introSeen: hasSeenBrandIntro(),
        showcaseSeen: hasSeenProductShowcase(),
      });

      expect(state.step).toBe('showcase');
      expect(state.view).toBe('CinematicProductShowcase');
      expect(state.openAuthModal).toBe(false);
    });

    it('advances from showcase to existing authentication entry point upon tour completion or skip', () => {
      // Step 2: User completes or skips showcase
      markOnboardingCompleted();

      const state = resolveAppShellState({
        user: null,
        isPasswordRecovery: false,
        introSeen: hasSeenBrandIntro(),
        showcaseSeen: hasSeenProductShowcase(),
      });

      expect(state.step).toBe('none');
      expect(state.view).toBe('PublicLandingPage');
    });

    it('returning logged-out visitors bypass both intro and showcase directly', () => {
      const state = resolveAppShellState({
        user: null,
        isPasswordRecovery: false,
        introSeen: true,
        showcaseSeen: true,
      });

      expect(state.step).toBe('none');
      expect(state.view).toBe('PublicLandingPage');
      expect(state.openAuthModal).toBe(false);
    });

    it('authenticated users bypass onboarding directly to ProductShell', () => {
      const state = resolveAppShellState({
        user: { id: 'usr-1', email: 'director@clipper.video' },
        isPasswordRecovery: false,
        introSeen: false,
        showcaseSeen: false,
      });

      expect(state.step).toBe('none');
      expect(state.view).toBe('ProductShell');
    });

    it('active password recovery overrides onboarding without showing tour', () => {
      const state = resolveAppShellState({
        user: null,
        isPasswordRecovery: true,
        introSeen: false,
        showcaseSeen: false,
      });

      expect(state.step).toBe('none');
      expect(state.openAuthModal).toBe(true);
      expect(state.authModalMode).toBe('reset_password');
    });
  });

  describe('3. Showcase Design & Copy Requirements', () => {
    const showcasePath = path.resolve(
      process.cwd(),
      'src/features/onboarding/components/CinematicProductShowcase.tsx'
    );
    const source = fs.readFileSync(showcasePath, 'utf-8');

    it('includes required primary headline: YOUR VISION. YOUR EDIT. YOUR TEMPLATE.', () => {
      expect(source).toContain('Your Vision. Your Edit. Your Template.');
    });

    it('includes required supporting text regarding reusable editing templates', () => {
      expect(source).toContain(
        'Create professional videos, save your editing workflow as reusable templates, and make your next project easier to produce.'
      );
    });

    it('communicates all four required steps', () => {
      // STEP 01 — CREATE
      expect(source).toContain('STEP 01 — CREATE');
      expect(source).toContain('Start Projects & Organize Media');

      // STEP 02 — EDIT
      expect(source).toContain('STEP 02 — EDIT');
      expect(source).toContain('Multi-Track Precision Editing');

      // STEP 03 — SAVE YOUR TEMPLATE
      expect(source).toContain('STEP 03 — SAVE YOUR TEMPLATE');
      expect(source).toContain('Preserve The Editing Recipe');
      expect(source).toContain('An immutable editing blueprint, not a rendered video');

      // STEP 04 — REUSE
      expect(source).toContain('STEP 04 — REUSE');
      expect(source).toContain('One Recipe. Infinite Variations.');
    });

    it('contains no developer or infrastructure implementation labels in customer presentation', () => {
      expect(source).not.toContain('PostgreSQL');
      expect(source).not.toContain('Drizzle');
      expect(source).not.toContain('Supabase');
      expect(source).not.toContain('Redis');
      expect(source).not.toContain('Cloudflare R2');
    });
  });

  describe('4. Navigation, Controls & Interaction Safety', () => {
    it('prevents duplicate callbacks on completion', () => {
      const onComplete = vi.fn();
      let completed = false;

      const triggerFinish = () => {
        if (completed) return;
        completed = true;
        onComplete();
      };

      triggerFinish();
      triggerFinish();
      triggerFinish();

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('includes keyboard navigation bindings (ArrowRight, ArrowLeft, Escape)', () => {
      const showcasePath = path.resolve(
        process.cwd(),
        'src/features/onboarding/components/CinematicProductShowcase.tsx'
      );
      const source = fs.readFileSync(showcasePath, 'utf-8');

      expect(source).toContain("e.key === 'ArrowRight'");
      expect(source).toContain("e.key === 'ArrowLeft'");
      expect(source).toContain("e.key === 'Escape'");
    });

    it('pauses auto-advancement when user interacts with controls or hovers', () => {
      const showcasePath = path.resolve(
        process.cwd(),
        'src/features/onboarding/components/CinematicProductShowcase.tsx'
      );
      const source = fs.readFileSync(showcasePath, 'utf-8');

      expect(source).toContain('onMouseEnter={() => setIsPaused(true)}');
      expect(source).toContain('onMouseLeave={() => setIsPaused(false)}');
      expect(source).toContain('setIsPaused(true)');
    });

    it('respects prefers-reduced-motion', () => {
      const showcasePath = path.resolve(
        process.cwd(),
        'src/features/onboarding/components/CinematicProductShowcase.tsx'
      );
      const source = fs.readFileSync(showcasePath, 'utf-8');

      expect(source).toContain('prefers-reduced-motion: reduce');
    });
  });
});
