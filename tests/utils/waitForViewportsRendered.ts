import type { Page } from '@playwright/test';

const IMAGE_RENDERED = 'CORNERSTONE_IMAGE_RENDERED';
const STATE_KEY = '__cs_viewport_render_state__';
const INSTALLED_KEY = '__cs_render_tracker_installed__';
const INSTALLED_FLAG = Symbol.for('cs_render_tracker_installed');

interface RenderStateOptions {
  quietMs?: number;
  timeout?: number;
}

type WaitForViewportsRenderedOptions = RenderStateOptions & {
  /**
   * If true (default), also waits for volume actors referenced by viewports to
   * report loaded.
   */
  waitVolumeLoad?: boolean;
};

type PageWithFlag = Page & { [INSTALLED_FLAG]?: boolean };

type RenderEventQuietOptions = {
  expectedCount?: number;
  quietMs: number;
  timeout: number;
  requireEvents?: boolean;
  startedAt?: number;
};

function normalizeWaitOptions(
  expectedCountOrOptions?: number | WaitForViewportsRenderedOptions,
  options: WaitForViewportsRenderedOptions = {}
) {
  if (typeof expectedCountOrOptions === 'number') {
    return {
      expectedCount: expectedCountOrOptions,
      options,
    };
  }

  return {
    expectedCount: undefined,
    options: expectedCountOrOptions || options,
  };
}

async function installRenderTrackingOnCurrentPage(page: Page) {
  await page.evaluate(
    ({ stateKey, installedKey, eventName }) => {
      const win = window as unknown as Record<string, any>;
      if (!win[stateKey]) {
        win[stateKey] = {
          eventCount: 0,
          lastEventAt: 0,
          renderedUids: new Set<string>(),
        };
      }

      if (win[installedKey]) {
        return;
      }

      win[installedKey] = true;
      document.addEventListener(
        eventName,
        (event: Event) => {
          const state = win[stateKey];
          const target = event.target as HTMLElement | null;
          const detail = (event as CustomEvent).detail;
          const uid =
            target?.getAttribute?.('data-viewport-uid') || detail?.viewportId;
          if (uid) {
            state.renderedUids.add(uid);
          }
          state.eventCount += 1;
          state.lastEventAt = Date.now();
        },
        true
      );
    },
    {
      stateKey: STATE_KEY,
      installedKey: INSTALLED_KEY,
      eventName: IMAGE_RENDERED,
    }
  );
}

/**
 * Must be called before navigation when a test needs event-accurate render
 * tracking from the first IMAGE_RENDERED event on the page.
 */
export async function setupRenderTracking(page: Page) {
  const typed = page as PageWithFlag;
  if (typed[INSTALLED_FLAG]) {
    return;
  }
  typed[INSTALLED_FLAG] = true;

  await page.addInitScript(
    ({ stateKey, installedKey, eventName }) => {
      const win = window as unknown as Record<string, any>;
      win[stateKey] = {
        eventCount: 0,
        lastEventAt: 0,
        renderedUids: new Set<string>(),
      };

      if (win[installedKey]) {
        return;
      }

      win[installedKey] = true;
      document.addEventListener(
        eventName,
        (event: Event) => {
          const state = win[stateKey];
          const target = event.target as HTMLElement | null;
          const detail = (event as CustomEvent).detail;
          const uid =
            target?.getAttribute?.('data-viewport-uid') || detail?.viewportId;
          if (uid) {
            state.renderedUids.add(uid);
          }
          state.eventCount += 1;
          state.lastEventAt = Date.now();
        },
        true
      );
    },
    {
      stateKey: STATE_KEY,
      installedKey: INSTALLED_KEY,
      eventName: IMAGE_RENDERED,
    }
  );

  await installRenderTrackingOnCurrentPage(page);
}

async function waitForViewportStatuses(
  page: Page,
  expectedCount: number | undefined,
  timeout: number,
  waitVolumeLoad: boolean
) {
  await page.waitForFunction(
    ({ expectedCount, waitVolumeLoad }) => {
      const cornerstone = (window as any).cornerstone;
      if (!cornerstone?.getRenderingEngines) {
        return false;
      }

      const renderingEngines = cornerstone.getRenderingEngines();
      const viewports = renderingEngines.flatMap((engine) =>
        engine.getViewports ? engine.getViewports() : []
      );

      const minimumViewportCount = expectedCount ?? 1;
      if (viewports.length < minimumViewportCount) {
        return false;
      }

      const trackedViewports =
        expectedCount === undefined
          ? viewports
          : viewports.slice(0, expectedCount);

      const allRendered = trackedViewports.every(
        (viewport) => viewport?.viewportStatus === 'rendered'
      );

      if (!allRendered) {
        return false;
      }

      if (!waitVolumeLoad) {
        return true;
      }

      const cache = cornerstone.cache;
      if (!cache?.getVolume) {
        return true;
      }

      const actorEntries = trackedViewports.flatMap((viewport) =>
        viewport?.getActors ? viewport.getActors() : []
      );

      for (const actorEntry of actorEntries) {
        const id = actorEntry?.referencedId || actorEntry?.uid;
        if (!id) {
          continue;
        }

        let volume: any;
        try {
          volume = cache.getVolume(id);
        } catch {
          continue;
        }

        const loaded =
          volume?.loadStatus && typeof volume.loadStatus.loaded === 'boolean'
            ? volume.loadStatus.loaded
            : true;

        if (!loaded) {
          return false;
        }
      }

      return true;
    },
    { expectedCount, waitVolumeLoad },
    { timeout }
  );
}

async function waitForRenderEventQuiet(
  page: Page,
  {
    expectedCount,
    quietMs,
    timeout,
    requireEvents = false,
    startedAt,
  }: RenderEventQuietOptions
) {
  await page.waitForFunction(
    ({ key, expectedCount, quiet, requireEvents, startedAt }) => {
      const state = (window as unknown as Record<string, any>)[key] as
        | {
            eventCount: number;
            renderedUids: Set<string>;
            lastEventAt: number;
          }
        | undefined;

      const now = Date.now();

      if (!state || state.eventCount === 0) {
        return !requireEvents && startedAt !== undefined
          ? now - startedAt >= quiet
          : !requireEvents;
      }

      if (
        expectedCount !== undefined &&
        state.renderedUids.size < expectedCount
      ) {
        return false;
      }

      const lastActivity =
        startedAt !== undefined && state.lastEventAt < startedAt
          ? startedAt
          : state.lastEventAt;

      return now - lastActivity >= quiet;
    },
    { key: STATE_KEY, expectedCount, quiet: quietMs, requireEvents, startedAt },
    { timeout }
  );
}

export async function waitForViewportsRendered(
  page: Page,
  expectedCountOrOptions?: number | WaitForViewportsRenderedOptions,
  maybeOptions: WaitForViewportsRenderedOptions = {}
) {
  const { expectedCount, options } = normalizeWaitOptions(
    expectedCountOrOptions,
    maybeOptions
  );
  const { quietMs = 200, timeout = 30000, waitVolumeLoad = true } = options;

  await installRenderTrackingOnCurrentPage(page);

  if (expectedCount !== undefined) {
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-viewport-uid]').length >= n,
      expectedCount,
      { timeout }
    );

    await waitForRenderEventQuiet(page, {
      expectedCount,
      quietMs,
      timeout,
      requireEvents: true,
    });
    return;
  }

  await waitForViewportStatuses(page, expectedCount, timeout, waitVolumeLoad);
  await waitForRenderEventQuiet(page, {
    expectedCount,
    quietMs,
    timeout,
  });
}

export async function waitForRenderSettled(
  page: Page,
  options: WaitForViewportsRenderedOptions = {}
) {
  const { quietMs = 200, timeout = 10000 } = options;

  await installRenderTrackingOnCurrentPage(page);
  const startedAt = await page.evaluate(() => Date.now());
  await waitForRenderEventQuiet(page, {
    quietMs,
    timeout,
    startedAt,
  });
}
