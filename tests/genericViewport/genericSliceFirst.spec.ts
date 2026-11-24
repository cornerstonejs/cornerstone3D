import { expect, test, type Page } from '@playwright/test';
import { createExampleUrl, waitForRenderSettled } from '../utils/index';
import {
  compareViewportPixels,
  countContentPixels,
  readViewportPixels,
  type ViewportPixels,
} from '../utils/viewportPixels';

const EXAMPLE = 'genericVolumeAnnotationTools';
const ENGINE_ID = 'myRenderingEngine';
const VIEWPORT_IDS = [
  'CT_AXIAL_STACK',
  'CT_SAGITTAL_STACK',
  'CT_OBLIQUE_STACK',
];
const ALIGNED_VIEWPORT_INDICES = [0, 1];
const VOLUME_ID = 'cornerstoneStreamingImageVolume:CT_VOLUME_ID';
const DATA_ID = 'volume-annotation-tools-next:source';
/** The draw path (`slice-draw` of a render plan layer) of a GPU volume slice. */
const GPU_VOLUME_MODE = 'gpuVolume-gpu';
/** The draw path of a slice cut on the CPU and drawn on the GPU. */
const SAMPLED_MODE = 'cpu-gpu';
/** The render mode that the debug modal names for a slice cut on the CPU. */
const SAMPLED_MODE_LABEL = 'vtkCpuSlice';
const MAX_GREY_DIFFERENCE = 3;
/**
 * The part of a canvas that must be content, not background, before two
 * pictures are compared. A CT slice of the example fills far more.
 */
const MIN_CONTENT_FRACTION = 0.05;
const LOAD_TIMEOUT_MS = 90000;
const SWITCH_TIMEOUT_MS = 15000;

type TestViewport = {
  getActors: () => Array<{
    referencedId?: string;
    displaySetId?: string;
  }>;
  getRenderPlan: () => Array<{
    displaySetId: string;
    slice: string;
    draw: string;
  }>;
  scroll: (delta: number) => Promise<string>;
  getZoom: () => number;
  setZoom: (zoom: number) => void;
  setDisplaySetAppearance: (
    displaySetId: string,
    props: { slabThickness?: number; blendMode?: number }
  ) => void;
  render: () => void;
};

type TestWindow = typeof window & {
  cornerstone: {
    getRenderingEngine: (id: string) => {
      getViewport: (viewportId: string) => TestViewport | undefined;
    };
    setSliceFirst: (enabled: boolean) => void;
    cache: {
      getVolume: (
        volumeId: string
      ) => { loadStatus?: { loaded?: boolean } } | undefined;
    };
    ImageVolume: { textureBytesUsed: number };
    Enums: { BlendModes: Record<string, number> };
  };
};

/**
 * Opens the example with slice first set by the URL, whatever
 * PLAYWRIGHT_SLICE_FIRST says, and waits until the volume has loaded and the
 * viewports have rendered.
 */
async function openExample(page: Page, sliceFirst: boolean): Promise<void> {
  const url = createExampleUrl(EXAMPLE + '.html');

  url.searchParams.set('sliceFirst', sliceFirst ? '1' : '0');

  await page.goto(url.toString());
  await page.waitForSelector('div#content', { timeout: 30000 });
  await page.waitForSelector('#content canvas:visible', { timeout: 30000 });
  await page.waitForFunction(
    (volumeId) =>
      (window as TestWindow).cornerstone?.cache?.getVolume(volumeId)?.loadStatus
        ?.loaded === true,
    VOLUME_ID,
    { timeout: LOAD_TIMEOUT_MS }
  );
  await expectSourceRenderModes(
    page,
    sliceFirst ? SAMPLED_MODE : GPU_VOLUME_MODE
  );
  await waitForRenderSettled(page, { quietMs: 500, timeout: 30000 });
}

/** Returns the draw path of the source volume actor of every viewport. */
function getSourceRenderModes(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ engineId, viewportIds, volumeId }) => {
      const engine = (window as TestWindow).cornerstone.getRenderingEngine(
        engineId
      );

      return viewportIds.map((viewportId) => {
        const viewport = engine?.getViewport(viewportId);
        const entry = viewport
          ?.getActors()
          .find((actorEntry) => actorEntry.referencedId === volumeId);
        const layer = viewport
          ?.getRenderPlan()
          .find((planLayer) => planLayer.displaySetId === entry?.displaySetId);

        return layer ? `${layer.slice}-${layer.draw}` : 'missing';
      });
    },
    { engineId: ENGINE_ID, viewportIds: VIEWPORT_IDS, volumeId: VOLUME_ID }
  );
}

/** Waits until every viewport draws its source with the given draw path. */
async function expectSourceRenderModes(
  page: Page,
  renderMode: string
): Promise<void> {
  await expect
    .poll(() => getSourceRenderModes(page), { timeout: SWITCH_TIMEOUT_MS })
    .toEqual(VIEWPORT_IDS.map(() => renderMode));
}

/** Switches slice first in the running page and waits for the new draw path. */
async function switchSliceFirst(page: Page, enabled: boolean): Promise<void> {
  await page.evaluate((value) => {
    (window as TestWindow).cornerstone.setSliceFirst(value);
  }, enabled);
  await expectSourceRenderModes(page, enabled ? SAMPLED_MODE : GPU_VOLUME_MODE);
  await waitForRenderSettled(page, { quietMs: 500 });
}

/** Reads the pixels of the axis aligned viewports. */
async function readAlignedViewports(page: Page): Promise<ViewportPixels[]> {
  const reads: ViewportPixels[] = [];

  for (const index of ALIGNED_VIEWPORT_INDICES) {
    reads.push(await readViewportPixels(page, index));
  }

  return reads;
}

/** Checks that every picture shows content, so blank canvases do not compare equal. */
function expectContent(pictures: ViewportPixels[], label: string): void {
  pictures.forEach((picture, index) => {
    const name = `${label}, ${VIEWPORT_IDS[ALIGNED_VIEWPORT_INDICES[index]]}`;
    const contentPixels = countContentPixels(picture);

    expect(
      contentPixels,
      `${name}: pixels that are not background, of ${picture.width * picture.height}`
    ).toBeGreaterThanOrEqual(
      picture.width * picture.height * MIN_CONTENT_FRACTION
    );
  });
}

/**
 * Reads the GPU volume picture, switches slice first on and checks that the
 * sampled picture is within MAX_GREY_DIFFERENCE of it, after checking that
 * both show content (`expectContent`), then switches back and
 * checks that the GPU volume picture is exactly the first one again.
 */
async function expectSamePictureOnBothPaths(
  page: Page,
  label: string
): Promise<void> {
  const gpuPictures = await readAlignedViewports(page);

  expectContent(gpuPictures, `${label}, GPU volume path`);

  await switchSliceFirst(page, true);

  const sampledPictures = await readAlignedViewports(page);

  expectContent(sampledPictures, `${label}, sampled path`);

  sampledPictures.forEach((picture, index) => {
    const difference = compareViewportPixels(gpuPictures[index], picture);
    const name = `${label}, ${VIEWPORT_IDS[ALIGNED_VIEWPORT_INDICES[index]]}`;

    expect(difference.sameSize, `${name}: canvas size`).toBe(true);
    expect(
      difference.maxDifference,
      `${name}: largest difference (${difference.differingPixels} pixels differ)`
    ).toBeLessThanOrEqual(MAX_GREY_DIFFERENCE);
  });

  await switchSliceFirst(page, false);

  const gpuPicturesAgain = await readAlignedViewports(page);

  gpuPicturesAgain.forEach((picture, index) => {
    const difference = compareViewportPixels(gpuPictures[index], picture);
    const name = `${label}, ${VIEWPORT_IDS[ALIGNED_VIEWPORT_INDICES[index]]}`;

    expect(
      difference.maxDifference,
      `${name}: GPU volume picture after switching back (${difference.differingPixels} pixels differ)`
    ).toBe(0);
  });
}

/** Scrolls every viewport by the given number of slices. */
async function scrollViewports(page: Page, delta: number): Promise<void> {
  await page.evaluate(
    async ({ engineId, viewportIds, delta }) => {
      const engine = (window as TestWindow).cornerstone.getRenderingEngine(
        engineId
      );

      for (const viewportId of viewportIds) {
        await engine.getViewport(viewportId)?.scroll(delta);
      }
    },
    { engineId: ENGINE_ID, viewportIds: VIEWPORT_IDS, delta }
  );
  await waitForRenderSettled(page, { quietMs: 500 });
}

/** Multiplies the zoom of every viewport by the given factor. */
async function zoomViewports(page: Page, factor: number): Promise<void> {
  await page.evaluate(
    ({ engineId, viewportIds, factor }) => {
      const engine = (window as TestWindow).cornerstone.getRenderingEngine(
        engineId
      );

      for (const viewportId of viewportIds) {
        const viewport = engine.getViewport(viewportId);

        viewport?.setZoom(viewport.getZoom() * factor);
        viewport?.render();
      }
    },
    { engineId: ENGINE_ID, viewportIds: VIEWPORT_IDS, factor }
  );
  await waitForRenderSettled(page, { quietMs: 500 });
}

/** Sets the slab of the source display set of one viewport. */
async function setSlab(
  page: Page,
  viewportId: string,
  slabThickness: number,
  blendModeName: string
): Promise<void> {
  await page.evaluate(
    ({ engineId, viewportId, displaySetId, slabThickness, blendModeName }) => {
      const { cornerstone } = window as TestWindow;
      const viewport = cornerstone
        .getRenderingEngine(engineId)
        .getViewport(viewportId);

      viewport?.setDisplaySetAppearance(displaySetId, {
        slabThickness,
        blendMode: cornerstone.Enums.BlendModes[blendModeName],
      });
      viewport?.render();
    },
    {
      engineId: ENGINE_ID,
      viewportId,
      displaySetId: DATA_ID,
      slabThickness,
      blendModeName,
    }
  );
}

/** Returns the draw path of the source volume actor of one viewport. */
async function getViewportRenderMode(
  page: Page,
  viewportId: string
): Promise<string> {
  const modes = await getSourceRenderModes(page);

  return modes[VIEWPORT_IDS.indexOf(viewportId)];
}

/** Returns the bytes that the 3D textures of every volume take. */
function getTextureBytesUsed(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as TestWindow).cornerstone.ImageVolume.textureBytesUsed
  );
}

const DEBUG_EXAMPLE = 'genericSliceFirst';
const DEBUG_EXAMPLE_VIEWPORT_IDS = [
  'CT_AXIAL',
  'CT_SAGITTAL',
  'FUSION_CORONAL',
  'CT_OBLIQUE',
];
const DEBUG_EXAMPLE_VOLUME_IDS = [
  'cornerstoneStreamingImageVolume:SLICE_FIRST_CT',
  'cornerstoneStreamingImageVolume:SLICE_FIRST_PT',
];
const GPU_MEMORY_PATTERN =
  /3D volumes ([\d.]+) MB, 2D slices (?:about )?([\d.]+) MB/;

/**
 * Opens the slice first example with the given extra address parameters and
 * waits until both volumes have loaded.
 */
async function openDebugExample(
  page: Page,
  parameters: Record<string, string> = {}
): Promise<void> {
  const url = createExampleUrl(DEBUG_EXAMPLE + '.html');

  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value);
  }

  await page.goto(url.toString());
  await page.waitForSelector('.slice-first-viewport canvas', {
    timeout: 30000,
  });
  await page.waitForFunction(
    (volumeIds) =>
      volumeIds.every(
        (volumeId) =>
          (window as TestWindow).cornerstone?.cache?.getVolume(volumeId)
            ?.loadStatus?.loaded === true
      ),
    DEBUG_EXAMPLE_VOLUME_IDS,
    { timeout: LOAD_TIMEOUT_MS }
  );
  await waitForRenderSettled(page, { quietMs: 500, timeout: 30000 });
}

/** Returns the draw paths of every actor of every viewport of the slice first example. */
function getDebugExampleRenderModes(page: Page): Promise<string[][]> {
  return page.evaluate(
    ({ engineId, viewportIds }) => {
      const engine = (window as TestWindow).cornerstone.getRenderingEngine(
        engineId
      );

      return viewportIds.map((viewportId) => {
        const viewport = engine?.getViewport(viewportId);
        const plan = viewport?.getRenderPlan() ?? [];

        return (
          viewport?.getActors().map((entry) => {
            const layer = plan.find(
              (planLayer) => planLayer.displaySetId === entry.displaySetId
            );

            return layer ? `${layer.slice}-${layer.draw}` : 'missing';
          }) ?? []
        );
      });
    },
    { engineId: ENGINE_ID, viewportIds: DEBUG_EXAMPLE_VIEWPORT_IDS }
  );
}

/** Reads the 3D and 2D texture totals of the GPU memory line of the debug modal. */
async function readGpuMemoryTotals(
  page: Page
): Promise<{ volumeMB: number; sliceMB: number } | undefined> {
  const text = await page.locator('body').innerText();
  const match = GPU_MEMORY_PATTERN.exec(text);

  return match
    ? { volumeMB: Number(match[1]), sliceMB: Number(match[2]) }
    : undefined;
}

test.describe('Slice first', () => {
  test.setTimeout(240000);

  test('draws the same picture as the GPU volume path', async ({ page }) => {
    await openExample(page, false);

    await expectSamePictureOnBothPaths(page, 'initial view');

    await scrollViewports(page, 5);
    await expectSamePictureOnBothPaths(page, 'after a scroll of 5 slices');

    await zoomViewports(page, 1.8);
    await expectSamePictureOnBothPaths(page, 'after a zoom');
  });

  test('makes no 3D texture for a scalar volume without a slab', async ({
    page,
  }) => {
    await openExample(page, true);

    expect(await getTextureBytesUsed(page)).toBe(0);

    await switchSliceFirst(page, false);

    await expect
      .poll(() => getTextureBytesUsed(page), { timeout: SWITCH_TIMEOUT_MS })
      .toBeGreaterThan(0);
  });

  test('moves a thick slab to the GPU volume path and back', async ({
    page,
  }) => {
    const viewportId = VIEWPORT_IDS[0];

    await openExample(page, true);

    await setSlab(page, viewportId, 50000, 'MAXIMUM_INTENSITY_BLEND');
    await expect
      .poll(() => getViewportRenderMode(page, viewportId), {
        timeout: SWITCH_TIMEOUT_MS,
      })
      .toBe(GPU_VOLUME_MODE);
    expect(await getViewportRenderMode(page, VIEWPORT_IDS[1])).toBe(
      SAMPLED_MODE
    );

    await setSlab(page, viewportId, 0, 'COMPOSITE');
    await expect
      .poll(() => getViewportRenderMode(page, viewportId), {
        timeout: SWITCH_TIMEOUT_MS,
      })
      .toBe(SAMPLED_MODE);
  });
  test('shows the bindings of every viewport in the debug modal by default', async ({
    page,
  }) => {
    await openDebugExample(page);

    await expect
      .poll(() => getDebugExampleRenderModes(page), {
        timeout: SWITCH_TIMEOUT_MS,
      })
      .toEqual([
        [SAMPLED_MODE],
        [SAMPLED_MODE],
        [SAMPLED_MODE, SAMPLED_MODE],
        [SAMPLED_MODE],
      ]);

    await expect(page.getByText('VIEWPORT BINDINGS')).toBeVisible();

    for (const viewportId of DEBUG_EXAMPLE_VIEWPORT_IDS) {
      const section = page
        .locator(`div[title="${ENGINE_ID}/${viewportId}"]`)
        .locator('..');

      await expect(section).toContainText(SAMPLED_MODE_LABEL, {
        timeout: SWITCH_TIMEOUT_MS,
      });
      await expect(section).toContainText('2D slice');
    }

    await expect
      .poll(() => readGpuMemoryTotals(page), { timeout: SWITCH_TIMEOUT_MS })
      .toMatchObject({ volumeMB: 0 });

    const totals = await readGpuMemoryTotals(page);

    expect(totals?.sliceMB).toBeGreaterThan(0);
  });

  test('hides the debug modal with debug=false', async ({ page }) => {
    await openDebugExample(page, { debug: 'false' });

    await page.waitForTimeout(1500);
    await expect(page.getByText('VIEWPORT BINDINGS')).toHaveCount(0);
  });
});
