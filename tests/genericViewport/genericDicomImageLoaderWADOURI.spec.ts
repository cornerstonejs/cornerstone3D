import type { Page } from '@playwright/test';
import { test } from 'playwright-test-coverage';
import {
  checkForCanvasSnapshot,
  createExampleUrl,
  screenShotPaths,
  waitForImageRendered,
} from '../utils/index';
import { dicomDimensions } from '../../packages/dicomImageLoader/examples/dicomImageLoaderWADOURI/dicomDimensions';

// This spec exists so `scripts/run-playright.sh --next` picks up the WADOURI
// scenario under the GenericViewport code path. It re-runs the same 45 image
// comparisons as the legacy spec but loads each example with `?type=next` so
// the GenericViewport implementation is exercised end-to-end.
//
// The 45 baselines are dcm2jpg-derived (DICOM ground truth) and live under
// `tests/screenshots/<project>/dicomImageLoaderWADOURI.spec.ts/`. We point at
// them via a `../../` prefix so checkForCanvasSnapshot's shared-baseline path
// resolves to the legacy folder -- no duplicated PNGs.
const EXAMPLE = 'dicomImageLoaderWADOURI';
const LEGACY_BASELINE_PREFIX = '../../dicomImageLoaderWADOURI.spec.ts/';

function getExpectedWadoImageId(imagePath: string) {
  if (imagePath.startsWith('TG_18')) {
    return `wadouri:https://raw.githubusercontent.com/OHIF/viewer-testdata/master/dcm/tg18/${imagePath.substring(6)}`;
  }

  return `wadouri:https://raw.githubusercontent.com/cornerstonejs/cornerstone3D/main/packages/dicomImageLoader/testImages/${imagePath}`;
}

async function ensureViewportFitsImage(page: Page, imagePath: string) {
  const dim = dicomDimensions[imagePath];
  if (!dim) {
    return;
  }

  const viewport = page.viewportSize();
  const needsWidth = dim.columns + 64;
  const needsHeight = dim.rows + 200;

  if (
    !viewport ||
    viewport.width < needsWidth ||
    viewport.height < needsHeight
  ) {
    await page.setViewportSize({
      width: Math.max(viewport?.width ?? 0, needsWidth),
      height: Math.max(viewport?.height ?? 0, needsHeight),
    });
  }
}

async function waitForCanvasSize(
  page: Page,
  expected: { columns: number; rows: number }
) {
  await page.waitForFunction(
    ({ width, height }) => {
      const canvas = document.querySelector(
        '#cornerstone-element canvas'
      ) as HTMLCanvasElement | null;
      return !!canvas && canvas.width === width && canvas.height === height;
    },
    { width: expected.columns, height: expected.rows },
    { timeout: 15000 }
  );
}

async function selectImageAndWaitForRender(page: Page, imagePath: string) {
  await ensureViewportFitsImage(page, imagePath);

  await waitForImageRendered(
    page,
    () => page.locator('#imageSelector').selectOption(imagePath),
    {
      expectedImageId: getExpectedWadoImageId(imagePath),
    }
  );

  const dim = dicomDimensions[imagePath];
  if (dim) {
    await waitForCanvasSize(page, dim);
  }
}

test.beforeEach(async ({ page }) => {
  const url = createExampleUrl(EXAMPLE + '.html');
  url.searchParams.set('type', 'next');
  await page.goto(url.toString());
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#imageSelector', { timeout: 30000 });
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) {
    return;
  }

  await page.evaluate(() => {
    const cornerstone = (
      window as unknown as {
        cornerstone?: {
          getRenderingEngines?: () => Array<{ destroy?: () => void }>;
        };
      }
    ).cornerstone;

    cornerstone
      ?.getRenderingEngines?.()
      ?.forEach((renderingEngine) => renderingEngine.destroy?.());
  });
});

// Map each DICOM image path to its screenShotPaths key. Most paths map by
// stripping `.dcm` (TG18 / TestPattern). For the CTImage variants the
// screenShotPaths key strips the `CTImage.` prefix as well.
const CASES: Array<[string, string]> = Object.keys(dicomDimensions).map(
  (imagePath) => {
    const stem = imagePath.replace(/\.dcm$/, '');
    const snapshotKey = stem.startsWith('CTImage.')
      ? stem.replace(/^CTImage\./, '')
      : stem;
    return [imagePath, snapshotKey];
  }
);

test.describe('GenericViewport: Dicom Image Loader WADOURI', async () => {
  for (const [imagePath, snapshotKey] of CASES) {
    test(`should load ${imagePath}`, async ({ page }) => {
      await selectImageAndWaitForRender(page, imagePath);

      await checkForCanvasSnapshot(
        page,
        '.cornerstone-canvas',
        LEGACY_BASELINE_PREFIX +
          screenShotPaths.dicomImageLoaderWADOURI[snapshotKey]
      );
    });
  }
});
