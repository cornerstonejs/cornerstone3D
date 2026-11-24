import { expect, test, type Page } from '@playwright/test';
import { createExampleUrl, waitForRenderSettled } from '../utils/index';
import {
  countContentPixels,
  countPixelsDifferingBy,
  readViewportPixels,
  type ViewportPixels,
} from '../utils/viewportPixels';

const EXAMPLE = 'genericSliceFirst';
const ENGINE_ID = 'myRenderingEngine';
const VIEWPORT_IDS = [
  'CT_AXIAL',
  'CT_SAGITTAL',
  'FUSION_CORONAL',
  'CT_OBLIQUE',
];
const CT_DATA_ID = 'slice-first:ct';
const PT_DATA_ID = 'slice-first:pt';
const VOLUME_IDS = {
  [CT_DATA_ID]: 'cornerstoneStreamingImageVolume:SLICE_FIRST_CT',
  [PT_DATA_ID]: 'cornerstoneStreamingImageVolume:SLICE_FIRST_PT',
};
const NEAREST = 0;
/** A pixel of the outline of the cut lies this close to an edge of it. */
const OUTLINE_DISTANCE = 1.5;
/** The part of the canvas that must be content, not background. */
const MIN_CONTENT_FRACTION = 0.05;
const LOAD_TIMEOUT_MS = 180000;
const SWITCH_TIMEOUT_MS = 60000;

/**
 * How closely the CPU picture must follow the GPU picture, away from the
 * outline of the cut, where the GPU antialiases the edge of the slice: the
 * parts of the canvas that may differ by more than 1 level and by more than
 * 8 levels in a channel.
 */
type Tolerance = { overOne: number; overEight: number };

/** No pixel differs by more than 1 level, apart from a few next to the outline. */
const EXACT: Tolerance = { overOne: 0.0002, overEight: 0 };

/**
 * The GPU reads its textures with less precision than the exact linear sample
 * of the CPU. Where the picture changes by many levels from one pixel to the
 * next (a rotated view, the steep hsv colours of the PT, a translucent layer
 * that the GPU blends in its order independent pass) that gives a few levels.
 */
const GPU_FILTERING: Tolerance = { overOne: 0.015, overEight: 0.0002 };

/**
 * As GPU_FILTERING, and a NEAREST layer whose voxel edges fall within a few
 * ten-thousandths of a pixel of the centres of a row or a column of the
 * canvas may show the voxel on the other side of that edge along that line.
 */
const NEAREST_TIES: Tolerance = { overOne: 0.015, overEight: 0.005 };

/**
 * As GPU_FILTERING, where the opacity jumps at a threshold: the opacity table
 * rises by 0.7 within one of its texels there, so a hundredth of an SUV
 * between the value that the GPU filters and the exact value of the CPU moves
 * the alpha of that pixel by up to about 20 levels.
 */
const THRESHOLD: Tolerance = { overOne: 0.02, overEight: 0.0005 };

type Presentation = Record<string, unknown>;

type ParityCase = {
  name: string;
  viewportId: string;
  tolerance: Tolerance;
  presentations?: Record<string, Presentation>;
  slab?: { thickness: number; blendMode: string };
  view?: {
    zoom?: number;
    pan?: [number, number];
    rotation?: number;
    flipHorizontal?: boolean;
    flipVertical?: boolean;
  };
};

const ptColormap = (colormap: Presentation) => ({
  [PT_DATA_ID]: { colormap: { name: 'hsv', ...colormap } },
});

/** The cases of a single grey layer: orientation, interpolation and look. */
const SINGLE_LAYER_CASES: ParityCase[] = [
  { name: 'axial, linear', viewportId: 'CT_AXIAL', tolerance: EXACT },
  { name: 'sagittal, linear', viewportId: 'CT_SAGITTAL', tolerance: EXACT },
  {
    name: 'coronal, linear',
    viewportId: 'FUSION_CORONAL',
    tolerance: EXACT,
    presentations: { [PT_DATA_ID]: { visible: false } },
  },
  { name: 'oblique, linear', viewportId: 'CT_OBLIQUE', tolerance: EXACT },
  {
    name: 'axial, nearest',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    presentations: { [CT_DATA_ID]: { interpolationType: NEAREST } },
  },
  {
    name: 'sagittal, nearest',
    viewportId: 'CT_SAGITTAL',
    tolerance: EXACT,
    presentations: { [CT_DATA_ID]: { interpolationType: NEAREST } },
  },
  {
    name: 'oblique, nearest',
    viewportId: 'CT_OBLIQUE',
    tolerance: EXACT,
    presentations: { [CT_DATA_ID]: { interpolationType: NEAREST } },
  },
  {
    name: 'axial, narrow window',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    presentations: { [CT_DATA_ID]: { voiRange: { lower: 30, upper: 50 } } },
  },
  {
    name: 'axial, wide window',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    presentations: {
      [CT_DATA_ID]: { voiRange: { lower: -1000, upper: 2000 } },
    },
  },
  {
    name: 'axial, inverted',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    presentations: { [CT_DATA_ID]: { invert: true } },
  },
  {
    name: 'axial, hsv colormap',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    presentations: { [CT_DATA_ID]: { colormap: { name: 'hsv' } } },
  },
  {
    name: 'oblique, hsv colormap',
    viewportId: 'CT_OBLIQUE',
    tolerance: EXACT,
    presentations: { [CT_DATA_ID]: { colormap: { name: 'hsv' } } },
  },
];

/** The cases of the coronal fusion of the example: CT with a PT in hsv. */
const FUSION_CASES: ParityCase[] = [
  {
    name: 'fusion, opacity array of the example',
    viewportId: 'FUSION_CORONAL',
    tolerance: GPU_FILTERING,
  },
  {
    name: 'fusion, opacity array, nearest',
    viewportId: 'FUSION_CORONAL',
    tolerance: NEAREST_TIES,
    presentations: {
      [CT_DATA_ID]: { interpolationType: NEAREST },
      [PT_DATA_ID]: { interpolationType: NEAREST },
    },
  },
  {
    name: 'fusion, numeric opacity',
    viewportId: 'FUSION_CORONAL',
    tolerance: GPU_FILTERING,
    presentations: ptColormap({ opacity: 0.5 }),
  },
  {
    name: 'fusion, threshold',
    viewportId: 'FUSION_CORONAL',
    tolerance: THRESHOLD,
    presentations: ptColormap({ opacity: 0.7, threshold: 1 }),
  },
  {
    name: 'fusion, layer opacity',
    viewportId: 'FUSION_CORONAL',
    tolerance: GPU_FILTERING,
    presentations: { [PT_DATA_ID]: { opacity: 0.5 } },
  },
];

/** The cases of a slab, which the GPU draws from its 3D texture. */
const SLAB_CASES: ParityCase[] = [
  {
    name: 'axial, maximum 10 mm',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    slab: { thickness: 10, blendMode: 'MAXIMUM_INTENSITY_BLEND' },
  },
  {
    name: 'axial, average 10 mm',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    slab: { thickness: 10, blendMode: 'AVERAGE_INTENSITY_BLEND' },
  },
  {
    name: 'coronal CT, maximum 10 mm',
    viewportId: 'FUSION_CORONAL',
    tolerance: EXACT,
    presentations: { [PT_DATA_ID]: { visible: false } },
    slab: { thickness: 10, blendMode: 'MAXIMUM_INTENSITY_BLEND' },
  },
  {
    name: 'fusion, maximum 10 mm',
    viewportId: 'FUSION_CORONAL',
    tolerance: GPU_FILTERING,
    slab: { thickness: 10, blendMode: 'MAXIMUM_INTENSITY_BLEND' },
  },
  {
    name: 'fusion, minimum 10 mm',
    viewportId: 'FUSION_CORONAL',
    tolerance: GPU_FILTERING,
    slab: { thickness: 10, blendMode: 'MINIMUM_INTENSITY_BLEND' },
  },
  {
    name: 'fusion, average 10 mm',
    viewportId: 'FUSION_CORONAL',
    tolerance: GPU_FILTERING,
    slab: { thickness: 10, blendMode: 'AVERAGE_INTENSITY_BLEND' },
  },
];

/** The cases of a changed view. */
const VIEW_CASES: ParityCase[] = [
  {
    name: 'axial, zoom in',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    view: { zoom: 2 },
  },
  {
    name: 'axial, zoom out',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    view: { zoom: 0.5 },
  },
  {
    name: 'axial, pan',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    view: { pan: [40, -25] },
  },
  {
    name: 'axial, rotate 30 degrees',
    viewportId: 'CT_AXIAL',
    tolerance: GPU_FILTERING,
    view: { rotation: 30 },
  },
  {
    name: 'axial, rotate 90 degrees',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    view: { rotation: 90 },
  },
  {
    name: 'axial, flip horizontal',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    view: { flipHorizontal: true },
  },
  {
    name: 'axial, flip vertical',
    viewportId: 'CT_AXIAL',
    tolerance: EXACT,
    view: { flipVertical: true },
  },
  {
    name: 'fusion, zoom in',
    viewportId: 'FUSION_CORONAL',
    tolerance: GPU_FILTERING,
    view: { zoom: 2 },
  },
  {
    name: 'fusion, rotate 30 degrees',
    viewportId: 'FUSION_CORONAL',
    tolerance: GPU_FILTERING,
    view: { rotation: 30 },
  },
];

type TestViewport = {
  getRenderPlan: () => Array<{
    displaySetId: string;
    draw: string;
    renderMode: string;
    reason: string;
  }>;
  getDebugBindings: () => Array<{
    rendering: { refreshFidelity?: () => void; qualityPending?: boolean };
  }>;
  getDisplaySetPresentation: (displaySetId: string) => Presentation | undefined;
  setDisplaySetPresentation: (displaySetId: string, props: Presentation) => void;
  getViewState: () => Record<string, unknown>;
  setViewState: (patch: Record<string, unknown>) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: [number, number]) => void;
  getResolvedView: () => {
    toICamera: () => { focalPoint: number[]; viewPlaneNormal: number[] };
  };
  worldToCanvas: (point: number[]) => [number, number];
  render: () => void;
};

type TestWindow = typeof window & {
  cornerstone: {
    getRenderingEngine: (id: string) => {
      getViewport: (viewportId: string) => TestViewport;
    };
    cache: {
      getVolume: (volumeId: string) => {
        loadStatus?: { loaded?: boolean };
        dimensions: number[];
        direction: number[];
        spacing: number[];
        origin: number[];
      };
    };
    setRenderBackend: (backend: string) => void;
    Enums: { BlendModes: Record<string, number> };
  };
};

/**
 * Opens the example with slice first on and waits until both volumes have
 * loaded and the viewports have rendered.
 */
async function openExample(page: Page): Promise<void> {
  const url = createExampleUrl(EXAMPLE + '.html');

  url.searchParams.set('sliceFirst', '1');
  url.searchParams.set('debug', 'false');

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
        (viewport?.getRenderPlan().length ?? 0) >= 2 &&
        volumeIds.every(
          (volumeId) =>
            cornerstone.cache.getVolume(volumeId)?.loadStatus?.loaded === true
        )
      );
    },
    {
      engineId: ENGINE_ID,
      viewportId: 'FUSION_CORONAL',
      volumeIds: Object.values(VOLUME_IDS),
    },
    { timeout: LOAD_TIMEOUT_MS }
  );
  await waitForRenderSettled(page, { quietMs: 800, timeout: 30000 });
}

/**
 * Pins the render backend of every viewport and waits until every layer of
 * the viewport of the case is drawn by that backend and has its final
 * picture: the screen grid sample at rest, and a slab that is sampled in
 * steps.
 */
async function pinBackend(
  page: Page,
  viewportId: string,
  backend: 'gpu' | 'cpu'
): Promise<void> {
  await page.evaluate(
    (pinned) => (window as TestWindow).cornerstone.setRenderBackend(pinned),
    backend
  );
  await page.waitForFunction(
    ({ engineId, id, draw }) => {
      const viewport = (window as TestWindow).cornerstone
        .getRenderingEngine(engineId)
        .getViewport(id);

      return (
        viewport.getRenderPlan().every((layer) => layer.draw === draw) &&
        viewport.getDebugBindings().every(({ rendering }) => {
          rendering.refreshFidelity?.();

          return !rendering.qualityPending;
        })
      );
    },
    { engineId: ENGINE_ID, id: viewportId, draw: backend },
    { timeout: SWITCH_TIMEOUT_MS, polling: 100 }
  );
  await waitForRenderSettled(page, { quietMs: 500, timeout: 30000 });
}

/** Applies the presentations, the slab and the view of a case. */
async function applyCase(page: Page, parityCase: ParityCase): Promise<void> {
  await page.evaluate(
    ({ engineId, parityCase }) => {
      const { cornerstone } = window as TestWindow;
      const viewport = cornerstone
        .getRenderingEngine(engineId)
        .getViewport(parityCase.viewportId);
      const { presentations = {}, slab, view } = parityCase;

      Object.entries(presentations).forEach(([displaySetId, props]) =>
        viewport.setDisplaySetPresentation(displaySetId, props)
      );

      if (slab) {
        viewport.getRenderPlan().forEach(({ displaySetId }) =>
          viewport.setDisplaySetPresentation(displaySetId, {
            slabThickness: slab.thickness,
            blendMode: cornerstone.Enums.BlendModes[slab.blendMode],
          })
        );
      }

      if (view?.zoom) {
        viewport.setZoom(view.zoom);
      }

      if (view?.pan) {
        viewport.setPan(view.pan);
      }

      const { rotation, flipHorizontal, flipVertical } = view ?? {};
      const patch = Object.fromEntries(
        Object.entries({ rotation, flipHorizontal, flipVertical }).filter(
          ([, value]) => value !== undefined
        )
      );

      if (Object.keys(patch).length) {
        viewport.setViewState(patch);
      }

      viewport.render();
    },
    { engineId: ENGINE_ID, parityCase }
  );
}

/**
 * Marks the pixels of a viewport canvas that lie within OUTLINE_DISTANCE of an
 * edge of the cut of a visible layer: the polygon where the view plane
 * crosses the faces of its volume, placed with `worldToCanvas`. The GPU
 * antialiases the edge of the slice there.
 */
async function readCutOutline(
  page: Page,
  viewportId: string,
  width: number,
  height: number
): Promise<Uint8Array> {
  const bytes = await page.evaluate(
    ({ engineId, viewportId, width, height, volumeIds, distance }) => {
      const { cornerstone } = window as TestWindow;
      const viewport = cornerstone
        .getRenderingEngine(engineId)
        .getViewport(viewportId);
      const { focalPoint, viewPlaneNormal } = viewport
        .getResolvedView()
        .toICamera();
      const mask = new Uint8Array(width * height);
      const along = (point: number[]) =>
        [0, 1, 2].reduce(
          (sum, axis) =>
            sum + (point[axis] - focalPoint[axis]) * viewPlaneNormal[axis],
          0
        );

      viewport.getRenderPlan().forEach(({ displaySetId }) => {
        if (viewport.getDisplaySetPresentation(displaySetId)?.visible === false) {
          return;
        }

        const { dimensions, direction, spacing, origin } =
          cornerstone.cache.getVolume(volumeIds[displaySetId]);
        const corners: number[][] = [];

        [-0.5, dimensions[0] - 0.5].forEach((i) =>
          [-0.5, dimensions[1] - 0.5].forEach((j) =>
            [-0.5, dimensions[2] - 0.5].forEach((k) => corners.push([i, j, k]))
          )
        );

        const toWorld = ([i, j, k]: number[]) =>
          [0, 1, 2].map(
            (axis) =>
              origin[axis] +
              direction[axis] * i * spacing[0] +
              direction[3 + axis] * j * spacing[1] +
              direction[6 + axis] * k * spacing[2]
          );
        const points: Array<[number, number]> = [];

        corners.forEach((first, a) =>
          corners.slice(a + 1).forEach((second) => {
            if (
              [0, 1, 2].filter((axis) => first[axis] !== second[axis])
                .length !== 1
            ) {
              return;
            }

            const start = toWorld(first);
            const end = toWorld(second);
            const startSide = along(start);
            const endSide = along(end);

            if (startSide > 0 === endSide > 0) {
              return;
            }

            const t = startSide / (startSide - endSide);

            points.push(
              viewport.worldToCanvas(
                [0, 1, 2].map(
                  (axis) => start[axis] + (end[axis] - start[axis]) * t
                )
              )
            );
          })
        );

        if (points.length < 3) {
          return;
        }

        const centre = points.reduce(
          (sum, [x, y]) => [
            sum[0] + x / points.length,
            sum[1] + y / points.length,
          ],
          [0, 0]
        );

        points.sort(
          (p, q) =>
            Math.atan2(p[1] - centre[1], p[0] - centre[0]) -
            Math.atan2(q[1] - centre[1], q[0] - centre[0])
        );
        points.forEach(([x1, y1], index) => {
          const [x2, y2] = points[(index + 1) % points.length];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const lengthSquared = dx * dx + dy * dy || 1;
          const reach = Math.ceil(distance) + 1;

          for (
            let y = Math.max(0, Math.floor(Math.min(y1, y2)) - reach);
            y <= Math.min(height - 1, Math.ceil(Math.max(y1, y2)) + reach);
            y++
          ) {
            for (
              let x = Math.max(0, Math.floor(Math.min(x1, x2)) - reach);
              x <= Math.min(width - 1, Math.ceil(Math.max(x1, x2)) + reach);
              x++
            ) {
              const t = Math.max(
                0,
                Math.min(
                  1,
                  ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / lengthSquared
                )
              );
              const ex = x1 + t * dx - x - 0.5;
              const ey = y1 + t * dy - y - 0.5;

              if (ex * ex + ey * ey <= distance * distance) {
                mask[y * width + x] = 1;
              }
            }
          }
        });
      });

      return Array.from(mask);
    },
    {
      engineId: ENGINE_ID,
      viewportId,
      width,
      height,
      volumeIds: VOLUME_IDS,
      distance: OUTLINE_DISTANCE,
    }
  );

  return Uint8Array.from(bytes);
}

/**
 * Draws the view of a case with the GPU draw step and with the CPU draw step
 * and checks that the CPU picture follows the GPU picture within the
 * tolerance of the case, away from the outline of the cut.
 */
async function expectSamePicture(
  page: Page,
  parityCase: ParityCase
): Promise<void> {
  const viewportIndex = VIEWPORT_IDS.indexOf(parityCase.viewportId);
  const read = (): Promise<ViewportPixels> =>
    readViewportPixels(page, viewportIndex, { stableMs: 500 });

  await pinBackend(page, parityCase.viewportId, 'gpu');
  await applyCase(page, parityCase);
  await pinBackend(page, parityCase.viewportId, 'gpu');

  const gpu = await read();

  await pinBackend(page, parityCase.viewportId, 'cpu');

  const cpu = await read();
  const outline = await readCutOutline(
    page,
    parityCase.viewportId,
    gpu.width,
    gpu.height
  );
  const total = gpu.width * gpu.height;
  const overOne = countPixelsDifferingBy(gpu, cpu, 1, outline);
  const overEight = countPixelsDifferingBy(gpu, cpu, 8, outline);

  console.log(
    `${parityCase.name}: away from the outline of the cut, ${overOne} of ${total} pixels differ by more than 1 level, ${overEight} by more than 8`
  );
  expect(cpu.width, `${parityCase.name}: canvas width`).toBe(gpu.width);
  expect(cpu.height, `${parityCase.name}: canvas height`).toBe(gpu.height);
  expect(
    countContentPixels(cpu),
    `${parityCase.name}: pixels that are not background`
  ).toBeGreaterThanOrEqual(total * MIN_CONTENT_FRACTION);

  expect(
    overOne,
    `${parityCase.name}: pixels that differ by more than 1 level`
  ).toBeLessThanOrEqual(total * parityCase.tolerance.overOne);
  expect(
    overEight,
    `${parityCase.name}: pixels that differ by more than 8 levels`
  ).toBeLessThanOrEqual(total * parityCase.tolerance.overEight);
}

/** Runs each case of a group on a freshly opened example. */
function describeCases(title: string, cases: ParityCase[]): void {
  test(title, async ({ page }) => {
    for (const parityCase of cases) {
      await openExample(page);
      await expectSamePicture(page, parityCase);
    }
  });
}

test.describe('Draw parity: the CPU draw step draws the picture of the GPU draw step', () => {
  test.describe.configure({ mode: 'parallel' });
  test.setTimeout(900000);

  describeCases('one grey layer', SINGLE_LAYER_CASES);
  describeCases('fusion', FUSION_CASES);
  describeCases('slabs', SLAB_CASES);
  describeCases('a changed view', VIEW_CASES);

  test('a slab of the full thickness, too large for the CPU, is reported and not drawn as another picture silently', async ({
    page,
  }) => {
    await openExample(page);
    await page.evaluate(
      (pinned) => (window as TestWindow).cornerstone.setRenderBackend(pinned),
      'cpu'
    );
    await applyCase(page, {
      name: 'fusion, maximum of the full thickness',
      viewportId: 'FUSION_CORONAL',
      tolerance: EXACT,
      slab: { thickness: 1000, blendMode: 'MAXIMUM_INTENSITY_BLEND' },
    });
    await expect
      .poll(
        () =>
          page.evaluate((engineId) => {
            const viewport = (window as TestWindow).cornerstone
              .getRenderingEngine(engineId)
              .getViewport('FUSION_CORONAL');

            return viewport
              .getRenderPlan()
              .map(({ renderMode, reason }) => [renderMode, reason]);
          }, ENGINE_ID),
        { timeout: SWITCH_TIMEOUT_MS }
      )
      .toEqual([
        ['cpuVolume', 'slabTooLarge'],
        ['cpuVolume', 'slabTooLarge'],
      ]);
  });
});
