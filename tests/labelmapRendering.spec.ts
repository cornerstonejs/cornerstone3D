import { test } from 'playwright-test-coverage';
import {
  checkForCanvasSnapshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'labelmapRendering', 0, false, false);
});

test.describe('Labelmap Rendering', async () => {
  test('should render the labelmap in axial/coronal/sagittal orientations', async ({
    page,
  }) => {
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRendering.axial,
      0
    );

    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRendering.coronal,
      1
    );

    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRendering.sagittal,
      2
    );
  });
});
