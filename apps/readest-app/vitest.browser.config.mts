import { resolve } from 'node:path';
import tsconfigPaths from 'vite-tsconfig-paths';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { loadEnvFile } from './vitest.env.mts';

// Load .env and .env.web so browser tests have the same env as the web app.
const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.web'), CI: process.env['CI'] ?? '' };

const MINDMAP_PERF_TEST = 'src/__tests__/app/reader/components/mindmap/mindmapCanvas.browser.test.tsx';
const PLAY_SURFACE_TEST = 'src/__tests__/services/margins/play/surface.browser.test.ts';
const MARGINS_PERF_TEST = 'src/__tests__/services/margins/acceptance.browser.test.ts';
const PERF_TESTS = [MINDMAP_PERF_TEST, MARGINS_PERF_TEST];

const contextOptions = {
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
};

// Matches both wordings Chromium has used for the benign resize notice:
// "ResizeObserver loop limit exceeded" (older) and "ResizeObserver loop
// completed with undelivered notifications." (current).
const RESIZE_OBSERVER_NOTICE = /ResizeObserver loop/;

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  define: {
    'process.env': JSON.stringify(env),
  },
  resolve: {
    conditions: ['development'],
    alias: {
      // The @pdfjs alias from tsconfig only resolves within the app's own
      // source files.  foliate-js/pdf.js lives outside that scope, so Vite
      // needs an explicit alias to reach pdfjs-dist. It points at the real
      // package rather than a copy under `public/`: a module the bundler
      // imports must not be published too, or Tauri embeds it twice (#6368).
      '@pdfjs': resolve(import.meta.dirname, '../../packages/foliate-js/node_modules/pdfjs-dist/legacy/build'),
    },
  },
  optimizeDeps: {
    include: [
      '@supabase/supabase-js',
      '@tauri-apps/plugin-fs',
      '@tauri-apps/plugin-http',
      '@tauri-apps/api/path',
      '@tauri-apps/api/core',
      '@testing-library/react',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      '@radix-ui/react-tooltip',
      'react-virtuoso',
      'react-icons/lia',
      'next/image',
      '@zip.js/zip.js',
      'franc-min',
      'iso-639-2',
      'iso-639-3',
      'js-md5',
      'jwt-decode',
      'uuid',
    ],
    exclude: [
      '@pdfjs/pdf.min.mjs',
      '@readest/turso-database-wasm',
      '@readest/turso-database-wasm-common',
      '@readest/turso-database-common',
    ],
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  test: {
    onConsoleLog(log, type) {
      if (type === 'stdout') return false;
      // Chromium reports the benign "ResizeObserver loop ..." notice as an
      // ErrorEvent carrying only `message` and no `error`. @vitest/browser's
      // error catcher console.errors exactly that shape (see its
      // error-catcher.js: `console.error(e.message ? new Error(e.message) : e)`),
      // so it cannot be filtered with `onUnhandledError` — it never reaches
      // that hook. Paginated layouts fire it constantly and it buried the CI
      // log under ~1.1k copies. The notice only means observations were
      // deferred to the next frame; nothing is dropped and nothing is
      // actionable.
      if (RESIZE_OBSERVER_NOTICE.test(log)) return false;
    },
    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: false,
      provider: playwright({ contextOptions }),
      expect: {
        toMatchScreenshot: {
          comparatorName: 'pixelmatch',
          comparatorOptions: {
            threshold: 0.1,
            allowedMismatchedPixelRatio: 0.02,
          },
          // Strip platform from the path so one baseline works on macOS and Linux.
          // Must be absolute: vitest runs the path through Vite's `server.fs`
          // access check before writing, and a relative path is always denied,
          // which surfaces as "Couldn't write file to fs" when generating
          // baselines (reads still worked because they resolve against cwd).
          resolveScreenshotPath: ({ arg, browserName, ext, root, testFileDirectory, testFileName }) =>
            resolve(root, testFileDirectory, '__screenshots__', testFileName, `${arg}-${browserName}${ext}`),
        },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'chromium',
          include: ['src/**/*.browser.test.ts', 'src/**/*.browser.test.tsx'],
          exclude: [PLAY_SURFACE_TEST, ...PERF_TESTS],
          browser: { instances: [{ browser: 'chromium' }] },
        },
      },
      {
        extends: true,
        test: {
          name: 'chromium-perf',
          include: PERF_TESTS,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
          browser: { instances: [{ browser: 'chromium' }] },
        },
      },
      {
        extends: true,
        test: {
          name: 'chromium-play-surface',
          include: [PLAY_SURFACE_TEST],
          sequence: { groupOrder: 3 },
          browser: { instances: [{ browser: 'chromium' }] },
        },
      },
      {
        extends: true,
        test: {
          name: 'chromium-one-raster-thread',
          include: [MINDMAP_PERF_TEST],
          sequence: { groupOrder: 2 },
          browser: {
            provider: playwright({
              contextOptions,
              launchOptions: { args: ['--num-raster-threads=1'] },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
