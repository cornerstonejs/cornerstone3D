import type { Page } from '@playwright/test';

const IMAGE_RENDERED = 'CORNERSTONE_IMAGE_RENDERED';
const STATE_KEY = '__cs_viewport_render_state__';
const INSTALLED_FLAG = Symbol.for('cs_render_tracker_installed');

interface RenderStateOptions {
  quietMs?: number;
  timeout?: number;
}

type PageWithFlag = Page & { [INSTALLED_FLAG]?: boolean };

/**
 * Must be called once per page before any navigation so the tracker captures
 * the very first IMAGE_RENDERED events that fire during initial load.
 */
export async function setupRenderTracking(page: Page) {
  const typed = page as PageWithFlag;
  if (typed[INSTALLED_FLAG]) {
    return;
  }
  typed[INSTALLED_FLAG] = true;

  await page.addInitScript(
    ({ stateKey, eventName }) => {
      const win = window as unknown as Record<string, unknown>;
      const state = {
        eventCount: 0,
        lastEventAt: 0,
        renderedUids: new Set<string>(),
      };
      win[stateKey] = state;

      document.addEventListener(
        eventName,
        (event: Event) => {
          const target = event.target as HTMLElement | null;
          const uid = target?.getAttribute?.('data-viewport-uid');
          if (uid) {
            state.renderedUids.add(uid);
          }
          state.eventCount += 1;
          state.lastEventAt = Date.now();
        },
        true
      );
    },
    { stateKey: STATE_KEY, eventName: IMAGE_RENDERED }
  );
}

export async function waitForViewportsRendered(
  page: Page,
  expectedCount: number,
  options: RenderStateOptions = {}
) {
  const { quietMs = 200, timeout = 30000 } = options;

  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-viewport-uid]').length >= n,
    expectedCount,
    { timeout }
  );

  await page.waitForFunction(
    ({ key, n, quiet }) => {
      const state = (window as unknown as Record<string, unknown>)[key] as
        | {
            renderedUids: Set<string>;
            lastEventAt: number;
          }
        | undefined;
      if (!state) {
        return false;
      }
      if (state.renderedUids.size < n) {
        return false;
      }
      return Date.now() - state.lastEventAt >= quiet;
    },
    { key: STATE_KEY, n: expectedCount, quiet: quietMs },
    { timeout }
  );
}

export async function waitForRenderSettled(
  page: Page,
  options: RenderStateOptions = {}
) {
  const { quietMs = 200, timeout = 10000 } = options;

  await page.waitForFunction(
    ({ key, quiet }) => {
      const state = (window as unknown as Record<string, unknown>)[key] as
        | { lastEventAt: number }
        | undefined;
      if (!state) {
        return false;
      }
      if (state.lastEventAt === 0) {
        return true;
      }
      return Date.now() - state.lastEventAt >= quiet;
    },
    { key: STATE_KEY, quiet: quietMs },
    { timeout }
  );
}
