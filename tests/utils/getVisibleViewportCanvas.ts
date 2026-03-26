import type { Page } from 'playwright';

export function getVisibleViewportCanvas(page: Page, viewportIndex = 0) {
  return page
    .locator('[data-viewport-uid]')
    .nth(viewportIndex)
    .locator('canvas:visible')
    .first();
}
