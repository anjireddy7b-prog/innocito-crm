import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import path from 'path';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { apiLimiter } from '@/middleware/rateLimiter';
import { sanitizeBody } from '@/middleware/sanitize';
import { issueCsrfToken } from '@/middleware/csrf';
import { notFoundHandler, errorHandler } from '@/middleware/errorHandler';
import { apiRouter } from '@/modules/router';

export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1);

  // --- Security headers ---
  app.use(
    helmet({
      contentSecurityPolicy: false, // SPA is served separately; API sets its own headers
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // --- CORS: only the configured SPA origin may call this API with credentials ---
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
      exposedHeaders: ['X-Total-Count'],
    })
  );

  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  app.use(sanitizeBody);
  app.use(issueCsrfToken);

  // --- Structured request logging ---
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  // --- Static file serving for uploaded documents (auth-checked at route level) ---
  app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)));

  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  app.use('/api', apiLimiter, apiRouter);
  // Phase 11 (API/integrations), slice 1: a versioned surface for external consumers, mounting
  // the exact same router — every route, every behavior, identical to /api — so there is zero
  // drift between the two and zero risk to the existing frontend, which keeps calling /api
  // unversioned exactly as before. /api/v1 exists purely so an external integration has a stable
  // path to depend on that this app's own frontend was never coupled to in the first place.
  app.use('/api/v1', apiLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
