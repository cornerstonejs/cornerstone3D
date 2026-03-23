import type { Page } from '@playwright/test';

function shouldForceViewportV2() {
  return process.env.PLAYWRIGHT_FORCE_VIEWPORT_V2 === 'true';
}

function shouldForceCpuRendering() {
  return process.env.PLAYWRIGHT_FORCE_CPU_RENDERING === 'true';
}

async function waitForExamplePage(
  page: Page,
  waitForNetwork: boolean,
  waitForDom: boolean
) {
  await page.waitForSelector('div#content');

  if (waitForNetwork) {
    await page.waitForLoadState('networkidle');
  }

  if (waitForDom) {
    await page.waitForLoadState('domcontentloaded');
  }
}

/**
 * Visit the example page
 * @param page - The page to visit
 * @param title - The title of the example page
 */
export const visitExample = async (
  page: Page,
  title: string,
  delay = 0,
  waitForNetwork = true,
  waitForDom = true
) => {
  await page.goto('/');
  if (waitForNetwork) {
    await page.waitForLoadState('networkidle');
  }
  if (waitForDom) {
    await page.waitForLoadState('domcontentloaded');
  }

  const link = page.locator(`a:has-text("${title}")`).first();
  const href = await link.getAttribute('href');

  if (href) {
    const exampleUrl = new URL(href, page.url());

    if (shouldForceViewportV2()) {
      exampleUrl.searchParams.set('type', 'next');
    }

    if (shouldForceCpuRendering()) {
      exampleUrl.searchParams.set('cpu', '1');
    }

    await page.goto(exampleUrl.toString());
  } else {
    await link.click();

    if (shouldForceViewportV2() || shouldForceCpuRendering()) {
      const exampleUrl = new URL(page.url());

      if (shouldForceViewportV2()) {
        exampleUrl.searchParams.set('type', 'next');
      }

      if (shouldForceCpuRendering()) {
        exampleUrl.searchParams.set('cpu', '1');
      }

      await page.goto(exampleUrl.toString());
    }
  }

  await waitForExamplePage(page, waitForNetwork, waitForDom);
  await page.waitForTimeout(delay);
};
