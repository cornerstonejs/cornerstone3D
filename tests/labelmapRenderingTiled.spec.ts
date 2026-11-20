import { test } from 'playwright-test-coverage';
import {
  checkForCanvasSnapshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page, context }) => {
  await visitExample(page, 'labelmapRendering', 0, false, false);
  await context.addInitScript(() => (window.IS_TILED = true));
});

test.describe('Labelmap Rendering', async () => {
  test('should render the labelmap in axial/coronal/sagittal orientations', async ({
    page,
  }) => {
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRenderingTiled.axial,
      0
    );

    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRenderingTiled.coronal,
      1
    );

    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRenderingTiled.sagittal,
      2
    );
  });
});
