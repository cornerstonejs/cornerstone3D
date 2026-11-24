import { expect, test, type Page } from '@playwright/test';
import { createExampleUrl, waitForRenderSettled } from '../utils/index';
import {
  compareViewportPixels,
  countContentPixels,
  readViewportPixels,
  type ViewportPixels,
} from '../utils/viewportPixels';

const EXAMPLE = 'genericSliceFirst';
const ENGINE_ID = 'myRenderingEngine';
const CORONAL_VIEWPORT_ID = 'FUSION_CORONAL';
/** The coronal fusion viewport is the third viewport of the example. */
const CORONAL_VIEWPORT_INDEX = 2;
const CT_DATA_ID = 'slice-first:ct';
const PT_DATA_ID = 'slice-first:pt';
const CT_VOLUME_ID = 'cornerstoneStreamingImageVolume:SLICE_FIRST_CT';
const PT_VOLUME_ID = 'cornerstoneStreamingImageVolume:SLICE_FIRST_PT';
const GPU_VOLUME_MODE = 'vtkVolumeSlice';
const SAMPLED_MODE = 'vtkSampledSlice';
const MAX_GREY_DIFFERENCE = 3;
/** The part of the canvas that must be content, not background. */
const MIN_CONTENT_FRACTION = 0.05;
/**
 * A frame shows the picture of a stop when it differs from it in at most this
 * many pixels by more than FRAME_TOLERANCE grey levels.
 */
const FRAME_PIXEL_TOLERANCE = 20;
const FRAME_TOLERANCE = 8;
/**
 * The part of the canvas where a PT drawn by the sampled path may differ from
 * the PT of the GPU volume path, at the edges of its field of view. A CT that
 * is hidden behind the PT changes about half of the canvas.
 */
const MAX_PATH_EDGE_FRACTION = 0.01;
const STOPS = [10, 40, 300, 10];
const LOAD_TIMEOUT_MS = 180000;
const SWITCH_TIMEOUT_MS = 20000;

type TestViewport = {
  getActors: () => Array<{
    referencedId?: string;
    actorMapper?: { renderMode?: string };
  }>;
  setDisplaySetPresentation: (
    displaySetId: string,
    props: { slabThickness?: number; blendMode?: number }
  ) => void;
  render: () => void;
};

type FrameRecorder = {
  frames: Uint8ClampedArray[];
  marks: number[];
  running: boolean;
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
  sliceFirstSlabRecorder?: FrameRecorder;
};

/**
 * Opens the example with slice first set by the URL and waits until both
 * volumes have loaded and the coronal viewport draws the CT and the PT.
 */
async function openExample(page: Page, sliceFirst: boolean): Promise<void> {
  const url = createExampleUrl(EXAMPLE + '.html');

  url.searchParams.set('sliceFirst', sliceFirst ? '1' : '0');

  await page.goto(url.toString());
  await page.waitForSelector('.slice-first-viewport canvas', {
    timeout: 30000,
  });
  await page.waitForFunction(
    ({ engineId, viewportId, volumeIds }) => {
      const { cornerstone } = window as TestWindow;
      const viewport = cornerstone
        ?.getRenderingEngine(engineId)
        ?.getViewport(viewportId);

      return (
        (viewport?.getActors().length ?? 0) >= 2 &&
        volumeIds.every(
          (volumeId) =>
            cornerstone.cache.getVolume(volumeId)?.loadStatus?.loaded === true
        )
      );
    },
    {
      engineId: ENGINE_ID,
      viewportId: CORONAL_VIEWPORT_ID,
      volumeIds: [CT_VOLUME_ID, PT_VOLUME_ID],
    },
    { timeout: LOAD_TIMEOUT_MS }
  );
  await expectCoronalModes(page, sliceFirst ? SAMPLED_MODE : GPU_VOLUME_MODE);
  await waitForRenderSettled(page, { quietMs: 800, timeout: 30000 });
}

/** The render modes of the CT and the PT actor of the coronal viewport. */
function getCoronalModes(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ engineId, viewportId, volumeIds }) => {
      const actors =
        (window as TestWindow).cornerstone
          .getRenderingEngine(engineId)
          ?.getViewport(viewportId)
          ?.getActors() ?? [];

      return volumeIds.map(
        (volumeId) =>
          actors.find((actor) => actor.referencedId === volumeId)?.actorMapper
            ?.renderMode ?? 'missing'
      );
    },
    {
      engineId: ENGINE_ID,
      viewportId: CORONAL_VIEWPORT_ID,
      volumeIds: [CT_VOLUME_ID, PT_VOLUME_ID],
    }
  );
}

/**
 * Waits until the CT and the PT of the coronal viewport use the render mode,
 * or the CT the first and the PT the second.
 */
async function expectCoronalModes(
  page: Page,
  renderMode: string,
  ptRenderMode = renderMode
): Promise<void> {
  await expect
    .poll(() => getCoronalModes(page), { timeout: SWITCH_TIMEOUT_MS })
    .toEqual([renderMode, ptRenderMode]);
}

/**
 * Sets the slab of both display sets of the coronal viewport, as the slab
 * controls of the example do: a thickness of 0 with composite is no slab.
 */
async function setCoronalSlab(
  page: Page,
  slabThickness: number,
  blendModeName: string,
  displaySetIds = [CT_DATA_ID, PT_DATA_ID]
): Promise<void> {
  await page.evaluate(
    ({ engineId, viewportId, displaySetIds, slabThickness, blendModeName }) => {
      const { cornerstone } = window as TestWindow;
      const viewport = cornerstone
        .getRenderingEngine(engineId)
        .getViewport(viewportId);

      for (const displaySetId of displaySetIds) {
        viewport?.setDisplaySetPresentation(displaySetId, {
          slabThickness,
          blendMode: cornerstone.Enums.BlendModes[blendModeName],
        });
      }

      viewport?.render();
    },
    {
      engineId: ENGINE_ID,
      viewportId: CORONAL_VIEWPORT_ID,
      displaySetIds,
      slabThickness,
      blendModeName,
    }
  );
}

/** Sets a MIP slab and waits until the coronal viewport draws it. */
async function setMip(
  page: Page,
  slabThickness: number,
  renderMode: string
): Promise<void> {
  await setCoronalSlab(page, slabThickness, 'MAXIMUM_INTENSITY_BLEND');
  await expectCoronalModes(page, renderMode);
  await waitForRenderSettled(page, { quietMs: 800, timeout: 30000 });
}

/** Turns the slab off and waits until the coronal viewport draws it. */
async function setSlabOff(page: Page, renderMode: string): Promise<void> {
  await setCoronalSlab(page, 0, 'COMPOSITE');
  await expectCoronalModes(page, renderMode);
  await waitForRenderSettled(page, { quietMs: 800, timeout: 30000 });
}

/** Switches slice first and waits for the render mode of the coronal viewport. */
async function switchSliceFirst(
  page: Page,
  enabled: boolean,
  renderMode: string
): Promise<void> {
  await page.evaluate((value) => {
    (window as TestWindow).cornerstone.setSliceFirst(value);
  }, enabled);
  await expectCoronalModes(page, renderMode);
  await waitForRenderSettled(page, { quietMs: 800, timeout: 30000 });
}

function readCoronal(page: Page): Promise<ViewportPixels> {
  return readViewportPixels(page, CORONAL_VIEWPORT_INDEX, { stableMs: 500 });
}

function getTextureBytesUsed(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as TestWindow).cornerstone.ImageVolume.textureBytesUsed
  );
}

/** Checks that a picture shows content, so blank canvases do not compare equal. */
function expectContent(picture: ViewportPixels, label: string): void {
  expect(
    countContentPixels(picture),
    `${label}: pixels that are not background, of ${picture.width * picture.height}`
  ).toBeGreaterThanOrEqual(
    picture.width * picture.height * MIN_CONTENT_FRACTION
  );
}

/** Checks that two pictures are the same within MAX_GREY_DIFFERENCE. */
function expectSamePicture(
  first: ViewportPixels,
  second: ViewportPixels,
  label: string
): void {
  const difference = compareViewportPixels(first, second);

  expect(difference.sameSize, `${label}: canvas size`).toBe(true);
  expect(
    difference.maxDifference,
    `${label}: largest difference (${difference.differingPixels} pixels differ)`
  ).toBeLessThanOrEqual(MAX_GREY_DIFFERENCE);
}

/** The number of pixels where R, G or B differ by more than `tolerance`. */
function countPixelsDifferingBy(
  first: ViewportPixels,
  second: ViewportPixels,
  tolerance: number
): number {
  let pixels = 0;

  for (let offset = 0; offset < first.data.length; offset += 4) {
    if (
      Math.abs(first.data[offset] - second.data[offset]) > tolerance ||
      Math.abs(first.data[offset + 1] - second.data[offset + 1]) > tolerance ||
      Math.abs(first.data[offset + 2] - second.data[offset + 2]) > tolerance
    ) {
      pixels++;
    }
  }

  return pixels;
}

/**
 * Starts to keep every frame of the coronal canvas that differs from the
 * frame before it, read once per animation frame.
 */
async function startFrameRecorder(page: Page): Promise<void> {
  await page.evaluate((viewportIndex) => {
    const testWindow = window as TestWindow;
    const recorder: FrameRecorder = { frames: [], marks: [], running: true };
    const scratch = document.createElement('canvas');
    const context = scratch.getContext('2d', { willReadFrequently: true });
    const read = () => {
      const element = document.querySelectorAll('[data-viewport-uid]')[
        viewportIndex
      ] as HTMLElement;
      const canvas =
        (element.querySelector(
          'canvas:not([style*="display: none"])'
        ) as HTMLCanvasElement | null) ??
        (element.querySelector('canvas') as HTMLCanvasElement);

      scratch.width = canvas.width;
      scratch.height = canvas.height;
      context.drawImage(canvas, 0, 0);

      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const sameAsLast = (frame: Uint8ClampedArray) => {
      const last = recorder.frames[recorder.frames.length - 1];

      if (!last || last.length !== frame.length) {
        return false;
      }

      for (let i = 0; i < frame.length; i++) {
        if (last[i] !== frame[i]) {
          return false;
        }
      }

      return true;
    };
    const tick = () => {
      if (!recorder.running) {
        return;
      }

      const frame = read();

      if (!sameAsLast(frame)) {
        recorder.frames.push(frame);
      }

      requestAnimationFrame(tick);
    };

    testWindow.sliceFirstSlabRecorder = recorder;
    recorder.frames.push(read());
    requestAnimationFrame(tick);
  }, CORONAL_VIEWPORT_INDEX);
}

/** Marks the last kept frame as the picture of a stop. */
async function markStop(page: Page): Promise<void> {
  await page.evaluate(() => {
    const recorder = (window as TestWindow).sliceFirstSlabRecorder;

    recorder.marks.push(recorder.frames.length - 1);
  });
}

/**
 * Stops the recorder and returns, for each step between two stops, the
 * frames that show neither the picture of the stop before nor the one of the
 * stop after.
 */
async function stopFrameRecorder(
  page: Page
): Promise<Array<{ step: number; frames: number; intermediate: number[] }>> {
  return page.evaluate(
    ({ pixelTolerance, tolerance }) => {
      const recorder = (window as TestWindow).sliceFirstSlabRecorder;

      recorder.running = false;

      const differs = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
        if (a.length !== b.length) {
          return true;
        }

        let pixels = 0;

        for (let i = 0; i < a.length; i += 4) {
          if (
            Math.abs(a[i] - b[i]) > tolerance ||
            Math.abs(a[i + 1] - b[i + 1]) > tolerance ||
            Math.abs(a[i + 2] - b[i + 2]) > tolerance
          ) {
            pixels++;
          }
        }

        return pixels > pixelTolerance;
      };
      const { frames, marks } = recorder;

      return marks.slice(1).map((mark, index) => {
        const start = marks[index];
        const intermediate: number[] = [];

        for (let i = start + 1; i < mark; i++) {
          if (
            differs(frames[i], frames[start]) &&
            differs(frames[i], frames[mark])
          ) {
            intermediate.push(i - start);
          }
        }

        return { step: index, frames: mark - start, intermediate };
      });
    },
    { pixelTolerance: FRAME_PIXEL_TOLERANCE, tolerance: FRAME_TOLERANCE }
  );
}

test.describe('Slice first with a slab', () => {
  test.setTimeout(420000);

  test('draws any slab on the GPU volume path with the CT visible, and frees the 3D texture when the slab is off', async ({
    page,
  }) => {
    await openExample(page, false);

    const gpuPictures = new Map<number, ViewportPixels>();

    for (const thickness of STOPS) {
      await setMip(page, thickness, GPU_VOLUME_MODE);
      gpuPictures.set(thickness, await readCoronal(page));
    }

    await setSlabOff(page, GPU_VOLUME_MODE);
    await switchSliceFirst(page, true, SAMPLED_MODE);

    await expect
      .poll(() => getTextureBytesUsed(page), { timeout: SWITCH_TIMEOUT_MS })
      .toBe(0);

    const plainPicture = await readCoronal(page);

    expectContent(plainPicture, 'plain slice');

    await startFrameRecorder(page);
    await markStop(page);

    for (const thickness of STOPS) {
      await setMip(page, thickness, GPU_VOLUME_MODE);
      await markStop(page);

      const picture = await readCoronal(page);
      const label = `MIP ${thickness} mm with slice first`;

      expectContent(picture, label);
      expectSamePicture(
        gpuPictures.get(thickness),
        picture,
        `${label} against slice first off`
      );
      expect(
        await getTextureBytesUsed(page),
        `${label}: bytes of 3D textures`
      ).toBeGreaterThan(0);
    }

    await setSlabOff(page, SAMPLED_MODE);
    await markStop(page);

    const steps = await stopFrameRecorder(page);

    steps.forEach(({ step, frames, intermediate }) => {
      expect(
        intermediate,
        `step ${step}: frames (of ${frames} kept) that show neither stop`
      ).toEqual([]);
    });

    expectSamePicture(
      plainPicture,
      await readCoronal(page),
      'plain slice after the slab'
    );
    await expect
      .poll(() => getTextureBytesUsed(page), { timeout: SWITCH_TIMEOUT_MS })
      .toBe(0);
  });

  test('keeps the CT visible when only the CT moves to the GPU volume path', async ({
    page,
  }) => {
    await openExample(page, false);

    await setCoronalSlab(page, 40, 'MAXIMUM_INTENSITY_BLEND', [CT_DATA_ID]);
    await waitForRenderSettled(page, { quietMs: 800, timeout: 30000 });

    const gpuPicture = await readCoronal(page);

    expectContent(gpuPicture, 'CT MIP 40 mm with slice first off');

    await setCoronalSlab(page, 0, 'COMPOSITE', [CT_DATA_ID]);
    await switchSliceFirst(page, true, SAMPLED_MODE);
    await setCoronalSlab(page, 40, 'MAXIMUM_INTENSITY_BLEND', [CT_DATA_ID]);
    await expectCoronalModes(page, GPU_VOLUME_MODE, SAMPLED_MODE);
    await waitForRenderSettled(page, { quietMs: 800, timeout: 30000 });

    const picture = await readCoronal(page);
    const differingPixels = countPixelsDifferingBy(
      gpuPicture,
      picture,
      FRAME_TOLERANCE
    );

    expect(
      differingPixels,
      'CT MIP 40 mm on the GPU volume path under a sampled PT: pixels that differ by more than ' +
        `${FRAME_TOLERANCE} grey levels from the picture with slice first off`
    ).toBeLessThanOrEqual(
      picture.width * picture.height * MAX_PATH_EDGE_FRACTION
    );
  });

  test('switches slice first with no intermediate picture', async ({
    page,
  }) => {
    await openExample(page, true);

    await startFrameRecorder(page);
    await markStop(page);

    for (const enabled of [false, true, false, true]) {
      await switchSliceFirst(
        page,
        enabled,
        enabled ? SAMPLED_MODE : GPU_VOLUME_MODE
      );
      await markStop(page);
    }

    const steps = await stopFrameRecorder(page);

    steps.forEach(({ step, frames, intermediate }) => {
      expect(
        intermediate,
        `switch ${step}: frames (of ${frames} kept) that show neither stop`
      ).toEqual([]);
    });
  });
});
