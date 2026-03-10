import { test, expect } from 'playwright-test-coverage';
import { visitExample } from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'planarArchitecture');
});

test.describe('Planar Architecture V2', async () => {
  test('should render an image that is not black', async ({ page }) => {
    const element = page.locator('#cornerstone-element');
    await expect(element).toBeVisible();

    // Wait for the image to actually render by checking the cache has loaded
    // images via the console
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');

    // Grab pixel data from the visible canvas to verify it's not all black
    const hasNonBlackPixels = await page.evaluate(() => {
      const container = document.querySelector('#cornerstone-element');

      if (!container) {
        return false;
      }

      // Check all canvas elements (cpu canvas or vtk canvas)
      const canvases = container.querySelectorAll('canvas');

      for (const canvas of canvases) {
        // Skip hidden canvases
        if (canvas.style.display === 'none' || canvas.offsetParent === null) {
          continue;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
          // Could be a WebGL canvas - check via readPixels
          const gl =
            canvas.getContext('webgl2') || canvas.getContext('webgl');

          if (gl) {
            const width = canvas.width;
            const height = canvas.height;
            const pixels = new Uint8Array(width * height * 4);

            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

            let nonBlackCount = 0;

            for (let i = 0; i < pixels.length; i += 4) {
              if (pixels[i] > 5 || pixels[i + 1] > 5 || pixels[i + 2] > 5) {
                nonBlackCount++;
              }
            }

            // At least 1% of pixels should be non-black
            if (nonBlackCount > (width * height) * 0.01) {
              return true;
            }
          }

          continue;
        }

        const width = canvas.width;
        const height = canvas.height;

        if (width === 0 || height === 0) {
          continue;
        }

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        let nonBlackCount = 0;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 5 || data[i + 1] > 5 || data[i + 2] > 5) {
            nonBlackCount++;
          }
        }

        // At least 1% of pixels should be non-black
        if (nonBlackCount > (width * height) * 0.01) {
          return true;
        }
      }

      return false;
    });

    expect(hasNonBlackPixels).toBe(true);
  });

  test('should have loaded data in the cache', async ({ page }) => {
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');

    const cacheSize = await page.evaluate(() => {
      const cs = (window as any).cornerstone;

      if (!cs?.cache) {
        return -1;
      }

      return cs.cache.getCacheSize();
    });

    expect(cacheSize).toBeGreaterThan(0);
  });
});
