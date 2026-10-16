import { Router, type Request, type Response } from 'express';
import { checkDatabaseConnection, schema } from '../db';

export const databaseRouter = Router();

/**
 * GET /api/db/status
 * Reports connection status to the configured PostgreSQL database without exposing credentials.
 */
databaseRouter.get('/status', async (_req: Request, res: Response) => {
  const dbStatus = await checkDatabaseConnection();

  const registeredSchemas = Object.keys(schema).filter(
    (key) => !key.endsWith('Relations')
  );

  res.json({
    database: dbStatus,
    registeredSchemas,
    engine: 'PostgreSQL + Drizzle ORM',
    authProvider: 'Supabase Auth (UUID identity bound to database records)',
    timestamp: new Date().toISOString(),
  });
});
