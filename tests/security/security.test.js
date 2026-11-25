import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeFirestorePath } from '../../backend/services/firestoreRestClient.js';

const ROOT = process.cwd();

function collectFiles(dir, extensions) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

describe('Security boundaries & secret isolation', () => {
  it('blocks path traversal, query injection, fragments, and empty segments in Firestore paths', () => {
    assert.equal(assertSafeFirestorePath('users/uid_123/events/ev_456'), 'users/uid_123/events/ev_456');

    const unsafePaths = [
      '',
      '../users/admin',
      'users/../secrets',
      'users/uid_1?fields=all',
      'users/uid_1#fragment',
      'users//events',
      'users/bad$id/events'
    ];
    for (const unsafePath of unsafePaths) {
      assert.throws(() => assertSafeFirestorePath(unsafePath), { statusCode: 400 });
    }
  });

  it('never leaks backend secrets, private keys, or Gemini API keys into frontend files', () => {
    const frontendFiles = collectFiles(path.join(ROOT, 'frontend'), ['.js', '.html', '.mjs']);
    const forbiddenPatterns = [
      /GEMINI_API_KEY/,
      /GOOGLE_CLIENT_SECRET/,
      /FIREBASE_SERVICE_ACCOUNT_KEY/,
      /BEGIN\s+PRIVATE\s+KEY/,
      /AIzaSy[0-9A-Za-z_-]{20,}/
    ];

    for (const file of frontendFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(content),
          false,
          `Forbidden secret pattern ${pattern} found in ${path.relative(ROOT, file)}`
        );
      }
    }
  });

  it('enforces Firebase project avenora-ai across frontend config, backend admin config, and firestore.rules', () => {
    const feConfig = fs.readFileSync(path.join(ROOT, 'frontend/config/firebaseConfig.js'), 'utf8');
    const beAdmin = fs.readFileSync(path.join(ROOT, 'backend/config/firebaseAdmin.js'), 'utf8');
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

    assert.match(feConfig, /avenora-ai/);
    assert.match(beAdmin, /avenora-ai/);
    assert.match(rules, /request\.auth\s*!=\s*null/);
    assert.match(rules, /request\.auth\.uid\s*==\s*userId/);
  });
});
