// The edge of a volume on the GPU volume slice path (`gpuVolume`). With
// multisampling, a pixel on the edge of the cut that the cut covers only in
// part, and whose centre lies outside the volume, must show what lies below
// the volume (the background or the layer below), as on the other render
// paths and as 5.x drew a MIP; the first and last pixel rows inside the
// volume keep their data. The synthetic volume is 64 x 64 x 31 voxels of 1 mm,
// so a sagittal view of 300 x 301 pixels puts the top and the bottom of the
// volume at 77.84 and 223.16: rows 77 and 223 are covered in part and have
// their centre outside.

import { afterEach, describe, expect, test } from 'vitest';
import {
  cache,
  displaySetRegistry,
  Enums,
  type PlanarViewport,
  type Types,
} from '@cornerstonejs/core';
import {
  createPlanarViewport,
  FAKE_VOLUME_LOADER_SCHEME,
  registerFakeImageStack,
  renderAndWait,
  type PlanarViewportContext,
} from './harness';

const { BlendModes, OrientationAxis } = Enums;

const STACK = { rows: 64, columns: 64, sliceCount: 31 };
const WIDTH = 300;
const HEIGHT = 301;
const WHITE: [number, number, number] = [1, 1, 1];
const VOI_RANGE = { lower: 0, upper: 50 };
const WHOLE_VOLUME_SLAB = 200;
/** Grey levels a pixel of the background may differ from it. */
const BACKGROUND_TOLERANCE = 1;
/** Grey levels a data pixel of an edge row differs at least from the background. */
const DATA_CONTRAST = 40;
/** Grey levels an edge row may differ from the row next to it inside. */
const ROW_STEP_TOLERANCE = 8;
const MAX_REPORTED_PIXELS = 8;

type Pixels = { width: number; height: number; data: Uint8ClampedArray };
type Footprint = { left: number; right: number; top: number; bottom: number };
type SlabCase = {
  name: string;
  slabThickness?: number;
  blendMode?: Enums.BlendModes;
};

let cleanups: Array<() => void> = [];

afterEach(() => {
  const pending = cleanups.reverse();

  cleanups = [];
  pending.forEach((cleanup) => cleanup());
  document.body.innerHTML = '';
});

/** The id of the volume that the harness loads for a display set. */
function volumeIdOf(displaySetId: string): string {
  return `${FAKE_VOLUME_LOADER_SCHEME}:${displaySetId}`;
}

/**
 * Mounts the synthetic volume on the GPU volume slice path, with an inverted
 * VOI and, when given, a slab, and draws it.
 */
async function mountVolume(options: {
  orientation: Enums.OrientationAxis;
  background?: [number, number, number];
  slab?: SlabCase;
  zoom?: number;
}): Promise<PlanarViewportContext> {
  const ctx = await createPlanarViewport({
    renderMode: 'vtkGpuVolumeSlice',
    orientation: options.orientation,
    width: WIDTH,
    height: HEIGHT,
    stack: STACK,
    background: options.background ?? WHITE,
  });

  cleanups.push(ctx.cleanup);

  const { slabThickness, blendMode } = options.slab ?? {};

  ctx.viewport.setDisplaySetAppearance(ctx.displaySetId, {
    voiRange: VOI_RANGE,
    invert: true,
    ...(slabThickness ? { slabThickness, blendMode } : {}),
  });

  if (options.zoom) {
    ctx.viewport.setZoom(options.zoom);
  }

  await renderAndWait(ctx.element, ctx.viewport);

  return ctx;
}

/** The draw paths of the layers of the render plan, as `slice-draw`. */
function drawPaths(viewport: PlanarViewport): string[] {
  return viewport
    .getRenderPlan()
    .map((layer) => `${layer.slice}-${layer.draw}`);
}

function readPixels(viewport: PlanarViewport): Pixels {
  const canvas = viewport.getCanvas();
  const { width, height } = canvas;

  return {
    width,
    height,
    data: canvas.getContext('2d').getImageData(0, 0, width, height).data,
  };
}

/** The grey of a pixel: the largest of its red, green and blue. */
function grey(pixels: Pixels, x: number, y: number): number {
  const offset = (y * pixels.width + x) * 4;

  return Math.max(
    pixels.data[offset],
    pixels.data[offset + 1],
    pixels.data[offset + 2]
  );
}

/**
 * The rectangle of the canvas that the box of a volume covers: the bounds of
 * the projections of its eight corners. For a view that is not oblique to the
 * volume it is the footprint of the cut; for a view that turns about the up
 * axis its top and bottom are.
 */
function volumeFootprint(
  viewport: PlanarViewport,
  volumeId: string
): Footprint {
  const bounds = cache.getVolume(volumeId).imageData.getBounds();
  const points: Types.Point2[] = [];

  for (const x of [bounds[0], bounds[1]]) {
    for (const y of [bounds[2], bounds[3]]) {
      for (const z of [bounds[4], bounds[5]]) {
        points.push(viewport.worldToCanvas([x, y, z]));
      }
    }
  }

  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);

  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

/**
 * The pixel rows (and, unless `rowsOnly`, columns) that an edge of the
 * footprint covers in part while their centre lies outside it: the lines that
 * this test is about.
 */
function partlyCoveredOutsideLines(
  footprint: Footprint,
  pixels: Pixels,
  rowsOnly = false
): string[] {
  const lines: string[] = [];
  const fraction = (value: number) => value - Math.floor(value);
  const edges: Array<[string, number, boolean, number]> = [
    ['row', footprint.top, true, pixels.height],
    ['row', footprint.bottom, false, pixels.height],
    ...(rowsOnly
      ? []
      : ([
          ['column', footprint.left, true, pixels.width],
          ['column', footprint.right, false, pixels.width],
        ] as Array<[string, number, boolean, number]>)),
  ];

  for (const [kind, edge, isStart, size] of edges) {
    const line = Math.floor(edge);
    const centreOutside = isStart
      ? fraction(edge) > 0.5
      : fraction(edge) > 0 && fraction(edge) < 0.5;

    if (line >= 0 && line < size && centreOutside) {
      lines.push(`${kind} ${line}`);
    }
  }

  return lines;
}

function isOutside(
  footprint: Footprint,
  x: number,
  y: number,
  rowsOnly: boolean
): boolean {
  const centreX = x + 0.5;
  const centreY = y + 0.5;

  return (
    centreY < footprint.top ||
    centreY > footprint.bottom ||
    (!rowsOnly && (centreX < footprint.left || centreX > footprint.right))
  );
}

/**
 * Checks that every pixel whose centre lies outside the footprint shows the
 * grey that `expected` gives for it.
 */
function expectOutsideToShow(
  pixels: Pixels,
  footprint: Footprint,
  expected: (x: number, y: number) => number,
  label: string,
  rowsOnly = false
): void {
  const differing: string[] = [];
  let count = 0;

  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      if (!isOutside(footprint, x, y, rowsOnly)) {
        continue;
      }

      const value = grey(pixels, x, y);
      const wanted = expected(x, y);

      if (Math.abs(value - wanted) > BACKGROUND_TOLERANCE) {
        count++;

        if (differing.length < MAX_REPORTED_PIXELS) {
          differing.push(`(${x}, ${y}) ${value} for ${wanted}`);
        }
      }
    }
  }

  expect(
    differing,
    `${label}: ${count} pixels outside the volume (footprint ${JSON.stringify(footprint)})`
  ).toEqual([]);
}

/**
 * Checks that the first and the last pixel rows that the volume covers whole
 * hold data: unlike the background, and like the row next to them inside.
 * With `columns`, the first and the last columns as well.
 */
function expectDataInEdgeLines(
  pixels: Pixels,
  footprint: Footprint,
  background: number,
  label: string,
  columns = false
): void {
  const firstRow = Math.ceil(footprint.top);
  const lastRow = Math.floor(footprint.bottom) - 1;
  const firstColumn = Math.max(0, Math.ceil(footprint.left));
  const lastColumn = Math.min(pixels.width, Math.floor(footprint.right)) - 1;
  const problems: string[] = [];
  const check = (
    x: number,
    y: number,
    insideX: number,
    insideY: number,
    line: string
  ) => {
    const value = grey(pixels, x, y);
    const inside = grey(pixels, insideX, insideY);

    if (
      Math.abs(value - background) <= DATA_CONTRAST ||
      Math.abs(value - inside) > ROW_STEP_TOLERANCE
    ) {
      problems.push(`${line} at (${x}, ${y}): ${value}, inside ${inside}`);
    }
  };

  for (let x = firstColumn; x <= lastColumn; x++) {
    check(x, firstRow, x, firstRow + 1, 'first row');
    check(x, lastRow, x, lastRow - 1, 'last row');
  }

  if (columns) {
    for (let y = firstRow; y <= lastRow; y++) {
      check(firstColumn, y, firstColumn + 1, y, 'first column');
      check(lastColumn, y, lastColumn - 1, y, 'last column');
    }
  }

  expect(problems.slice(0, MAX_REPORTED_PIXELS), label).toEqual([]);
}

const SAGITTAL_CASES: SlabCase[] = [
  {
    name: 'a maximum intensity slab over the whole volume',
    slabThickness: WHOLE_VOLUME_SLAB,
    blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
  },
  {
    name: 'a minimum intensity slab over the whole volume',
    slabThickness: WHOLE_VOLUME_SLAB,
    blendMode: BlendModes.MINIMUM_INTENSITY_BLEND,
  },
  {
    name: 'an average intensity slab over the whole volume',
    slabThickness: WHOLE_VOLUME_SLAB,
    blendMode: BlendModes.AVERAGE_INTENSITY_BLEND,
  },
  {
    name: 'a maximum intensity slab of 3 mm',
    slabThickness: 3,
    blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
  },
  { name: 'a single slice' },
];

describe('The GPU volume slice path at the edge of the volume', () => {
  test.each(SAGITTAL_CASES)(
    'draws the background outside a sagittal view of $name and the data in its first and last rows',
    async (slab) => {
      const { viewport, displaySetId } = await mountVolume({
        orientation: OrientationAxis.SAGITTAL,
        slab,
      });

      expect(drawPaths(viewport)).toEqual(['gpuVolume-gpu']);

      const pixels = readPixels(viewport);
      const footprint = volumeFootprint(viewport, volumeIdOf(displaySetId));

      expect(
        partlyCoveredOutsideLines(footprint, pixels, true),
        `edge lines of the footprint ${JSON.stringify(footprint)}`
      ).toEqual(['row 77', 'row 223']);
      expectOutsideToShow(pixels, footprint, () => 255, slab.name);
      expectDataInEdgeLines(pixels, footprint, 255, slab.name);
    }
  );

  test('draws the background beside the rows and the columns of a zoomed axial maximum intensity slab', async () => {
    const { viewport, displaySetId } = await mountVolume({
      orientation: OrientationAxis.AXIAL,
      slab: SAGITTAL_CASES[0],
      zoom: 0.9289,
    });

    expect(drawPaths(viewport)).toEqual(['gpuVolume-gpu']);

    const pixels = readPixels(viewport);
    const footprint = volumeFootprint(viewport, volumeIdOf(displaySetId));

    expect(
      partlyCoveredOutsideLines(footprint, pixels),
      `edge lines of the footprint ${JSON.stringify(footprint)}`
    ).toEqual(['column 10', 'column 289']);
    expectOutsideToShow(pixels, footprint, () => 255, 'axial MIP');
    expectDataInEdgeLines(pixels, footprint, 255, 'axial MIP', true);
  });

  test('draws the background above and below an oblique maximum intensity slab', async () => {
    const { viewport, element, displaySetId } = await mountVolume({
      orientation: OrientationAxis.SAGITTAL,
      slab: SAGITTAL_CASES[0],
    });
    const angle = (30 * Math.PI) / 180;

    viewport.setViewState({
      orientation: {
        viewPlaneNormal: [Math.cos(angle), Math.sin(angle), 0],
        viewUp: [0, 0, 1],
      },
    });
    viewport.setZoom(0.9927);
    await renderAndWait(element, viewport);

    expect(drawPaths(viewport)).toEqual(['gpuVolume-gpu']);

    const pixels = readPixels(viewport);
    const footprint = volumeFootprint(viewport, volumeIdOf(displaySetId));

    expect(
      partlyCoveredOutsideLines(footprint, pixels, true),
      `edge lines of the footprint ${JSON.stringify(footprint)}`
    ).toEqual(['row 97', 'row 203']);
    expectOutsideToShow(pixels, footprint, () => 255, 'oblique MIP', true);
  });

  test('draws nothing of an overlay outside its volume over the layer below', async () => {
    const { viewport, element, displaySetId } = await mountVolume({
      orientation: OrientationAxis.SAGITTAL,
      background: [0, 0, 0],
    });
    const overlayStack = registerFakeImageStack({
      name: 'edge-overlay',
      rows: 41,
      columns: 64,
      sliceCount: 21,
    });
    const overlayDisplaySetId = `${displaySetId}:overlay`;
    const volumeOptions = {
      mode: 'volume' as const,
      orientation: OrientationAxis.SAGITTAL,
      sliceFirst: false,
    };

    cleanups.push(() => overlayStack.unregister());
    displaySetRegistry.add(overlayDisplaySetId, {
      imageIds: overlayStack.imageIds,
      volumeId: volumeIdOf(overlayDisplaySetId),
    });
    await viewport.setDisplaySets(
      { displaySetId, options: volumeOptions },
      { displaySetId: overlayDisplaySetId, options: volumeOptions }
    );
    viewport.setDisplaySetAppearance(displaySetId, { voiRange: VOI_RANGE });
    viewport.setDisplaySetAppearance(overlayDisplaySetId, {
      voiRange: VOI_RANGE,
      invert: true,
    });
    await renderAndWait(element, viewport);

    expect(drawPaths(viewport)).toEqual(['gpuVolume-gpu', 'gpuVolume-gpu']);

    const withOverlay = readPixels(viewport);

    viewport.setDisplaySetAppearance(overlayDisplaySetId, { visible: false });
    await renderAndWait(element, viewport);

    const withoutOverlay = readPixels(viewport);
    const sourceFootprint = volumeFootprint(viewport, volumeIdOf(displaySetId));
    const overlayFootprint = volumeFootprint(
      viewport,
      volumeIdOf(overlayDisplaySetId)
    );

    expect(
      overlayFootprint.top > sourceFootprint.top &&
        overlayFootprint.right < sourceFootprint.right,
      `overlay ${JSON.stringify(overlayFootprint)} inside the source ${JSON.stringify(sourceFootprint)}`
    ).toBe(true);
    expect(
      partlyCoveredOutsideLines(overlayFootprint, withOverlay),
      `edge lines of the overlay ${JSON.stringify(overlayFootprint)}`
    ).toEqual(['row 124', 'row 223', 'column 192']);
    expectOutsideToShow(
      withOverlay,
      overlayFootprint,
      (x, y) => grey(withoutOverlay, x, y),
      'overlay'
    );
  });
});
