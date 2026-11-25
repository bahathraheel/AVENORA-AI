import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const ROOT = process.cwd();
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const HTML_PAGES = fs
  .readdirSync(FRONTEND_DIR)
  .filter((name) => name.endsWith('.html'))
  .sort();

const AUTH_PAGES = new Set(['login.html', 'signup.html']);
const PUBLIC_PAGES = new Set(['index.html', 'login.html', 'signup.html']);

describe('Frontend HTML semantics & accessibility audit', () => {
  it('verifies every HTML page has lang="en", title, skip link, main landmark, and accessible images/inputs', () => {
    assert.ok(HTML_PAGES.length >= 13, 'Expected all 13 frontend HTML entry points');

    for (const file of HTML_PAGES) {
      const html = fs.readFileSync(path.join(FRONTEND_DIR, file), 'utf8');
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      assert.equal(doc.documentElement.getAttribute('lang'), 'en', `${file} missing lang="en"`);
      assert.ok(doc.title && doc.title.trim().length > 0, `${file} missing non-empty <title>`);

      const skipLink = doc.querySelector('a.skip-link[href="#main-content"]');
      assert.ok(skipLink, `${file} missing .skip-link pointing to #main-content`);

      const mainEl = doc.querySelector('main#main-content');
      assert.ok(mainEl, `${file} missing <main id="main-content"> landmark`);

      doc.querySelectorAll('img').forEach((img) => {
        const alt = img.getAttribute('alt');
        assert.ok(alt && alt.trim().length > 0, `${file} has image without descriptive alt text`);
      });

      doc.querySelectorAll('input, select, textarea').forEach((ctrl) => {
        if (ctrl.getAttribute('type') === 'hidden') return;
        const id = ctrl.getAttribute('id');
        const hasLabel = id ? Boolean(doc.querySelector(`label[for="${id}"]`)) : false;
        const hasAria = Boolean(ctrl.getAttribute('aria-label') || ctrl.getAttribute('aria-labelledby'));
        assert.ok(hasLabel || hasAria, `${file} has form control (${id || ctrl.tagName}) without label or aria-label`);
      });

      if (AUTH_PAGES.has(file)) {
        const banner = doc.getElementById('auth-status-banner');
        assert.ok(banner, `${file} missing #auth-status-banner`);
        assert.equal(banner.getAttribute('aria-live'), 'polite', `${file} #auth-status-banner should announce politely`);
      }

      if (!PUBLIC_PAGES.has(file)) {
        const sidebar = doc.getElementById('workspace-sidebar');
        assert.ok(sidebar, `${file} missing #workspace-sidebar`);
        assert.ok(sidebar.getAttribute('aria-label'), `${file} #workspace-sidebar missing aria-label`);
      }
    }
  });

  it('verifies interactive modal modules wire Escape and focus restoration helpers', () => {
    const modalUsers = ['checklist.js', 'budget.js', 'guests.js', 'vendors.js', 'timeline.js', 'events.js'];
    for (const file of modalUsers) {
      const src = fs.readFileSync(path.join(FRONTEND_DIR, 'js', file), 'utf8');
      assert.match(src, /openModalElement/, `${file} should use accessible openModalElement`);
      assert.match(src, /closeModalElement/, `${file} should use accessible closeModalElement`);
    }
  });
});
