import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlPages = [
  'index.html',
  'login.html',
  'signup.html',
  'dashboard.html',
  'event.html',
  'budget.html',
  'checklist.html',
  'guests.html',
  'vendors.html',
  'timeline.html',
  'theme-studio.html',
  'copilot.html',
  'settings.html'
];

const input = Object.fromEntries(
  htmlPages.map((page) => [page.replace('.html', ''), path.resolve(__dirname, page)])
);

export default defineConfig({
  root: __dirname,
  envDir: __dirname,
  plugins: [
    {
      name: 'copy-frontend-static-assets',
      apply: 'build',
      closeBundle(error) {
        if (error) return;
        const distDir = path.resolve(__dirname, 'dist');
        const srcAssets = path.resolve(__dirname, 'assets');
        const distAssets = path.resolve(distDir, 'assets');
        if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
          fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
        }
      }
    }
  ],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input
    }
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {}
  }
});
