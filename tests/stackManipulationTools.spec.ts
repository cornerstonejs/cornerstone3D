import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForCanvasSnapshot,
  screenShotPaths,
  simulateDrag,
  waitForImageRendered,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackManipulationTools');
});

// Selecting the tool can trigger a viewport re-render that, on the self-hosted
// runner, briefly clears the canvas; wait for it to settle before dragging so
// the gesture isn't applied mid-re-render. Best-effort: if the tool change does
// not re-render, fall through rather than hang.
async function selectToolAndSettle(page, toolName: string) {
  // Brief settle so the viewport is idle before the tool select, matching the
  // spline pre-settle that stabilized the slow-runner re-render race.
  await page.waitForTimeout(1000);
  try {
    await waitForImageRendered(
      page,
      () => page.getByRole('combobox').selectOption(toolName),
      { elementSelector: '[data-viewport-uid]', timeout: 3000 }
    );
  } catch {
    // tool change did not re-render; nothing to wait for
  }
}

test.describe('Basic Stack Manipulation', async () => {
  test('should manipulate the window level using the window level tool', async ({
    page,
  }) => {
    await selectToolAndSettle(page, 'WindowLevel');
    const locator = page.locator('.cornerstone-canvas');
    // Stepped motion so the window-level drag registers reliably on the
    // self-hosted runner.
    await simulateDrag(page, locator, { steps: 10 });
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackManipulationTools.windowLevel
    );
  });
  test('should rotate the viewport using the planar rotate tool', async ({
    page,
  }) => {
    await selectToolAndSettle(page, 'PlanarRotate');
    const locator = page.locator('.cornerstone-canvas');
    await simulateDrag(page, locator);
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackManipulationTools.planarRotate
    );
  });
});
