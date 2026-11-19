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

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isProd = process.env.NODE_ENV === 'production';

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

// Root service status endpoint
app.get('/', (_req, res) => {
  res.json({
    service: 'AVENORA AI Backend API',
    status: 'running',
    firebaseProjectId: 'avenora-ai',
    health: '/api/health'
  });
});

// Public health check endpoint
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

// API 404 handler & global error handler
app.use('/api', notFoundHandler);
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AVENORA AI backend listening on http://0.0.0.0:${PORT} (project: avenora-ai)`);
});
