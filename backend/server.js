import './config/loadEnv.js';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../frontend');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isProd = process.env.NODE_ENV === 'production';
const serveFrontend = process.env.SERVE_FRONTEND === 'true';

app.set('trust proxy', 1);

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

// Public health & service check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'avenora-ai-backend',
    mode: isProd ? 'production' : 'development',
    firebase: getFirebaseHealth(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY')
  });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// Protected user profile & archive export routes
app.use('/api/users', verifyAuthToken, apiRateLimiter, userRoutes);

// Protected event & subcollection REST API routes
app.use('/api/events', verifyAuthToken, apiRateLimiter, eventRoutes);
app.use('/api/events/:eventId/expenses', verifyAuthToken, apiRateLimiter, budgetRoutes);
app.use('/api/events/:eventId/tasks', verifyAuthToken, apiRateLimiter, checklistRoutes);
app.use('/api/events/:eventId/guests', verifyAuthToken, apiRateLimiter, guestRoutes);
app.use('/api/events/:eventId/vendors', verifyAuthToken, apiRateLimiter, vendorRoutes);
app.use('/api/events/:eventId/timeline', verifyAuthToken, apiRateLimiter, timelineRoutes);
app.use('/api/events/:eventId/themes', verifyAuthToken, apiRateLimiter, themeRoutes);
app.use('/api/events/:eventId/chats', verifyAuthToken, apiRateLimiter, copilotRoutes);

// Protected Gemini AI routes
app.use('/api/ai', verifyAuthToken, aiRateLimiter, aiRoutes);

// API 404 handler
app.use('/api', notFoundHandler);

async function startServer() {
  if (serveFrontend) {
    if (!isProd) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        configFile: path.resolve(frontendDir, 'vite.config.mjs'),
        server: { middlewareMode: true },
        appType: 'mpa'
      });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(path.resolve(frontendDir, 'dist')));
    }
  } else {
    app.get('/', (_req, res) => {
      res.json({
        service: 'AVENORA AI Backend API',
        status: 'running',
        health: '/api/health'
      });
    });
  }

  app.use(errorHandler);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AVENORA AI backend listening on http://0.0.0.0:${PORT} (project: avenora-ai)`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AVENORA AI backend server:', err);
  process.exit(1);
});
