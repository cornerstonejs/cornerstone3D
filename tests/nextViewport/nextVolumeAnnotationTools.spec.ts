import { expect, test } from '@playwright/test';
import {
  createExampleUrl,
  checkForScreenshot,
  expectViewportNextRuntime,
  getVisibleViewportCanvas,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'nextVolumeAnnotationTools';
const SETTLE_MS = 5000;
const EXAMPLE_BOOTSTRAP_TIMEOUT_MS = 30000;

function navigateToExample(params?: Record<string, string>) {
  return async ({ page }) => {
    const url = createExampleUrl(EXAMPLE + '.html');

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    await page.goto(url.toString());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('div#content', {
      timeout: EXAMPLE_BOOTSTRAP_TIMEOUT_MS,
    });
    await page.waitForLoadState('networkidle', {
      timeout: EXAMPLE_BOOTSTRAP_TIMEOUT_MS,
    });
    await page.waitForTimeout(SETTLE_MS);
  };
}

async function drawLengthMeasurement(page, locator) {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error('Canvas element is not visible');
  }

  const startX = box.x + box.width * 0.3;
  const startY = box.y + box.height * 0.3;
  const endX = box.x + box.width * 0.7;
  const endY = box.y + box.height * 0.7;

  await page.mouse.click(startX, startY);
  await page.waitForTimeout(200);
  await page.mouse.click(endX, endY);
  await page.waitForTimeout(500);
}

async function expectRenderedLengthAnnotation(page, viewportIndex: number) {
  const viewport = page.locator('[data-viewport-uid]').nth(viewportIndex);
  const renderedAnnotationNodes = viewport.locator(
    'svg.svg-layer line[data-id$="-line"]'
  );

  await expect
    .poll(async () => renderedAnnotationNodes.count(), {
      message: `expected viewport ${viewportIndex} to render annotation SVG nodes`,
    })
    .toBeGreaterThan(0);
}

async function drawAndExpectLengthAnnotation(page, viewportIndex: number) {
  const locator = getVisibleViewportCanvas(page, viewportIndex);

  await drawLengthMeasurement(page, locator);
  await expectRenderedLengthAnnotation(page, viewportIndex);
}

/** Scroll the mouse wheel over the canvas center. */
async function scrollSlices(page, locator, ticks: number) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Canvas element is not visible');
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);

  for (let i = 0; i < Math.abs(ticks); i++) {
    await page.mouse.wheel(0, ticks > 0 ? 120 : -120);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);
}

/** Right-click drag (zoom) from an off-center point. */
async function zoomOffCenter(
  page,
  locator,
  opts: { startFrac: [number, number]; dy: number }
) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Canvas element is not visible');
  }
  const sx = box.x + box.width * opts.startFrac[0];
  const sy = box.y + box.height * opts.startFrac[1];
  await page.mouse.move(sx, sy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(sx, sy + opts.dy, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(500);
}

/** Middle-click drag (pan). */
async function panViewport(page, locator, dx: number, dy: number) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Canvas element is not visible');
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(500);
}

/**
 * Applies different scroll, zoom, and pan to each of the three viewports
 * then screenshots all three.
 */
async function manipulateAndScreenshotAll(
  page,
  paths: { axial: string; sagittal: string; coronal: string }
) {
  const axial = getVisibleViewportCanvas(page, 0);
  const sagittal = getVisibleViewportCanvas(page, 1);
  const coronal = getVisibleViewportCanvas(page, 2);

  // Axial: scroll 3 slices, zoom in off-center top-left, pan right
  await scrollSlices(page, axial, 3);
  await zoomOffCenter(page, axial, { startFrac: [0.3, 0.3], dy: -60 });
  await panViewport(page, axial, 40, 20);

  // Sagittal: scroll 5 slices, zoom in off-center bottom-right, pan left-up
  await scrollSlices(page, sagittal, 5);
  await zoomOffCenter(page, sagittal, { startFrac: [0.7, 0.7], dy: -40 });
  await panViewport(page, sagittal, -30, -25);

  // Coronal: scroll 2 slices backward, zoom out center-right, pan down
  await scrollSlices(page, coronal, -2);
  await zoomOffCenter(page, coronal, { startFrac: [0.6, 0.4], dy: 50 });
  await panViewport(page, coronal, 10, 35);

  await checkForScreenshot(page, axial, paths.axial);
  await checkForScreenshot(page, sagittal, paths.sagittal);
  await checkForScreenshot(page, coronal, paths.coronal);
}

// ---------------------------------------------------------------------------
// Length measurement + sagittal tests
// ---------------------------------------------------------------------------

test.describe('Volume Annotation - Next (GPU)', () => {
  test.beforeEach(navigateToExample());

  test('should use PlanarViewport GPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_AXIAL_STACK',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'volume-annotation-tools-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL_STACK',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'volume-annotation-tools-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_OBLIQUE_STACK',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'volume-annotation-tools-next:source': 'vtkVolumeSlice',
        },
      },
    ]);
  });

  test('should draw a length measurement (next GPU)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page, 0);
    await drawLengthMeasurement(page, locator);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.volumeAnnotationNext.length
    );
  });

  test('should draw a length measurement on sagittal (next GPU)', async ({
    page,
  }) => {
    const sagittal = getVisibleViewportCanvas(page, 1);
    await drawLengthMeasurement(page, sagittal);
    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.volumeAnnotationNext.sagittal
    );
  });

  test('should render length measurements on sagittal and oblique planes (next GPU)', async ({
    page,
  }) => {
    await drawAndExpectLengthAnnotation(page, 1);
    await drawAndExpectLengthAnnotation(page, 2);
  });

  test('should scroll, zoom, and pan all viewports (next GPU)', async ({
    page,
  }) => {
    await manipulateAndScreenshotAll(page, {
      axial: screenShotPaths.volumeAnnotationNext.axialManip,
      sagittal: screenShotPaths.volumeAnnotationNext.sagittalManip,
      coronal: screenShotPaths.volumeAnnotationNext.coronalManip,
    });
  });
});

test.describe('Volume Annotation - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ cpu: 'true' }));

  test('should use PlanarViewport CPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_AXIAL_STACK',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'volume-annotation-tools-next:source': 'cpuVolume',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL_STACK',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'volume-annotation-tools-next:source': 'cpuVolume',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_OBLIQUE_STACK',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'volume-annotation-tools-next:source': 'cpuVolume',
        },
      },
    ]);
  });

  test('should draw a length measurement (next CPU)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page, 0);
    await drawLengthMeasurement(page, locator);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.volumeAnnotationNext.cpuLength
    );
  });

  test('should draw a length measurement on sagittal (next CPU)', async ({
    page,
  }) => {
    const sagittal = getVisibleViewportCanvas(page, 1);
    await drawLengthMeasurement(page, sagittal);
    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.volumeAnnotationNext.cpuSagittal
    );
  });

  test('should render length measurements on sagittal and oblique planes (next CPU)', async ({
    page,
  }) => {
    await drawAndExpectLengthAnnotation(page, 1);
    await drawAndExpectLengthAnnotation(page, 2);
  });

  test('should scroll, zoom, and pan all viewports (next CPU)', async ({
    page,
  }) => {
    await manipulateAndScreenshotAll(page, {
      axial: screenShotPaths.volumeAnnotationNext.cpuAxialManip,
      sagittal: screenShotPaths.volumeAnnotationNext.cpuSagittalManip,
      coronal: screenShotPaths.volumeAnnotationNext.cpuCoronalManip,
    });
  });
});
