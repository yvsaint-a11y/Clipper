import express, { type Express } from 'express';
import { healthRouter } from './routes/health';
import { databaseRouter } from './routes/database';
import { authRouter } from './routes/auth';
import { mediaRouter } from './routes/media';
import { projectsRouter } from './routes/projects';
import { templatesRouter } from './routes/templates';
import { rendersRouter } from './routes/renders';

export function createExpressApp(): Express {
  const app = express();

  // Basic middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api', healthRouter);
  app.use('/api/db', databaseRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/media', mediaRouter);
  app.use('/api', rendersRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/templates', templatesRouter);

  return app;
}
