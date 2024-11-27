import { test } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

const TIME_OUT = 3000;
test.beforeEach(async ({ page }) => {
  await visitExample(page, 'dicomImageLoaderWADOURI');
});

test.describe('Dicom Image Loader WADOURI', async () => {
  /**
   * Test to load a dicom image with JPEGLSLosslessTransferSyntax
   */
  test('should load a dicom image with JPEGLSLosslessTransferSyntax', async ({
    page,
  }) => {
    await page
      .locator('#imageSelector')
      .selectOption(
        'CTImage.dcm_JPEGLSLosslessTransferSyntax_1.2.840.10008.1.2.4.80.dcm'
      );

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption(
        'CTImage.dcm_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81.dcm'
      );

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption(
        'CTImage.dcm_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50.dcm'
      );

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption(
        'CTImage.dcm_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm'
      );

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption(
        'CTImage.dcm_JPEGProcess14TransferSyntax_1.2.840.10008.1.2.4.57.dcm'
      );

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption(
        'CTImage.dcm_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70.dcm'
      );

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption(
        'CTImage.dcm_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90.dcm'
      );

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption(
        'CTImage.dcm_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91.dcm'
      );

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.dicomImageLoaderWADOURI[
        'dcm_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91'
      ]
    );
  });

  /**
   * Test to load a dicom image with DeflatedExplicitVRLittleEndianTransferSyntax
   */
  test.skip('should load a dicom image with DeflatedExplicitVRLittleEndianTransferSyntax', async ({
    page,
  }) => {
    await page
      .locator('#imageSelector')
      .selectOption(
        'CTImage.dcm_DeflatedExplicitVRLittleEndianTransferSyntax_1.2.840.10008.1.2.1.99.dcm'
      );

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(3000);

    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.dicomImageLoaderWADOURI['1.2.840.10008.1.2.1.99']
    );
  });

  /**
   * Test to load a dicom image TestPattern_JPEG-Baseline_YBR422.dcm
   */
  test('should load TestPattern_JPEG-Baseline_YBR422.dcm', async ({ page }) => {
    await page
      .locator('#imageSelector')
      .selectOption('TestPattern_JPEG-Baseline_YBR422.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TestPattern_JPEG-Baseline_YBRFull.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.dicomImageLoaderWADOURI[
        'TestPattern_JPEG-Baseline_YBRFull'
      ]
    );
  });

  /**
   * Test to load a dicom image TestPattern_JPEG-Lossless_RGB.dcm
   */
  test('should load TestPattern_JPEG-Lossless_RGB.dcm', async ({ page }) => {
    await page
      .locator('#imageSelector')
      .selectOption('TestPattern_JPEG-Lossless_RGB.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.dicomImageLoaderWADOURI['TestPattern_JPEG-Lossless_RGB']
    );
  });

  /**
   * Test to load a dicom image TestPattern_JPEG-LS-Lossless.dcm
   */
  test('should load TestPattern_JPEG-LS-Lossless.dcm', async ({ page }) => {
    await page
      .locator('#imageSelector')
      .selectOption('TestPattern_JPEG-LS-Lossless.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.dicomImageLoaderWADOURI['TestPattern_JPEG-LS-Lossless']
    );
  });

  /**
   * Test to load a dicom image TestPattern_JPEG-LS-NearLossless.dcm
   */
  test('should load TestPattern_JPEG-LS-NearLossless.dcm', async ({ page }) => {
    await page
      .locator('#imageSelector')
      .selectOption('TestPattern_JPEG-LS-NearLossless.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.dicomImageLoaderWADOURI[
        'TestPattern_JPEG-LS-NearLossless'
      ]
    );
  });

  /**
   * Test to load a dicom image TestPattern_Palette_16.dcm
   */
  test.skip('should load TestPattern_Palette_16.dcm', async ({ page }) => {
    await page
      .locator('#imageSelector')
      .selectOption('TestPattern_Palette_16.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.dicomImageLoaderWADOURI['TestPattern_Palette_16']
    );
  });

  /**
   * Test to load a dicom image TestPattern_Palette.dcm
   */
  test.skip('should load TestPattern_Palette.dcm', async ({ page }) => {
    await page
      .locator('#imageSelector')
      .selectOption('TestPattern_Palette.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.dicomImageLoaderWADOURI['TestPattern_Palette']
    );
  });

  /**
   * Test to load a dicom image TestPattern_RGB.dcm
   */
  test('should load TestPattern_RGB.dcm', async ({ page }) => {
    await page.locator('#imageSelector').selectOption('TestPattern_RGB.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.dicomImageLoaderWADOURI['TestPattern_RGB']
    );
  });

  /**
   * Test to load a dicom image TG18-AD-1k-01.dcm
   */
  test('should load TG_18-luminance-1K/TG18-AD/TG18-AD-1k-01.dcm', async ({
    page,
  }) => {
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-luminance-1K/TG18-AD/TG18-AD-1k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-luminance-1K/TG18-CT/TG18-CT-1k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-luminance-1K/TG18-LN/TG18-LN-1k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-luminance-1K/TG18-LN/TG18-LN-1k-04.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-luminance-1K/TG18-LN/TG18-LN-1k-09.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-luminance-1K/TG18-LN/TG18-LN-1k-13.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-luminance-1K/TG18-LN/TG18-LN-1k-18.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-luminance-1K/TG18-MP/TG18-MP-1k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-luminance-1K/TG18-UN/TG18-UN-1k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-luminance-1K/TG18-UNL/TG18-UNL-1k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-multi-1K/TG18-BR/TG18-BR-1k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-multi-1K/TG18-QC/TG18-QC-1k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-multi-1K/TG18-pQC/TG18-PQC-1k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-noise-1k/TG18-AFC/TG18-AFC-1k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-noise-1k/TG18-NS/TG18-NS-1k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-noise-1k/TG18-NS/TG18-NS-1k-02.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-noise-1k/TG18-NS/TG18-NS-1k-03.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-CX/TG18-CX-2k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-LPH/TG18-LPH-2k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(3000);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-02.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-03.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-PX/TG18-PX-2k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-RH/TG18-RH-2k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-RH/TG18-RH-2k-02.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-RH/TG18-RH-2k-03.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-RV/TG18-RV-2k-01.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-RV/TG18-RV-2k-02.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
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
    await page
      .locator('#imageSelector')
      .selectOption('TG_18-resolution-2k/TG18-RV/TG18-RV-2k-03.dcm');

    const locator = page.locator('.cornerstone-canvas');

    await page.waitForTimeout(TIME_OUT);

    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.dicomImageLoaderWADOURI[
        'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-03'
      ]
    );
  });
});
