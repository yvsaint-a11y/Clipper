import type { SubscriptionTier } from './user';

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

export interface PlanLimits {
  tier: SubscriptionTier;
  maxExportResolution: '720p' | '1080p'; // V1 ceiling is 1080p
  watermark: boolean;
  maxExportsPerMonth: number;
  maxStorageBytes: number;
  maxCustomTemplates: number;
}

export const PLAN_LIMITS: Record<SubscriptionTier, PlanLimits> = {
  free: {
    tier: 'free',
    maxExportResolution: '720p',
    watermark: true,
    maxExportsPerMonth: 5,
    maxStorageBytes: 1 * 1024 * 1024 * 1024, // 1 GB
    maxCustomTemplates: 3,
  },
  pro: {
    tier: 'pro',
    maxExportResolution: '1080p', // Max 1080p in V1 (no 4K)
    watermark: false,
    maxExportsPerMonth: 100,
    maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50 GB
    maxCustomTemplates: 50,
  },
};

export interface Subscription {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  tier: SubscriptionTier;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}
