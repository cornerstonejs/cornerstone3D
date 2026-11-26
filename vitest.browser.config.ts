import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  // The compute worker of the tools imports this module, which no test file
  // imports: Vite would find it only when the worker loads, optimize it then
  // and reload the page, and the worker of a cold run never answered.
  optimizeDeps: {
    include: ['@kitware/vtk.js/Filters/General/ImageMarchingSquares'],
  },
  resolve: {
    alias: {
      '@cornerstonejs/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@cornerstonejs/tools': path.resolve(__dirname, 'packages/tools/src/index.ts'),
    },
  },
  test: {
    include: ['tests/vitest-browser/**/*.browser.test.ts'],
    fileParallelism: false,
    browser: {
      enabled: true,
      expect: {
        toMatchScreenshot: {
          resolveScreenshotPath: ({ arg, ext }) =>
            path.join('packages/core/test/groundTruth', `${arg}${ext}`),
        },
      },
      provider: playwright({
        contextOptions: {
          deviceScaleFactor: 1,
        },
      }),
      headless: true,
      viewport: {
        width: 500,
        height: 500,
      },
      instances: [{ browser: 'chromium' }],
    },
  },
});
