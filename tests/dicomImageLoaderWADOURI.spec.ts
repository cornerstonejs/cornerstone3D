import type { Page } from '@playwright/test';
import { test } from 'playwright-test-coverage';
import {
  checkForCanvasSnapshot,
  visitExample,
  screenShotPaths,
  waitForImageRendered,
  retryRemoteFixtures,
} from './utils/index';
import { dicomDimensions } from '../packages/dicomImageLoader/examples/dicomImageLoaderWADOURI/dicomDimensions';

test.beforeEach(async ({ page }) => {
  // Every image in this example is fetched over HTTP from
  // raw.githubusercontent.com, which intermittently rate-limits/drops requests
  // under the parallel workers on the self-hosted runner. Retry those fetches
  // with backoff so a single dropped response doesn't fail the image load.
  await retryRemoteFixtures(page);
  await visitExample(page, 'dicomImageLoaderWADOURI');
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
      // Larger budget than the 30s default: the large TG18 1k/2k images can
      // legitimately take a while to download+decode on the self-hosted
      // runner, and retryRemoteFixtures may add a few seconds of backoff on a
      // transient GitHub-raw failure.
      timeout: 60000,
    }
  );

  const dim = dicomDimensions[imagePath];
  if (dim) {
    await waitForCanvasSize(page, dim);
  }
}

test.describe('Dicom Image Loader WADOURI', async () => {
  /**
   * Test to load a dicom image with JPEGLSLosslessTransferSyntax
   */
  test('should load a dicom image with JPEGLSLosslessTransferSyntax', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'CTImage.dcm_JPEGLSLosslessTransferSyntax_1.2.840.10008.1.2.4.80.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'dcm_JPEGLSLosslessTransferSyntax_1.2.840.10008.1.2.4.80'
      ]
    );
  });

  /**
   * Test to load a dicom image with JPEGLSLossyTransferSyntax
   */
  test('should load a dicom image with JPEGLSLossyTransferSyntax', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'CTImage.dcm_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'dcm_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81'
      ]
    );
  });

  /**
   * Test to load a dicom image with JPEGProcess1TransferSyntax
   */
  test('should load a dicom image with JPEGProcess1TransferSyntax', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'CTImage.dcm_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'dcm_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50'
      ]
    );
  });

  /**
   * Test to load a dicom image with RLELosslessTransferSyntax
   */
  test('should load a dicom image with RLELosslessTransferSyntax', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'CTImage.dcm_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'dcm_RLELosslessTransferSyntax_1.2.840.10008.1.2.5'
      ]
    );
  });

  /**
   * Test to load a dicom image with JPEGProcess14TransferSyntax
   */
  test('should load a dicom image with JPEGProcess14TransferSyntax', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'CTImage.dcm_JPEGProcess14TransferSyntax_1.2.840.10008.1.2.4.57.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'dcm_JPEGProcess14TransferSyntax_1.2.840.10008.1.2.4.57'
      ]
    );
  });

  /**
   * Test to load a dicom image with JPEGProcess14SV1TransferSyntax
   */
  test('should load a dicom image with JPEGProcess14SV1TransferSyntax', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'CTImage.dcm_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'dcm_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70'
      ]
    );
  });

  /**
   * Test to load a dicom image with JPEG2000LosslessOnlyTransferSyntax
   */
  test('should load a dicom image with JPEG2000LosslessOnlyTransferSyntax', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'CTImage.dcm_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'dcm_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90'
      ]
    );
  });

  /**
   * Test to load a dicom image with JPEG2000TransferSyntax
   */
  test('should load a dicom image with JPEG2000TransferSyntax', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'CTImage.dcm_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'dcm_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91'
      ]
    );
  });

  /**
   * Test to load a dicom image TestPattern_JPEG-Baseline_YBR422.dcm
   */
  test('should load TestPattern_JPEG-Baseline_YBR422.dcm', async ({ page }) => {
    await selectImageAndWaitForRender(
      page,
      'TestPattern_JPEG-Baseline_YBR422.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TestPattern_JPEG-Baseline_YBR422'
      ]
    );
  });

  /**
   * Test to load a dicom image TestPattern_JPEG-Baseline_YBRFull.dcm
   */
  test('should load TestPattern_JPEG-Baseline_YBRFull.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TestPattern_JPEG-Baseline_YBRFull.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TestPattern_JPEG-Baseline_YBRFull'
      ]
    );
  });

  /**
   * Test to load a dicom image TestPattern_JPEG-Lossless_RGB.dcm
   */
  test('should load TestPattern_JPEG-Lossless_RGB.dcm', async ({ page }) => {
    await selectImageAndWaitForRender(
      page,
      'TestPattern_JPEG-Lossless_RGB.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI['TestPattern_JPEG-Lossless_RGB']
    );
  });

  /**
   * Test to load a dicom image TestPattern_JPEG-LS-Lossless.dcm
   */
  test('should load TestPattern_JPEG-LS-Lossless.dcm', async ({ page }) => {
    await selectImageAndWaitForRender(page, 'TestPattern_JPEG-LS-Lossless.dcm');

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI['TestPattern_JPEG-LS-Lossless']
    );
  });

  /**
   * Test to load a dicom image TestPattern_JPEG-LS-NearLossless.dcm
   */
  test('should load TestPattern_JPEG-LS-NearLossless.dcm', async ({ page }) => {
    await selectImageAndWaitForRender(
      page,
      'TestPattern_JPEG-LS-NearLossless.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TestPattern_JPEG-LS-NearLossless'
      ]
    );
  });

  /**
   * Test to load a dicom image TestPattern_Palette_16.dcm
   */
  test('should load TestPattern_Palette_16.dcm', async ({ page }) => {
    await selectImageAndWaitForRender(page, 'TestPattern_Palette_16.dcm');

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI['TestPattern_Palette_16']
    );
  });

  /**
   * Test to load a dicom image TestPattern_Palette.dcm
   */
  test('should load TestPattern_Palette.dcm', async ({ page }) => {
    await selectImageAndWaitForRender(page, 'TestPattern_Palette.dcm');

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI['TestPattern_Palette']
    );
  });

  /**
   * Test to load a dicom image TestPattern_RGB.dcm
   */
  test('should load TestPattern_RGB.dcm', async ({ page }) => {
    await selectImageAndWaitForRender(page, 'TestPattern_RGB.dcm');

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI['TestPattern_RGB']
    );
  });

  /**
   * Test to load a dicom image TG18-AD-1k-01.dcm
   */
  test('should load TG_18-luminance-1K/TG18-AD/TG18-AD-1k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-luminance-1K/TG18-AD/TG18-AD-1k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-luminance-1K/TG18-AD/TG18-AD-1k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-CT-1k-01.dcm
   */
  test('should load TG_18-luminance-1K/TG18-CT/TG18-CT-1k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-luminance-1K/TG18-CT/TG18-CT-1k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-luminance-1K/TG18-CT/TG18-CT-1k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-LN-1k-01.dcm
   */
  test('should load TG_18-luminance-1K/TG18-LN/TG18-LN-1k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-LN-1k-04.dcm
   */
  test('should load TG_18-luminance-1K/TG18-LN/TG18-LN-1k-04.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-04.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-04'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-LN-1k-09.dcm
   */
  test('should load TG_18-luminance-1K/TG18-LN/TG18-LN-1k-09.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-09.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-09'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-LN-1k-13.dcm
   */
  test('should load TG_18-luminance-1K/TG18-LN/TG18-LN-1k-13.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-13.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-13'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-LN-1k-18.dcm
   */
  test('should load TG_18-luminance-1K/TG18-LN/TG18-LN-1k-18.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-18.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-18'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-MP-1k-01.dcm
   */
  test('should load TG_18-luminance-1K/TG18-MP/TG18-MP-1k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-luminance-1K/TG18-MP/TG18-MP-1k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-luminance-1K/TG18-MP/TG18-MP-1k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-UN-1k-01.dcm
   */
  test('should load TG_18-luminance-1K/TG18-UN/TG18-UN-1k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-luminance-1K/TG18-UN/TG18-UN-1k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-luminance-1K/TG18-UN/TG18-UN-1k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-UNL-1k-01.dcm
   */
  test('should load TG_18-luminance-1K/TG18-UNL/TG18-UNL-1k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-luminance-1K/TG18-UNL/TG18-UNL-1k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-luminance-1K/TG18-UNL/TG18-UNL-1k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-BR-1k-01.dcm
   */
  test('should load TG_18-multi-1K/TG18-BR/TG18-BR-1k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-multi-1K/TG18-BR/TG18-BR-1k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-multi-1K/TG18-BR/TG18-BR-1k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-QC-1k-01.dcm
   */
  test('should load TG_18-multi-1K/TG18-QC/TG18-QC-1k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-multi-1K/TG18-QC/TG18-QC-1k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-multi-1K/TG18-QC/TG18-QC-1k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-PQC-1k-01.dcm
   */
  test('should load TG_18-multi-1K/TG18-pQC/TG18-PQC-1k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-multi-1K/TG18-pQC/TG18-PQC-1k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-multi-1K/TG18-pQC/TG18-PQC-1k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-AFC-1k-01.dcm
   */
  test('should load TG_18-noise-1k/TG18-AFC/TG18-AFC-1k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-noise-1k/TG18-AFC/TG18-AFC-1k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-noise-1k/TG18-AFC/TG18-AFC-1k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-NS-1k-01.dcm
   */
  test('should load TG_18-noise-1k/TG18-NS/TG18-NS-1k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-noise-1k/TG18-NS/TG18-NS-1k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-noise-1k/TG18-NS/TG18-NS-1k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-NS-1k-02.dcm
   */
  test('should load TG_18-noise-1k/TG18-NS/TG18-NS-1k-02.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-noise-1k/TG18-NS/TG18-NS-1k-02.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-noise-1k/TG18-NS/TG18-NS-1k-02'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-NS-1k-03.dcm
   */
  test('should load TG_18-noise-1k/TG18-NS/TG18-NS-1k-03.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-noise-1k/TG18-NS/TG18-NS-1k-03.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-noise-1k/TG18-NS/TG18-NS-1k-03'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-CX-2k-01.dcm
   */
  test('should load TG_18-resolution-2k/TG18-CX/TG18-CX-2k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-CX/TG18-CX-2k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-CX/TG18-CX-2k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-LPH-2k-01.dcm
   */
  test('should load TG_18-resolution-2k/TG18-LPH/TG18-LPH-2k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-LPH/TG18-LPH-2k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-LPH/TG18-LPH-2k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-LPV-2k-01.dcm
   */
  test('should load TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-LPV-2k-02.dcm
   */
  test('should load TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-02.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-02.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-02'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-LPV-2k-03.dcm
   */
  test('should load TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-03.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-03.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-03'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-PX-2k-01.dcm
   */
  test('should load TG_18-resolution-2k/TG18-PX/TG18-PX-2k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-PX/TG18-PX-2k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-PX/TG18-PX-2k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-RH-2k-01.dcm
   */
  test('should load TG_18-resolution-2k/TG18-RH/TG18-RH-2k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-RH-2k-02.dcm
   */
  test('should load TG_18-resolution-2k/TG18-RH/TG18-RH-2k-02.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-02.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-02'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-RH-2k-03.dcm
   */
  test('should load TG_18-resolution-2k/TG18-RH/TG18-RH-2k-03.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-03.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-03'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-RV-2k-01.dcm
   */
  test('should load TG_18-resolution-2k/TG18-RV/TG18-RV-2k-01.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-01.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-01'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-RV-2k-02.dcm
   */
  test('should load TG_18-resolution-2k/TG18-RV/TG18-RV-2k-02.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-02.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-02'
      ]
    );
  });

  /**
   * Test to load a dicom image TG18-RV-2k-03.dcm
   */
  test('should load TG_18-resolution-2k/TG18-RV/TG18-RV-2k-03.dcm', async ({
    page,
  }) => {
    await selectImageAndWaitForRender(
      page,
      'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-03.dcm'
    );

    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-03'
      ]
    );
  });
});
