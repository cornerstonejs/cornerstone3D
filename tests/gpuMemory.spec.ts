import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from 'playwright-test-coverage';
import {
  createExampleUrl,
  isCompatibilityMode,
  retryRemoteFixtures,
} from './utils/index';

/**
 * End-to-end tests of the automatic GPU settings (`auto`) on the
 * volumeProgressive example: a change of the GPU memory limit, a GPU failure,
 * the probe of the device, a duplicated tab and the wait for WebGL. Each test
 * needs a real browser: real WebGL contexts, a real `localStorage`, storage
 * events and a `BroadcastChannel` between pages.
 *
 * The requirements are in
 * `packages/docs/docs/specs/core/gpu-device-limits/requirements.md`.
 */

const EXAMPLE = 'volumeProgressive';
const CT_VOLUME_ID = 'cornerstoneStreamingImageVolume:CT_VOLUME_ID';
const CT_VIEWPORT_IDS = [
  'CT_SAGITTAL_STACK_1',
  'CT_SAGITTAL_STACK_2',
  'CT_SAGITTAL_STACK_3',
  'CT_VOLUME_3D',
];
const MEGABYTE = 1024 ** 2;
const GIGABYTE = 1024 ** 3;
const PENDING_PREFIX = 'cornerstone3D.renderingCapabilities.pending.';
const TAB_ID_KEY = 'cornerstone3D.tabId';
const WEBGL_BLOCK_KEY = 'cornerstone3D.webglBlockedUntil';
/** The CT of the example loads from a public DICOMweb server. */
const LOAD_TIMEOUT = 300_000;

/** The part of `window.cornerstone` that these tests read. */
type CornerstoneGlobal = {
  getGpuMemoryLimit(): { bytes: number; source: string } | undefined;
  setGpuMemoryLimit(limit: { bytes: number }): void;
  getGpuMemoryByKind(): { texture: number };
  getGpuMemoryHistory(): { lastFailure?: { kind: string } };
  getLastGpuMemoryFailure(): FailureDetail | undefined;
  getStoredRenderingCapabilities(): {
    probeVersion: number;
    probeMs?: number;
    edge: { reliable?: { value: number; successes: number } };
  } | null;
  isWebGLBlocked(): boolean;
  whenWebGLAvailable(): Promise<void>;
  getRenderingEngines(): {
    getViewports(): {
      id: string;
      canvas: HTMLCanvasElement;
      getFidelityState(): {
        dataResolution?: { dimensions?: number[] };
        displayResolution?: { dimensions?: number[] };
      };
    }[];
    contextPool: {
      contexts: {
        getOpenGLRenderWindow(): { getContext(): WebGL2RenderingContext };
      }[];
      viewportToContext: Map<string, number>;
    };
  }[];
  volumeTextureStore: {
    setsOfVolume(volumeId: string): { name: string; references: number }[];
  };
  cache: {
    getVolume(
      volumeId: string
    ):
      | { loadStatus?: { loaded?: boolean }; framesProcessed?: number }
      | undefined;
  };
  eventTarget: EventTarget;
  Enums: { Events: Record<string, string> };
};

type FailureDetail = {
  kind: string;
  failedBytes: number;
  limitBytes: number;
  limitSource: string;
  suggestedBytes: number;
  mustReload: boolean;
};

type TestWindow = Window & {
  cornerstone: CornerstoneGlobal;
  gpuMemoryTest: {
    failures: FailureDetail[];
    webglEvents: Record<string, unknown>[];
    pagesMessages: { type: string; pageId: string }[];
    availableAt?: number;
    probeUploads: number;
    pendingRecord?: { key: string; value: string };
  };
};

/**
 * Headless Chromium draws with SwiftShader, a software rasterizer, and the GPU
 * settings do not apply to a software renderer (GPULIM-U-1). This script
 * names a SwiftShader renderer as a desktop GPU, so `auto` applies; WebGL
 * itself stays real. A real GPU keeps its own name.
 */
async function emulateDesktopGpu(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const software =
      /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;
    const rendererParameters = [0x9246, 0x1f01];

    for (const prototype of [
      WebGL2RenderingContext.prototype,
      WebGLRenderingContext.prototype,
    ]) {
      const getParameter = prototype.getParameter;

      prototype.getParameter = function (this: WebGLRenderingContext, name) {
        const value = getParameter.call(this, name);

        return rendererParameters.includes(name) &&
          typeof value === 'string' &&
          software.test(value)
          ? 'ANGLE (Playwright, emulated desktop GPU)'
          : value;
      };
    }
  });
}

/**
 * The dev server of one example shows an overlay over the page for an
 * uncaught error, which takes the clicks of the failure popup. A context lost
 * during a render can raise one (see the context loss test). A static build,
 * as in CI, has no overlay.
 */
async function hideDevServerOverlay(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');

      style.textContent =
        '#webpack-dev-server-client-overlay { display: none !important; }';
      document.head.appendChild(style);
    });
  });
}

/** The DICOMweb server of the CT, which can stall a request now and then. */
const DICOMWEB_HOSTS = [/d14fa38qiwhyfd\.cloudfront\.net/];

/** A second page of the context, with the retries of the first. */
async function newPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();

  await retryRemoteFixtures(page, { hosts: DICOMWEB_HOSTS });

  return page;
}

/**
 * Opens the example, from a static build (`volumeProgressive.html`) or from
 * the dev server of this one example, which serves it at `/`.
 */
async function openExample(page: Page, search = ''): Promise<void> {
  const response = await page.goto(
    createExampleUrl(`${EXAMPLE}.html${search}`).toString()
  );

  if (response?.status() === 404) {
    await page.goto(createExampleUrl(`/${search}`).toString());
  }

  await expect(page.locator('#Linear')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/^GPU memory limit /)).toBeVisible();
}

/** Starts the `Linear` load of the CT. */
async function clickLinear(page: Page): Promise<void> {
  await page.locator('#Linear').click();
}

/**
 * Waits for the end of the `Linear` load. A timeout states how many frames
 * arrived, which tells a slow network from a stalled load.
 */
async function waitForLinearLoad(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((volumeId) => {
          const volume = (
            window as unknown as TestWindow
          ).cornerstone.cache.getVolume(volumeId);

          return {
            loaded: Boolean(volume?.loadStatus?.loaded),
            frames: volume?.framesProcessed ?? 0,
          };
        }, CT_VOLUME_ID),
      { timeout: LOAD_TIMEOUT, intervals: [1000] }
    )
    .toMatchObject({ loaded: true });
}

/**
 * Catches the first pending record that a large allocation writes, in the
 * page, at the write itself: the record lives only until 5 s after the first
 * draw, which a slow machine can reach before a poll from the test sees it.
 * With `loseContext`, the context of the 3D viewport is lost at the write,
 * just before the upload. A loss in a later task can come after the settle
 * of the allocation on a busy machine, whose main thread is blocked for
 * seconds by the first draw, and then counts as no failure. Call it before
 * the click that starts the load, and read the record with
 * {@link readPendingRecord}.
 */
async function catchPendingRecord(
  page: Page,
  { loseContext = false } = {}
): Promise<void> {
  await page.evaluate(
    ({ prefix, lose }) => {
      const testWindow = window as unknown as TestWindow;
      const setItem = Storage.prototype.setItem;

      testWindow.gpuMemoryTest = {
        ...testWindow.gpuMemoryTest,
        pendingRecord: undefined,
      };
      Storage.prototype.setItem = function (
        this: Storage,
        key: string,
        value: string
      ) {
        setItem.call(this, key, value);

        if (!key.startsWith(prefix) || testWindow.gpuMemoryTest.pendingRecord) {
          return;
        }

        testWindow.gpuMemoryTest.pendingRecord = { key, value };

        if (lose) {
          const [engine] = testWindow.cornerstone.getRenderingEngines();
          const pool = engine.contextPool;

          pool.contexts[pool.viewportToContext.get('CT_VOLUME_3D')]
            .getOpenGLRenderWindow()
            .getContext()
            .getExtension('WEBGL_lose_context')
            .loseContext();
        }
      };
    },
    { prefix: PENDING_PREFIX, lose: loseContext }
  );
}

/** The pending record that {@link catchPendingRecord} caught. */
async function readPendingRecord(
  page: Page
): Promise<{ key: string; value: string }> {
  const handle = await page.waitForFunction(
    () => (window as unknown as TestWindow).gpuMemoryTest.pendingRecord,
    null,
    { timeout: 60_000 }
  );

  return handle.jsonValue();
}

/**
 * What the CT viewports show: the texture sets of the CT in the store, the
 * texture bytes of the page, the dimensions that each viewport draws, and a
 * hash of the pixels of each canvas.
 */
function readFrames(page: Page) {
  return page.evaluate(
    ({ volumeId, viewportIds }) => {
      const cs = (window as unknown as TestWindow).cornerstone;
      const [engine] = cs.getRenderingEngines();

      const hashOf = (canvas: HTMLCanvasElement) => {
        const copy = document.createElement('canvas');

        copy.width = canvas.width;
        copy.height = canvas.height;

        const context = copy.getContext('2d');

        context.drawImage(canvas, 0, 0);

        const { data } = context.getImageData(0, 0, copy.width, copy.height);
        let hash = 2166136261;

        for (let index = 0; index < data.length; index++) {
          hash = Math.imul(hash ^ data[index], 16777619);
        }

        return (hash >>> 0).toString(16);
      };

      const viewports = engine
        .getViewports()
        .filter((viewport) => viewportIds.includes(viewport.id));

      return {
        sets: cs.volumeTextureStore
          .setsOfVolume(volumeId)
          .map(({ name, references }) => ({ name, references })),
        textureBytes: cs.getGpuMemoryByKind().texture,
        dimensions: viewports.map((viewport) => {
          const { dataResolution, displayResolution } =
            viewport.getFidelityState();

          return displayResolution?.dimensions ?? dataResolution?.dimensions;
        }),
        hashes: viewports.map((viewport) => hashOf(viewport.canvas)),
      };
    },
    { volumeId: CT_VOLUME_ID, viewportIds: CT_VIEWPORT_IDS }
  );
}

/** Waits until the canvases stop changing, and returns what they show. */
async function readSettledFrames(page: Page) {
  let previous = await readFrames(page);

  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForTimeout(500);

    const current = await readFrames(page);

    if (current.hashes.join() === previous.hashes.join()) {
      return current;
    }

    previous = current;
  }

  throw new Error('The CT viewports kept changing');
}

/** Collects the `GPU_MEMORY_FAILURE` events of the page. */
async function recordFailures(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testWindow = window as unknown as TestWindow;
    const cs = testWindow.cornerstone;

    testWindow.gpuMemoryTest = {
      ...testWindow.gpuMemoryTest,
      failures: [],
    };
    cs.eventTarget.addEventListener(
      cs.Enums.Events.GPU_MEMORY_FAILURE,
      (event) => {
        const detail = (event as CustomEvent<FailureDetail>).detail;

        testWindow.gpuMemoryTest.failures.push({
          kind: detail.kind,
          failedBytes: detail.failedBytes,
          limitBytes: detail.limitBytes,
          limitSource: detail.limitSource,
          suggestedBytes: detail.suggestedBytes,
          mustReload: detail.mustReload,
        });
      }
    );
  });
}

/** The page shares the tab id, as a tab that the browser duplicated does. */
async function shareTabId(page: Page, tabId: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => window.sessionStorage.setItem(key, value),
    { key: TAB_ID_KEY, value: tabId }
  );
}

test.describe('GPU memory limits and failures', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
    'The context pool, the context loss and the Chromium wait for WebGL are tested in desktop Chromium'
  );
  test.skip(
    isCompatibilityMode(),
    'The GPU settings are core behaviour; the legacy run covers them, and CPU rendering turns them off'
  );
  test.use({ viewport: { width: 1600, height: 1400 } });

  test.beforeEach(async ({ context, page }) => {
    await emulateDesktopGpu(context);
    await hideDevServerOverlay(context);
    await retryRemoteFixtures(page, { hosts: DICOMWEB_HOSTS });
  });

  /**
   * GPULIM-U-8, GPULIM-U-7: a new limit applies at once to the volumes on
   * screen. Nothing in the test renders; the viewports must redraw, and the
   * texture of the old size must go.
   */
  test('a limit change redraws the viewports and frees the old texture at once', async ({
    page,
  }) => {
    test.setTimeout(LOAD_TIMEOUT + 90_000);

    await openExample(page);
    await clickLinear(page);
    await waitForLinearLoad(page);

    const full = await readSettledFrames(page);

    expect(full.sets).toEqual([
      { name: 'full-resolution/full-extent', references: 4 },
    ]);
    expect(full.textureBytes).toBeGreaterThan(0);
    expect(full.dimensions).toEqual(CT_VIEWPORT_IDS.map(() => [512, 512, 174]));

    await page.evaluate(
      (bytes) =>
        (window as unknown as TestWindow).cornerstone.setGpuMemoryLimit({
          bytes,
        }),
      256 * MEGABYTE
    );

    await expect
      .poll(
        async () => {
          const frames = await readFrames(page);

          return {
            sets: frames.sets,
            textureBytesBelowFull: frames.textureBytes < full.textureBytes,
            reducedDimensions: frames.dimensions.map(
              (dimensions) => dimensions[0] < 512 && dimensions[1] < 512
            ),
            redrawn: frames.hashes.map(
              (hash, index) => hash !== full.hashes[index]
            ),
          };
        },
        { timeout: 20_000 }
      )
      .toEqual({
        sets: [{ name: expect.stringMatching(/^reduced-/), references: 4 }],
        textureBytesBelowFull: true,
        reducedDimensions: CT_VIEWPORT_IDS.map(() => true),
        redrawn: CT_VIEWPORT_IDS.map(() => true),
      });

    await page.evaluate(
      (bytes) =>
        (window as unknown as TestWindow).cornerstone.setGpuMemoryLimit({
          bytes,
        }),
      2 * GIGABYTE
    );

    await expect
      .poll(() => readFrames(page), { timeout: 20_000 })
      .toEqual(full);
  });

  /**
   * GPULIM-U-14, GPULIM-U-8: a context lost during a large upload reports a
   * failure with a suggested limit; the user takes it in the popup, and the
   * limit stays after the page reloads.
   */
  test('a context loss during a large upload reports a failure, and the chosen limit survives a reload', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await openExample(page);
    await recordFailures(page);

    /** The loss comes while the pending record of the upload exists. */
    await catchPendingRecord(page, { loseContext: true });
    await clickLinear(page);

    const { value } = await readPendingRecord(page);
    const { totalBytes } = JSON.parse(value);

    const popup = page.getByText('GPU memory failure', { exact: true });

    await expect(popup).toBeVisible({ timeout: 20_000 });

    /** One failure, however many contexts of the pool report the loss. */
    await page.waitForTimeout(1000);
    expect(
      await page.evaluate(
        () => (window as unknown as TestWindow).gpuMemoryTest.failures
      )
    ).toEqual([
      {
        kind: 'contextLost',
        failedBytes: totalBytes,
        limitBytes: 2 * GIGABYTE,
        limitSource: 'start',
        suggestedBytes: 128 * MEGABYTE,
        mustReload: true,
      },
    ]);

    await page
      .getByRole('button', { name: 'Reload with 128 MB', exact: true })
      .click();
    await page.waitForURL(/gpuMemory=128MB/);
    await openExampleReady(page);

    const afterReload = await page.evaluate(() => {
      const cs = (window as unknown as TestWindow).cornerstone;

      return {
        limit: cs.getGpuMemoryLimit(),
        waiting: cs.getLastGpuMemoryFailure() ?? null,
        lastFailure: cs.getGpuMemoryHistory().lastFailure?.kind,
      };
    });

    expect(afterReload).toEqual({
      limit: { bytes: 128 * MEGABYTE, source: 'user', hard: false },
      waiting: null,
      lastFailure: 'contextLost',
    });
    await expect(popup).toBeHidden();

    /** The limit is stored: a load without the URL parameter keeps it. */
    await openExample(page);
    expect(
      await page.evaluate(() =>
        (window as unknown as TestWindow).cornerstone.getGpuMemoryLimit()
      )
    ).toEqual({ bytes: 128 * MEGABYTE, source: 'user', hard: false });
  });

  /**
   * GPULIM-U-3: the edge probe runs once for each device and browser; a later
   * page load reads the stored result. The probe searches the edge with
   * textures of N x 4 x 4 texels, a shape that no volume has, so a spy on
   * `texImage3D` counts the probe uploads of each page load.
   */
  test('the probe of the texture edge runs once per device', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const testWindow = window as unknown as TestWindow;
      const texImage3D = WebGL2RenderingContext.prototype.texImage3D;

      testWindow.gpuMemoryTest = {
        ...testWindow.gpuMemoryTest,
        probeUploads: 0,
      };
      WebGL2RenderingContext.prototype.texImage3D = function (
        this: WebGL2RenderingContext,
        ...args: unknown[]
      ) {
        const sizes = (args.slice(3, 6) as number[])
          .slice()
          .sort((a, b) => a - b);

        if (sizes[0] === 4 && sizes[1] === 4 && sizes[2] >= 16) {
          testWindow.gpuMemoryTest.probeUploads++;
        }

        return (texImage3D as (...values: unknown[]) => void).apply(this, args);
      } as typeof texImage3D;
    });

    const readProbe = () =>
      page.evaluate(() => {
        const testWindow = window as unknown as TestWindow;

        return {
          uploads: testWindow.gpuMemoryTest.probeUploads,
          record: testWindow.cornerstone.getStoredRenderingCapabilities(),
        };
      });

    await openExample(page);

    const first = await readProbe();

    expect(first.uploads).toBeGreaterThan(0);
    expect(first.record.probeVersion).toBe(5);
    expect(first.record.edge.reliable.successes).toBeGreaterThanOrEqual(1);
    expect(first.record.edge.reliable.value).toBeGreaterThanOrEqual(16);

    await page.reload();
    await openExampleReady(page);

    const second = await readProbe();

    expect(second.uploads).toBe(0);
    expect(second.record.probeMs).toBe(first.record.probeMs);
    expect(second.record.edge).toEqual(first.record.edge);
  });

  /**
   * GPULIM-I-15, GPULIM-U-15: a duplicated tab shares the tab id. Its start
   * finds the pending record of the first page, asks that page over the
   * `BroadcastChannel`, and records nothing while it answers. Once the first
   * page is gone, the same young record is a crash at the next start.
   */
  test('a duplicated tab is not taken for a crash, and a stopped page is', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);

    await openExample(page);

    const tabId = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      TAB_ID_KEY
    );
    await catchPendingRecord(page);
    await clickLinear(page);

    /** The record of a real allocation names the first page. */
    const { key, value } = await readPendingRecord(page);
    const record = JSON.parse(value);

    expect(key).toBe(PENDING_PREFIX + tabId);

    /** The first page settles its allocation and removes the record. */
    await expect
      .poll(() => page.evaluate((name) => localStorage.getItem(name), key), {
        timeout: 60_000,
      })
      .toBeNull();

    /**
     * The first page logs the questions on the channel and its answers, and
     * the record of its allocation is back, as while the upload ran.
     */
    await page.evaluate(
      ({ name, text }) => {
        const testWindow = window as unknown as TestWindow;
        const channel = new BroadcastChannel('cornerstone3D.pages');

        testWindow.gpuMemoryTest = {
          ...testWindow.gpuMemoryTest,
          pagesMessages: [],
        };
        channel.onmessage = (event) =>
          testWindow.gpuMemoryTest.pagesMessages.push(event.data);
        localStorage.setItem(name, text);
      },
      { name: key, text: JSON.stringify({ ...record, at: Date.now() }) }
    );

    const duplicate = await newPage(context);

    await shareTabId(duplicate, tabId);
    await openExample(duplicate);

    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as TestWindow).gpuMemoryTest.pagesMessages
          ),
        { timeout: 10_000 }
      )
      .toEqual([
        { type: 'alive?', pageId: record.page },
        { type: 'alive', pageId: record.page },
      ]);

    /** A crash would be counted within the wait of 300 ms for the answer. */
    await duplicate.waitForTimeout(1000);
    expect(
      await duplicate.evaluate(() => {
        const cs = (window as unknown as TestWindow).cornerstone;

        return {
          tabId: window.sessionStorage.getItem('cornerstone3D.tabId'),
          waiting: cs.getLastGpuMemoryFailure() ?? null,
          lastFailure: cs.getGpuMemoryHistory().lastFailure ?? null,
        };
      })
    ).toEqual({ tabId, waiting: null, lastFailure: null });
    await expect(
      duplicate.getByText('GPU memory failure', { exact: true })
    ).toBeHidden();

    /** The first page is gone, and its young record stays. */
    await page.close();
    await duplicate.evaluate(
      ({ name, text }) => localStorage.setItem(name, text),
      { name: key, text: JSON.stringify({ ...record, at: Date.now() }) }
    );

    const next = await newPage(context);

    await shareTabId(next, tabId);
    await openExample(next);

    await expect
      .poll(
        () =>
          next.evaluate(() => {
            const failure = (
              window as unknown as TestWindow
            ).cornerstone.getLastGpuMemoryFailure();

            return failure
              ? { kind: failure.kind, failedBytes: failure.failedBytes }
              : null;
          }),
        { timeout: 10_000 }
      )
      .toEqual({ kind: 'crash', failedBytes: record.totalBytes });
    await expect(
      next.getByText('The tab stopped during a large allocation', {
        exact: false,
      })
    ).toBeVisible();
    expect(
      await next.evaluate((name) => localStorage.getItem(name), key)
    ).toBeNull();
  });

  /**
   * GPULIM-U-16, GPULIM-I-19: a wait for WebGL that one tab stores reaches
   * every tab through the storage event, and so does its end.
   */
  test('a wait for WebGL reaches every tab and ends in every tab', async ({
    page,
    context,
  }) => {
    const other = await newPage(context);

    await openExample(page);
    await openExample(other);
    await other.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      const cs = testWindow.cornerstone;

      testWindow.gpuMemoryTest = {
        ...testWindow.gpuMemoryTest,
        webglEvents: [],
      };
      cs.eventTarget.addEventListener(
        cs.Enums.Events.WEBGL_AVAILABILITY_CHANGED,
        (event) =>
          testWindow.gpuMemoryTest.webglEvents.push({
            ...(event as CustomEvent<Record<string, unknown>>).detail,
          })
      );
    });

    const readOther = () =>
      other.evaluate(() => {
        const testWindow = window as unknown as TestWindow;

        return {
          blocked: testWindow.cornerstone.isWebGLBlocked(),
          events: testWindow.gpuMemoryTest.webglEvents,
          availableAt: testWindow.gpuMemoryTest.availableAt ?? null,
        };
      });

    /** The first page stores a wait, as `startWebGLBlock` does. */
    const until = await page.evaluate((name) => {
      const end = Date.now() + 60_000;

      localStorage.setItem(
        name,
        JSON.stringify({ until: end, reason: 'cooldown', at: Date.now() })
      );

      return end;
    }, WEBGL_BLOCK_KEY);

    await expect.poll(readOther, { timeout: 10_000 }).toEqual({
      blocked: true,
      events: [
        { blocked: true, until, reason: 'cooldown', sourceTab: 'other' },
      ],
      availableAt: null,
    });
    await expect(
      other.getByText('Another tab of this site had a GPU failure', {
        exact: false,
      })
    ).toBeVisible();

    await other.evaluate(() => {
      const testWindow = window as unknown as TestWindow;

      testWindow.cornerstone
        .whenWebGLAvailable()
        .then(() => (testWindow.gpuMemoryTest.availableAt = Date.now()));
    });

    /** The wait ends long before its time, in the first page. */
    await page.evaluate(
      (name) => localStorage.removeItem(name),
      WEBGL_BLOCK_KEY
    );

    await expect.poll(readOther, { timeout: 10_000 }).toEqual({
      blocked: false,
      events: [
        { blocked: true, until, reason: 'cooldown', sourceTab: 'other' },
        { blocked: false, sourceTab: 'other' },
      ],
      availableAt: expect.any(Number),
    });
    await expect(
      other.getByText('Another tab of this site had a GPU failure', {
        exact: false,
      })
    ).toBeHidden();
  });
});

/** Waits for the example after a navigation that the page made itself. */
async function openExampleReady(page: Page): Promise<void> {
  await expect(page.locator('#Linear')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/^GPU memory limit /)).toBeVisible();
}
