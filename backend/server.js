import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './config/loadEnv.js';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getFirebaseHealth } from './config/firebaseAdmin.js';
import { verifyAuthToken } from './middleware/authMiddleware.js';
import {
  aiRateLimiter,
  apiRateLimiter,
  buildCorsOptions,
  errorHandler,
  notFoundHandler
} from './middleware/errorMiddleware.js';
import aiRoutes from './routes/aiRoutes.js';
import authRoutes from './routes/authRoutes.js';
import budgetRoutes from './routes/budgetRoutes.js';
import checklistRoutes from './routes/checklistRoutes.js';
import copilotRoutes from './routes/copilotRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import guestRoutes from './routes/guestRoutes.js';
import themeRoutes from './routes/themeRoutes.js';
import timelineRoutes from './routes/timelineRoutes.js';
import userRoutes from './routes/userRoutes.js';
import vendorRoutes from './routes/vendorRoutes.js';

export function createApp({ authMiddleware = verifyAuthToken } = {}) {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const corsOptions = buildCorsOptions();
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
    })
  );

  app.use(express.json({ limit: '1mb' }));

  // Prevent browser/proxy caching of sensitive authenticated API payloads
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Root service status endpoint
  app.get('/', (_req, res) => {
    res.json({
      service: 'AVENORA AI Backend API',
      status: 'running',
      firebaseProjectId: 'avenora-ai',
      health: '/api/health'
    });
  });

  // Public health check endpoints
  app.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      message: 'AVENORA AI backend is running',
      environment: isProd ? 'production' : 'development'
    });
  });

  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      success: true,
      message: 'AVENORA AI backend is running',
      environment: isProd ? 'production' : 'development',
      firebase: getFirebaseHealth()
    });
  });

  // Authentication routes
  app.use('/api/auth', authRoutes);

  // Protected user profile & archive export routes
  app.use('/api/users', authMiddleware, apiRateLimiter, userRoutes);

  // Protected event & subcollection REST API routes
  app.use('/api/events', authMiddleware, apiRateLimiter, eventRoutes);
  app.use('/api/events/:eventId/expenses', authMiddleware, apiRateLimiter, budgetRoutes);
  app.use('/api/events/:eventId/tasks', authMiddleware, apiRateLimiter, checklistRoutes);
  app.use('/api/events/:eventId/guests', authMiddleware, apiRateLimiter, guestRoutes);
  app.use('/api/events/:eventId/vendors', authMiddleware, apiRateLimiter, vendorRoutes);
  app.use('/api/events/:eventId/timeline', authMiddleware, apiRateLimiter, timelineRoutes);
  app.use('/api/events/:eventId/themes', authMiddleware, apiRateLimiter, themeRoutes);
  app.use('/api/events/:eventId/chats', authMiddleware, apiRateLimiter, copilotRoutes);

  // Protected Gemini AI routes
  app.use('/api/ai', authMiddleware, aiRateLimiter, aiRoutes);

  // API 404 handler & global error handler
  app.use('/api', notFoundHandler);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();

const isEntrypoint =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const PORT = Number(process.env.PORT) || 5000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AVENORA AI backend listening on http://0.0.0.0:${PORT} (project: avenora-ai)`);
  });
}
