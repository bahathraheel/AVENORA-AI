import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const aiMaxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 30;
const authMaxRequests = Number(process.env.AUTH_RATE_LIMIT_MAX) || 25;

export const aiRateLimiter = rateLimit({
  windowMs,
  max: aiMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip || '127.0.0.1'),
  message: {
    error: 'Too many AI requests in a short window. Please pause briefly and try again.'
  }
});

export const authRateLimiter = rateLimit({
  windowMs,
  max: authMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || '127.0.0.1'),
  message: {
    error: 'Too many authentication attempts. Please wait a minute and try again.'
  }
});

export const apiRateLimiter = rateLimit({
  windowMs,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip || '127.0.0.1'),
  message: {
    error: 'Too many workspace API requests. Please slow down briefly.'
  }
});

export function buildCorsOptions() {
  const rawOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const isProd = process.env.NODE_ENV === 'production';

  return {
    origin(origin, callback) {
      // Allow non-browser or same-origin requests (health checks, server-to-server, OAuth redirects)
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/+$/, '');

      if (rawOrigins.includes(cleanOrigin)) {
        return callback(null, true);
      }

      if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(cleanOrigin)) {
        return callback(null, true);
      }

      // Also allow Netlify deploy previews only when a primary Netlify site URL is explicitly configured
      if (rawOrigins.some((o) => o.endsWith('.netlify.app')) && /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/i.test(cleanOrigin)) {
        return callback(null, true);
      }

      if (rawOrigins.length === 0 && !isProd) {
        return callback(null, true);
      }

      const corsErr = new Error(`Origin "${origin}" is not permitted by CORS policy.`);
      corsErr.statusCode = 403;
      return callback(corsErr, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
}

export function notFoundHandler(_req, res) {
  return res.status(404).json({ error: 'API endpoint not found.' });
}

export function errorHandler(err, _req, res, _next) {
  const status = err?.statusCode || err?.status || 500;
  const code = err?.code || '';
  let message = err?.message || 'Internal server error.';

  if (code === 7 || code === 'PERMISSION_DENIED' || message.includes('PERMISSION_DENIED')) {
    message = 'Database permission denied. Verify the backend service account credentials for project avenora-ai.';
  } else if (message.includes('Could not load the default credentials')) {
    message = 'Backend Firebase credentials are missing. Configure FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY on the server.';
  }

  if (status >= 500) {
    console.error('[Backend Error]', status, message);
  }

  return res.status(status >= 400 && status < 600 ? status : 500).json({
    error: message,
    ...(code ? { code: String(code) } : {})
  });
}
