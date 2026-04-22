import type { Page } from '@playwright/test';

const STACK_NEW_IMAGE = 'CORNERSTONE_STACK_NEW_IMAGE';
const IMAGE_RENDERED = 'CORNERSTONE_IMAGE_RENDERED';

interface WaitForImageRenderedOptions {
  expectedImageId?: string;
  elementSelector?: string;
  timeout?: number;
}

export async function waitForImageRendered(
  page: Page,
  trigger: () => Promise<unknown> | unknown,
  options: WaitForImageRenderedOptions = {}
) {
  const {
    expectedImageId,
    elementSelector = '#cornerstone-element',
    timeout = 30000,
  } = options;

  const stateKey = `__waitForImageRendered_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;

  await page.evaluate(
    ({ selector, expectedImageId, stateKey, STACK_NEW_IMAGE, IMAGE_RENDERED }) => {
      const element = document.querySelector(selector) as HTMLDivElement | null;
      if (!element) {
        throw new Error(`waitForImageRendered: element not found: ${selector}`);
      }

      const state = { matched: !expectedImageId, rendered: false };
      (window as unknown as Record<string, unknown>)[stateKey] = state;

      const onStackNewImage = (event: Event) => {
        const detail = (event as CustomEvent<{ imageId?: string }>).detail;
        if (expectedImageId && detail?.imageId === expectedImageId) {
          state.matched = true;
        }
      };

      const onImageRendered = () => {
        if (state.matched) {
          state.rendered = true;
          element.removeEventListener(STACK_NEW_IMAGE, onStackNewImage);
          element.removeEventListener(IMAGE_RENDERED, onImageRendered);
        }
      };

      element.addEventListener(STACK_NEW_IMAGE, onStackNewImage);
      element.addEventListener(IMAGE_RENDERED, onImageRendered);
    },
    {
      selector: elementSelector,
      expectedImageId,
      stateKey,
      STACK_NEW_IMAGE,
      IMAGE_RENDERED,
    }
  );

  await trigger();

  await page.waitForFunction(
    (key) =>
      (window as unknown as Record<string, { rendered?: boolean } | undefined>)[
        key
      ]?.rendered === true,
    stateKey,
    { timeout }
  );

  await page.evaluate((key) => {
    delete (window as unknown as Record<string, unknown>)[key];
  }, stateKey);
}
