import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTimelineConflicts,
  escapeHtml,
  formatCurrency,
  formatDate,
  getDaysUntil,
  sanitizeHexColor
} from '../../frontend/js/utils.js';

describe('Frontend shared formatting & security utilities', () => {
  it('escapeHtml encodes dangerous HTML characters to prevent script injection', () => {
    const xss = `<img src=x onerror="alert('xss')" & 'test'>`;
    const escaped = escapeHtml(xss);
    assert.equal(escaped.includes('<'), false);
    assert.equal(escaped.includes('>'), false);
    assert.equal(escaped.includes('"'), false);
    assert.ok(escaped.includes('&lt;img'));
    assert.ok(escaped.includes('&amp;'));
    assert.equal(escapeHtml(null), '');
  });

  it('sanitizeHexColor blocks CSS style injection payloads', () => {
    assert.equal(sanitizeHexColor('#5F8B70'), '#5F8B70');
    assert.equal(sanitizeHexColor('#f5f3ed'), '#F5F3ED');
    assert.equal(sanitizeHexColor('#14251C; background:url(https://evil.example)'), '#14251C');
    assert.equal(sanitizeHexColor('rgb(0,0,0)', '#223A2E'), '#223A2E');
  });

  it('formatCurrency formats USD and INR cleanly and handles unknown currency codes safely', () => {
    assert.match(formatCurrency(15000, 'USD'), /\$15,000/);
    assert.match(formatCurrency(250000, 'INR'), /2,50,000/);
    assert.equal(formatCurrency(500, 'INVALID_CODE'), 'INVALID_CODE 500');
  });

  it('formatDate and getDaysUntil handle valid dates and TBD edge cases', () => {
    assert.equal(formatDate(''), 'Date TBD');
    assert.match(formatDate('2026-10-18'), /Oct 18, 2026/);

    const ref = new Date(2026, 9, 10);
    assert.equal(getDaysUntil('2026-10-15', ref), 5);
    assert.equal(getDaysUntil('2026-10-08', ref), -2);
    assert.equal(getDaysUntil('bad-date', ref), null);
  });

  it('detectTimelineConflicts flags identical start times and bidirectional overlaps', () => {
    const items = [
      { id: 'slot-1', timeSlot: '16:00', endTime: '17:30' },
      { id: 'slot-2', timeSlot: '17:00', endTime: '18:00' },
      { id: 'slot-3', timeSlot: '18:30', endTime: '19:30' },
      { id: 'slot-4', timeSlot: '18:00', endTime: '19:00' }
    ];
    const conflicts = detectTimelineConflicts(items);
    assert.equal(conflicts.has('slot-1'), true);
    assert.equal(conflicts.has('slot-2'), true);
    assert.equal(conflicts.has('slot-3'), true);
    assert.equal(conflicts.has('slot-4'), true);

    const clean = detectTimelineConflicts([
      { id: 'a', timeSlot: '16:00', endTime: '17:00' },
      { id: 'b', timeSlot: '17:00', endTime: '18:00' }
    ]);
    assert.equal(clean.size, 0);
  });
});
