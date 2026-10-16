export type SubscriptionTier = 'free' | 'pro';

export interface UserProfile {
  id: string; // References Supabase Auth User ID (UUID)
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  subscriptionTier: SubscriptionTier;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  user: UserProfile | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}
