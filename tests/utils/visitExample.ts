import type { Page } from '@playwright/test';
import { validateCompatibilityRuntime } from './compatibilityMode';

function shouldForceViewportNext() {
  return process.env.PLAYWRIGHT_FORCE_COMPAT === 'true';
}

function shouldForceCpuRendering() {
  return process.env.PLAYWRIGHT_FORCE_CPU_RENDERING === 'true';
}

async function waitForExamplePage(
  page: Page,
  waitForNetwork: boolean,
  waitForDom: boolean
) {
  await page.waitForSelector('div#content', { timeout: 30000 });

  if (waitForNetwork) {
    try {
      await page.waitForLoadState('networkidle', {
        timeout: 1000,
      });
    } catch {
      // Some examples keep enough background work active that waiting for
      // network idle becomes a source of beforeEach timeouts in Playwright.
    }
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
    try {
      await page.waitForLoadState('networkidle', {
        timeout: 1000,
      });
    } catch {
      // Avoid turning a best-effort idle check into a hard blocker for test setup.
    }
  }
  if (waitForDom) {
    await page.waitForLoadState('domcontentloaded');
  }

  const href = await page.evaluate((requestedTitle) => {
    const normalizedTitle = requestedTitle.toLowerCase();
    const links = Array.from(document.querySelectorAll('a[href]'));

    const getNormalizedHrefName = (hrefValue: string) => {
      const url = new URL(hrefValue, window.location.href);
      const basename = url.pathname.split('/').pop() ?? '';
      return basename.replace(/\.html$/, '').toLowerCase();
    };

    const exactHrefLink = links.find((link) => {
      const hrefValue = link.getAttribute('href');
      return hrefValue
        ? getNormalizedHrefName(hrefValue) === normalizedTitle
        : false;
    });

    if (exactHrefLink) {
      return exactHrefLink.getAttribute('href');
    }

    const exactTextLink = links.find(
      (link) => link.textContent?.trim().toLowerCase() === normalizedTitle
    );

    return exactTextLink?.getAttribute('href') ?? null;
  }, title);

  if (href) {
    const exampleUrl = new URL(href, page.url());

    if (shouldForceViewportNext()) {
      exampleUrl.searchParams.set('type', 'next');
    }

    if (shouldForceCpuRendering()) {
      exampleUrl.searchParams.set('cpu', '1');
    }

    await page.goto(exampleUrl.toString());
  } else {
    const link = page.locator(`a:has-text("${title}")`).first();
    await link.click();

    if (shouldForceViewportNext() || shouldForceCpuRendering()) {
      const exampleUrl = new URL(page.url());

      if (shouldForceViewportNext()) {
        exampleUrl.searchParams.set('type', 'next');
      }

      if (shouldForceCpuRendering()) {
        exampleUrl.searchParams.set('cpu', '1');
      }

      await page.goto(exampleUrl.toString());
    }
  }

  await waitForExamplePage(page, waitForNetwork, waitForDom);
  await validateCompatibilityRuntime(page, title);
  await page.waitForTimeout(delay);
};
