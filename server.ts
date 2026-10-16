import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createExpressApp } from './server/app';
import { config } from './server/config/env';

async function startServer() {
  const app = createExpressApp();
  const PORT = config.port;
  const server = http.createServer(app);

  // In development, integrate Vite middleware directly into Express
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server,
          clientPort: 443,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the built static client from dist/
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, config.host, () => {
    console.log(`🚀 Modify Server running on http://${config.host}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
