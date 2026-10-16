import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { config } from '../config/env';

let dbInstance: PostgresJsDatabase<typeof schema> | null = null;
let sqlClient: postgres.Sql | null = null;

export interface DatabaseStatus {
  isConfigured: boolean;
  isConnected: boolean;
  error: string | null;
  latencyMs: number | null;
}

/**
 * Returns the Drizzle ORM client instance with lazy initialization.
 * Prevents application startup crashes if DATABASE_URL is not yet provided.
 */
export function getDb(): PostgresJsDatabase<typeof schema> | null {
  if (dbInstance) {
    return dbInstance;
  }

  const dbUrl = config.database.url;
  if (!dbUrl) {
    return null;
  }

  try {
    sqlClient = postgres(dbUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // Recommended for Supabase transaction pooler (port 6543)
    });

    dbInstance = drizzle(sqlClient, { schema });
    return dbInstance;
  } catch (error) {
    console.error('[DB] Failed to initialize PostgreSQL connection:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Checks PostgreSQL database connectivity without leaking credentials.
 */
export async function checkDatabaseConnection(): Promise<DatabaseStatus> {
  const dbUrl = config.database.url;
  if (!dbUrl) {
    return {
      isConfigured: false,
      isConnected: false,
      error: 'DATABASE_URL environment variable is not configured',
      latencyMs: null,
    };
  }

  const start = Date.now();
  let tempClient: postgres.Sql | null = null;

  try {
    tempClient = postgres(dbUrl, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
      prepare: false,
    });

    await tempClient`SELECT 1 AS health_check`;
    const latencyMs = Date.now() - start;

    return {
      isConfigured: true,
      isConnected: true,
      error: null,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const safeErrorMessage = error instanceof Error 
      ? error.message.replace(/postgres:\/\/[^@]+@/, 'postgres://***:***@')
      : 'Unknown database connection error';

    return {
      isConfigured: true,
      isConnected: false,
      error: safeErrorMessage,
      latencyMs,
    };
  } finally {
    if (tempClient) {
      try {
        await tempClient.end({ timeout: 2 });
      } catch {
        // Ignore disconnect cleanup errors
      }
    }
  }
}

export { schema };
