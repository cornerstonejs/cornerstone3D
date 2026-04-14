import type { Page } from '@playwright/test';

type WaitForViewportsRenderedOptions = {
  timeout?: number;
};

/**
 * Stabilize tests by waiting for a short tick, network idle, then viewport render completion.
 */
export const waitForViewportsRendered = async (
  page: Page,
  options: WaitForViewportsRenderedOptions = {}
) => {
  const { timeout = 15000 } = options;

  await page.waitForTimeout(100);
  await page.waitForLoadState('networkidle');

  await page.waitForFunction(
    () => {
      const cornerstone = (window as any).cornerstone;
      if (!cornerstone?.getRenderingEngines) {
        return false;
      }

      const renderingEngines = cornerstone.getRenderingEngines();
      const viewports = renderingEngines.flatMap((engine) =>
        engine.getViewports ? engine.getViewports() : []
      );

      if (!viewports.length) {
        return false;
      }

      return viewports.every((viewport) => viewport?.viewportStatus === 'rendered');
    },
    { timeout }
  );
};
