import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../backend/server.js';

function listenOnEphemeralPort(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
    server.on('error', reject);
  });
}

describe('Express REST API integration (default auth enforcement)', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    ({ server, baseUrl } = await listenOnEphemeralPort(app));
  });

  after(() => {
    server?.close();
  });

  it('serves service metadata and health endpoints referencing Firebase project avenora-ai', async () => {
    const rootRes = await fetch(`${baseUrl}/`);
    assert.equal(rootRes.status, 200);
    assert.equal(rootRes.headers.get('x-powered-by'), null);
    const rootJson = await rootRes.json();
    assert.equal(rootJson.firebaseProjectId, 'avenora-ai');

    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('cache-control'), 'no-store');
    const healthJson = await healthRes.json();
    assert.equal(healthJson.success, true);
    assert.equal(healthJson.firebase.projectId, 'avenora-ai');
  });

  it('permits configured production CORS origin and blocks unauthorized origins', async () => {
    const allowedPreflight = await fetch(`${baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://avenoraai3.vercel.app',
        'Access-Control-Request-Method': 'GET'
      }
    });
    assert.equal(allowedPreflight.status, 204);
    assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), 'https://avenoraai3.vercel.app');

    const blockedRes = await fetch(`${baseUrl}/api/health`, {
      headers: {
        Origin: 'https://unauthorized-origin.example'
      }
    });
    assert.equal(blockedRes.status, 403);
  });

  it('rejects unauthenticated requests across protected auth, user, event, and AI endpoints with 401', async () => {
    const protectedEndpoints = [
      ['GET', '/api/auth/me'],
      ['GET', '/api/users/me'],
      ['GET', '/api/events'],
      ['GET', '/api/events/ev-123/expenses'],
      ['GET', '/api/events/ev-123/tasks'],
      ['GET', '/api/events/ev-123/guests'],
      ['GET', '/api/events/ev-123/vendors'],
      ['GET', '/api/events/ev-123/timeline'],
      ['GET', '/api/events/ev-123/themes'],
      ['GET', '/api/events/ev-123/chats'],
      ['POST', '/api/ai/chat']
    ];

    for (const [method, endpoint] of protectedEndpoints) {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
        body: method === 'POST' ? JSON.stringify({ message: 'Hi' }) : undefined
      });
      assert.equal(res.status, 401, `Expected 401 for ${method} ${endpoint}`);
    }
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await fetch(`${baseUrl}/api/non-existent-route`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /not found/i);
  });
});

describe('Authenticated input validation boundaries (controlled test auth middleware)', () => {
  let server;
  let baseUrl;

  before(async () => {
    const testAuth = (req, _res, next) => {
      req.user = { uid: 'test_user_001', email: 'planner@example.com', name: 'Test Planner' };
      req.idToken = 'test-token';
      next();
    };
    const app = createApp({ authMiddleware: testAuth });
    ({ server, baseUrl } = await listenOnEphemeralPort(app));
  });

  after(() => {
    server?.close();
  });

  it('rejects invalid event dates on /api/ai/create-event-plan with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/ai/create-event-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: {
          name: 'Spring Gala',
          date: '2026-02-30',
          location: 'Austin'
        }
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /YYYY-MM-DD/i);
  });

  it('rejects empty messages on /api/ai/chat with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   \u0000  ' })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /empty/i);
  });

  it('rejects non-object blueprint payloads on /api/events/:id/blueprint with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/events/ev_test/blueprint`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blueprint: ['invalid-array'] })
    });
    assert.equal(res.status, 400);
  });

  it('rejects unsafe path segments on /api/events/:eventId with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/events/bad%20id%21`, {
      method: 'GET'
    });
    assert.equal(res.status, 400);
  });
});
