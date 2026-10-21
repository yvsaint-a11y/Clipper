/**
 * CLIPPER — ONBOARDING STATE PERSISTENCE
 * 
 * Safe local storage persistence for onboarding lifecycle, brand intro reveal,
 * and cinematic product showcase tour.
 * Handles private browsing, SSR, and storage quota exceptions gracefully.
 */

export const ONBOARDING_STORAGE_KEYS = {
  INTRO_SEEN: 'clipper_brand_intro_seen_v1',
  SHOWCASE_SEEN: 'clipper_product_showcase_seen_v1',
  COMPLETED_TIMESTAMP: 'clipper_onboarding_completed_at',
} as const;

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Checks if the visitor has seen the cinematic brand introduction.
 */
export function hasSeenBrandIntro(): boolean {
  const storage = getStorage();
  if (!storage) return false;

  try {
    return storage.getItem(ONBOARDING_STORAGE_KEYS.INTRO_SEEN) === 'true';
  } catch {
    return false;
  }
}

/**
 * Marks the cinematic brand introduction as seen.
 */
export function markBrandIntroSeen(): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(ONBOARDING_STORAGE_KEYS.INTRO_SEEN, 'true');
    storage.setItem(
      ONBOARDING_STORAGE_KEYS.COMPLETED_TIMESTAMP,
      new Date().toISOString()
    );
  } catch (err) {
    console.warn('[OnboardingStorage] Failed to persist intro state:', err);
  }
}

/**
 * Checks if the visitor has seen the cinematic product showcase tour.
 */
export function hasSeenProductShowcase(): boolean {
  const storage = getStorage();
  if (!storage) return false;

  try {
    return storage.getItem(ONBOARDING_STORAGE_KEYS.SHOWCASE_SEEN) === 'true';
  } catch {
    return false;
  }
}

/**
 * Marks the product showcase tour as seen.
 */
export function markProductShowcaseSeen(): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(ONBOARDING_STORAGE_KEYS.SHOWCASE_SEEN, 'true');
    storage.setItem(
      ONBOARDING_STORAGE_KEYS.COMPLETED_TIMESTAMP,
      new Date().toISOString()
    );
  } catch (err) {
    console.warn('[OnboardingStorage] Failed to persist showcase state:', err);
  }
}

/**
 * Checks if the full onboarding sequence has been completed or bypassed.
 */
export function hasCompletedOnboarding(): boolean {
  const storage = getStorage();
  if (!storage) return false;

  try {
    // Both intro and showcase must be marked, or showcase marked (which implies completion)
    return (
      storage.getItem(ONBOARDING_STORAGE_KEYS.SHOWCASE_SEEN) === 'true' ||
      storage.getItem(ONBOARDING_STORAGE_KEYS.INTRO_SEEN) === 'true'
    );
  } catch {
    return false;
  }
}

/**
 * Marks both brand intro and showcase as completed in a single operation.
 */
export function markOnboardingCompleted(): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(ONBOARDING_STORAGE_KEYS.INTRO_SEEN, 'true');
    storage.setItem(ONBOARDING_STORAGE_KEYS.SHOWCASE_SEEN, 'true');
    storage.setItem(
      ONBOARDING_STORAGE_KEYS.COMPLETED_TIMESTAMP,
      new Date().toISOString()
    );
  } catch (err) {
    console.warn('[OnboardingStorage] Failed to mark onboarding completed:', err);
  }
}

/**
 * Resets the brand introduction state.
 */
export function resetBrandIntro(): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.removeItem(ONBOARDING_STORAGE_KEYS.INTRO_SEEN);
  } catch (err) {
    console.warn('[OnboardingStorage] Failed to reset intro state:', err);
  }
}

/**
 * Resets the entire onboarding state for replays or testing.
 */
export function resetOnboarding(): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.removeItem(ONBOARDING_STORAGE_KEYS.INTRO_SEEN);
    storage.removeItem(ONBOARDING_STORAGE_KEYS.SHOWCASE_SEEN);
    storage.removeItem(ONBOARDING_STORAGE_KEYS.COMPLETED_TIMESTAMP);
  } catch (err) {
    console.warn('[OnboardingStorage] Failed to reset onboarding state:', err);
  }
}
