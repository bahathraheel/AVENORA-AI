import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_BLUEPRINT_KEYS,
  clampInt,
  sanitizeBlueprint,
  sanitizeEnum,
  sanitizeHexColor,
  sanitizeId,
  sanitizeIsoDate,
  sanitizeMoodboardSpecs,
  sanitizePositiveNumber,
  sanitizeText,
  serializeFirestoreValue,
  stripPrototypeKeys
} from '../../backend/utils/sanitize.js';
import {
  extractGeminiErrorInfo,
  normalizeGeminiError,
  parseJsonSafe,
  shouldFallbackModel
} from '../../backend/services/geminiService.js';

describe('Backend sanitization & validation helpers', () => {
  it('sanitizeText strips ASCII control characters, trims, and enforces maxLen', () => {
    const dirty = '  \u0000Hello\u0007 World\u001F!  ';
    assert.equal(sanitizeText(dirty, 50), 'Hello World!');
    assert.equal(sanitizeText('abcdef', 3), 'abc');
    assert.equal(sanitizeText(12345, 10), '');
  });

  it('sanitizePositiveNumber clamps negatives and non-finite inputs', () => {
    assert.equal(sanitizePositiveNumber('2500.5', 0), 2500.5);
    assert.equal(sanitizePositiveNumber(-100, 10), 10);
    assert.equal(sanitizePositiveNumber(Number.NaN, 42), 42);
    assert.equal(sanitizePositiveNumber(99999999999, 0, 5000), 5000);
    assert.equal(sanitizePositiveNumber('', 77), 77);
  });

  it('clampInt rounds and clamps integers safely', () => {
    assert.equal(clampInt('12.6', 1, 100, 10), 13);
    assert.equal(clampInt('-5', 1, 100, 10), 1);
    assert.equal(clampInt('999', 1, 100, 10), 100);
    assert.equal(clampInt('invalid', 1, 100, 10), 10);
  });

  it('sanitizeEnum returns allowed value or fallback', () => {
    assert.equal(sanitizeEnum('paid', ['pending', 'paid'], 'pending'), 'paid');
    assert.equal(sanitizeEnum('unknown', ['pending', 'paid'], 'pending'), 'pending');
  });

  it('sanitizeId permits safe Firestore IDs and rejects path metacharacters', () => {
    assert.equal(sanitizeId('event_2026-01'), 'event_2026-01');
    assert.equal(sanitizeId('../users/admin'), '');
    assert.equal(sanitizeId('bad id with space'), '');
    assert.equal(sanitizeId('doc/subdoc'), '');
  });

  it('sanitizeIsoDate enforces real calendar YYYY-MM-DD dates', () => {
    assert.equal(sanitizeIsoDate('2024-02-29'), '2024-02-29');
    assert.equal(sanitizeIsoDate('2026-06-15'), '2026-06-15');
    assert.equal(sanitizeIsoDate('2026-02-30'), '');
    assert.equal(sanitizeIsoDate('2025-02-29'), '');
    assert.equal(sanitizeIsoDate('2026/06/15'), '');
    assert.equal(sanitizeIsoDate('not-a-date'), '');
  });

  it('sanitizeHexColor accepts only strict #RRGGBB values', () => {
    assert.equal(sanitizeHexColor('#a1b2c3'), '#A1B2C3');
    assert.equal(sanitizeHexColor('red; background:url(x)', '#14251C'), '#14251C');
    assert.equal(sanitizeHexColor('#FFF', '#14251C'), '#14251C');
  });

  it('stripPrototypeKeys removes __proto__, constructor, and prototype keys recursively', () => {
    const payload = JSON.parse('{"safe":"ok","__proto__":{"polluted":true},"nested":{"constructor":{"bad":1},"prototype":"x","val":7}}');
    const clean = stripPrototypeKeys(payload);
    assert.equal(clean.safe, 'ok');
    assert.equal(clean.nested.val, 7);
    assert.equal(Object.hasOwn(clean, '__proto__'), false);
    assert.equal(Object.hasOwn(clean.nested, 'constructor'), false);
    assert.equal(Object.hasOwn(clean.nested, 'prototype'), false);
    assert.equal(({}).polluted, undefined);
  });

  it('sanitizeBlueprint filters unknown keys and enforces payload type & size limits', () => {
    const input = {
      overview: 'An autumn conservatory celebration.',
      unexpectedKey: 'drop me',
      nextSteps: ['Book venue', 'Send save-the-dates']
    };
    const out = sanitizeBlueprint(input);
    assert.equal(out.overview, 'An autumn conservatory celebration.');
    assert.deepEqual(out.nextSteps, ['Book venue', 'Send save-the-dates']);
    assert.equal('unexpectedKey' in out, false);
    assert.ok(ALLOWED_BLUEPRINT_KEYS.includes('budgetAllocation'));

    assert.throws(() => sanitizeBlueprint(null), { statusCode: 400 });
    assert.throws(() => sanitizeBlueprint(['bad']), { statusCode: 400 });
    assert.throws(
      () =>
        sanitizeBlueprint({
          overview: 'x'.repeat(5000),
          nextSteps: Array.from({ length: 60 }, (_, i) => `${i}:${'y'.repeat(3000)}`)
        }),
      { statusCode: 400 }
    );
  });

  it('sanitizeMoodboardSpecs sanitizes palette roles and panel copy', () => {
    const specs = sanitizeMoodboardSpecs({
      colorRoles: [
        { hex: '#c7a455', name: 'Gilded Brass', usage: 'Accent candlesticks' },
        { hex: 'javascript:alert(1)', name: 'Bad Color', usage: 'Fallback' }
      ],
      moodboardPanels: [{ zone: 'Tablescape', visualBrief: 'Linen & Taper Candles', keyElements: 'Ivory Silk' }]
    });
    assert.equal(specs.colorRoles[0].hex, '#C7A455');
    assert.equal(specs.colorRoles[1].hex, '#14251C');
    assert.equal(specs.moodboardPanels[0].zone, 'Tablescape');
  });

  it('serializeFirestoreValue converts timestamps cleanly and ignores unsafe keys', () => {
    const serialized = serializeFirestoreValue({
      createdAt: { _seconds: 1700000000, _nanoseconds: 500 },
      nested: { items: [{ title: 'Task' }] }
    });
    assert.equal(serialized.createdAt.seconds, 1700000000);
    assert.ok(serialized.createdAt.iso.startsWith('2023-11-14'));
    assert.equal(serialized.nested.items[0].title, 'Task');
  });
});

describe('Gemini service normalization & parsing helpers', () => {
  it('parseJsonSafe strips markdown code fences and returns fallback on invalid JSON', () => {
    assert.deepEqual(parseJsonSafe('```json\n{"ok":true,"count":3}\n```', null), { ok: true, count: 3 });
    assert.deepEqual(parseJsonSafe('invalid-json', { fallback: true }), { fallback: true });
  });

  it('extractGeminiErrorInfo parses structured JSON error payloads cleanly', () => {
    const err = new Error(
      JSON.stringify({
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          message: 'Quota exceeded. Please retry in 14s.'
        }
      })
    );
    const info = extractGeminiErrorInfo(err);
    assert.equal(info.status, 429);
    assert.equal(info.apiStatus, 'RESOURCE_EXHAUSTED');

    const normalized = normalizeGeminiError(err);
    assert.equal(normalized.statusCode, 429);
    assert.equal(normalized.code, 'RESOURCE_EXHAUSTED');
    assert.match(normalized.message, /quota exceeded/i);
    assert.equal(shouldFallbackModel(err), true);
  });

  it('normalizeGeminiError maps high demand 503 and invalid key 403 cleanly', () => {
    const busyErr = new Error('This model is currently experiencing high demand.');
    busyErr.status = 503;
    const busyNormalized = normalizeGeminiError(busyErr);
    assert.equal(busyNormalized.statusCode, 503);
    assert.equal(shouldFallbackModel(busyErr), true);

    const authErr = new Error('API_KEY_INVALID');
    authErr.status = 403;
    const authNormalized = normalizeGeminiError(authErr);
    assert.equal(authNormalized.statusCode, 403);
    assert.equal(shouldFallbackModel(authErr), false);
  });
});
