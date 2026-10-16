import { Router, type Request, type Response } from 'express';
import { config } from '../config/env';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'Modify Video Editor & Template Studio API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.env,
    architecture: {
      auth: 'Supabase Auth (JWT verified)',
      database: 'PostgreSQL + Drizzle ORM',
      storage: 'Cloudflare R2 (S3-compatible zero egress)',
      renderer: 'Remotion + FFmpeg (Max 1080p)',
      queue: 'Redis + BullMQ',
      billing: 'Stripe (Free vs Pro)',
    },
    servicesConfigured: config.servicesConfigured,
    capabilities: {
      maxExportResolution: '1080p',
      templateSlotSupport: true,
      directR2Upload: true,
    },
  });
});
