import { expect, test, type Page } from '@playwright/test';
import {
  createExampleUrl,
  expectGenericViewportRuntime,
  getVisibleViewportCanvas,
} from '../utils/index';

const EXAMPLE = 'genericWebGPUPetMIP';
const ENGINE_ID = 'myRenderingEngine';
const VIEWPORT_ID = 'PT_MIP_PLANAR';
const DATA_ID = 'webgpu-pet-mip:planar';
const VOLUME_ID = 'cornerstoneStreamingImageVolume:PT_VOLUME_ID';
const CAPABILITIES_STORAGE_KEY = 'cornerstone3D.renderingCapabilities';

type CornerstoneWindow = typeof window & {
  cornerstone?: {
    cache?: {
      getVolume?: (volumeId: string) => {
        dataType?: string;
        isPreScaled?: boolean;
      };
      getVolumes?: () => unknown[];
    };
  };
};

async function installIOSLikeFloatProfile(page: Page): Promise<void> {
  await page.addInitScript(
    ({ storageKey }) => {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');

        if (!gl) {
          return;
        }

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = debugInfo
          ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER);

        localStorage.setItem(
          storageKey,
          JSON.stringify({
            probeVersion: 1,
            renderer: typeof renderer === 'string' ? renderer : '',
            webgl2: true,
            formats: {
              norm16: true,
              norm16Linear: true,
              float: true,
              floatLinear: false,
              halfFloat: true,
              halfFloatLinear: true,
            },
          })
        );

        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        // The script also runs in transient frames where localStorage may be
        // unavailable. The top-level example origin is the profile that matters.
      }
    },
    { storageKey: CAPABILITIES_STORAGE_KEY }
  );
}

async function navigateToExample(page: Page): Promise<void> {
  await installIOSLikeFloatProfile(page);

  const url = createExampleUrl(
    process.env.PLAYWRIGHT_EXAMPLE_PATH || `${EXAMPLE}.html`
  );
  url.searchParams.set('renderBackend', 'gpu');

  await page.goto(url.toString());
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#webgpu-backend-debug')).toContainText(
    'renderMode=vtkVolumeSlice',
    { timeout: 60000 }
  );
}

test.describe('PET MIP float scaling', () => {
  test('pre-scales and renders exactly one PET viewport with the iOS capability profile', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await navigateToExample(page);

    await expect(page.locator('[data-viewport-uid]')).toHaveCount(1);
    await expectGenericViewportRuntime(page, [
      {
        renderingEngineId: ENGINE_ID,
        viewportId: VIEWPORT_ID,
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: { [DATA_ID]: 'vtkVolumeSlice' },
      },
    ]);

    const volumeState = await page.evaluate(
      ({ volumeId }) => {
        const cache = (window as CornerstoneWindow).cornerstone?.cache;
        const volume = cache?.getVolume?.(volumeId);

        return {
          dataType: volume?.dataType,
          isPreScaled: volume?.isPreScaled,
          volumeCount: cache?.getVolumes?.().length,
        };
      },
      { volumeId: VOLUME_ID }
    );

    expect(volumeState).toEqual({
      dataType: 'Float32Array',
      isPreScaled: true,
      volumeCount: 1,
    });

    const canvas = getVisibleViewportCanvas(page);
    await expect(canvas).toBeVisible();

    const pixelStats = await canvas.evaluate((source: HTMLCanvasElement) => {
      const output = document.createElement('canvas');
      output.width = source.width;
      output.height = source.height;
      const context = output.getContext('2d', { willReadFrequently: true });

      if (!context || !source.width || !source.height) {
        return null;
      }

      context.drawImage(source, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        output.width,
        output.height
      ).data;
      let minimumLuminance = 255;
      let maximumLuminance = 0;
      const luminanceBuckets = new Set<number>();

      for (let offset = 0; offset < pixels.length; offset += 16) {
        const luminance = Math.round(
          pixels[offset] * 0.2126 +
            pixels[offset + 1] * 0.7152 +
            pixels[offset + 2] * 0.0722
        );
        minimumLuminance = Math.min(minimumLuminance, luminance);
        maximumLuminance = Math.max(maximumLuminance, luminance);
        luminanceBuckets.add(Math.floor(luminance / 8));
      }

      return {
        luminanceRange: maximumLuminance - minimumLuminance,
        luminanceBucketCount: luminanceBuckets.size,
      };
    });

    expect(pixelStats).not.toBeNull();
    expect(pixelStats?.luminanceRange).toBeGreaterThan(100);
    expect(pixelStats?.luminanceBucketCount).toBeGreaterThan(12);
    await expect(
      page.locator('#webpack-dev-server-client-overlay')
    ).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
