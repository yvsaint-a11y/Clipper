import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: 3000, // Hardcoded required port
  host: '0.0.0.0',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  database: {
    url: process.env.DATABASE_URL || '',
  },
  databaseUrl: process.env.DATABASE_URL || '',
  supabase: {
    url: process.env.VITE_SUPABASE_URL || '',
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
  },
  r2: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || 'modify-media-assets',
    publicDomain: process.env.R2_PUBLIC_DOMAIN || '',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    proPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
  },
  sentry: {
    dsn: process.env.SENTRY_DSN || '',
  },
  servicesConfigured: {
    supabase: Boolean(process.env.VITE_SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)),
    database: Boolean(process.env.DATABASE_URL),
    r2: Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY),
    redis: Boolean(process.env.REDIS_URL),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    sentry: Boolean(process.env.SENTRY_DSN),
  },
};
