// A planar viewport that draws its display sets on the CPU on a device with
// WebGL (`renderBackend: 'cpu'`) sets the size of its CPU canvas in
// `resize()`, which clears the canvas. The rendering engine does not draw
// such a viewport in its frame, so before row 121 of v6-open-issues.md was
// fixed the canvas stayed blank until the next draw of the view. These tests
// read the canvas in the task of `renderingEngine.resize()` and in the first
// animation frame after it, for a stack, a volume, an MPR, a fusion of two
// layers and a stack with a labelmap, all on the CPU.

import { afterEach, describe, expect, test } from 'vitest';
import {
  Enums,
  imageLoader,
  displaySetRegistry,
  type PlanarViewport,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createPlanarViewport,
  FAKE_VOLUME_LOADER_SCHEME,
  renderAndWait,
  setupTools,
  type PlanarViewportContext,
} from './harness';

const { OrientationAxis, RenderBackends } = Enums;
const { segmentation } = cornerstoneTools;
const { Labelmap: LABELMAP } =
  cornerstoneTools.Enums.SegmentationRepresentations;

let active: PlanarViewportContext | null = null;

afterEach(() => {
  const ctx = active;

  active = null;
  ctx?.cleanup();
});

/** Resolves at the next animation frame. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Resolves after the given time in milliseconds. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The share of the pixels of the canvas that the viewport draws on that are
 * not transparent: 1 for a drawn view, whose background is opaque, and 0
 * for a cleared canvas.
 */
function paintedShare(viewport: PlanarViewport): number {
  const canvas = viewport.getCanvas();
  const { data } = canvas
    .getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height);
  let painted = 0;

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 0) {
      painted++;
    }
  }

  return painted / (canvas.width * canvas.height);
}

/** The colour of the canvas pixel under a canvas point in CSS pixels. */
function colourAt(viewport: PlanarViewport, point: number[]): number[] {
  const canvas = viewport.getCanvas();
  const scale = canvas.width / canvas.clientWidth;
  const { data } = canvas
    .getContext('2d')
    .getImageData(
      Math.round(point[0] * scale),
      Math.round(point[1] * scale),
      1,
      1
    );

  return Array.from(data);
}

/**
 * Gives the element of the viewport a new width, resizes the engine, and
 * gives what `read` reads in the task of the resize and at the first
 * animation frame after it: by default the share of the canvas painted.
 */
async function resizeAndRead(
  ctx: PlanarViewportContext,
  width: number,
  read: () => unknown = () => paintedShare(ctx.viewport)
): Promise<{ inTask: unknown; firstFrame: unknown }> {
  ctx.element.style.width = `${width}px`;
  ctx.renderingEngine.resize(true, true);

  const inTask = read();

  await nextFrame();

  return { inTask, firstFrame: read() };
}

/**
 * The number of IMAGE_RENDERED events that a call fires on the element in
 * its task: one per layer for one draw of the view.
 */
function countRendered(element: HTMLElement, call: () => void): number {
  let count = 0;
  const onRendered = () => {
    count++;
  };

  element.addEventListener(Enums.Events.IMAGE_RENDERED, onRendered);
  call();
  element.removeEventListener(Enums.Events.IMAGE_RENDERED, onRendered);

  return count;
}

/**
 * Sets the visibility of the labelmap of a segmentation on the viewport and
 * draws the viewport again.
 */
async function showLabelmap(
  ctx: PlanarViewportContext,
  segmentationId: string,
  visible: boolean
): Promise<void> {
  segmentation.config.visibility.setSegmentationRepresentationVisibility(
    ctx.viewportId,
    { segmentationId, type: LABELMAP },
    visible
  );
  await wait(100);
  await renderAndWait(ctx.element, ctx.viewport);
}

describe('A planar viewport that draws on the CPU on a device with WebGL is not blank after renderingEngine.resize() (row 121)', () => {
  test('a stack', async () => {
    active = await createPlanarViewport({ renderMode: 'canvasFrame' });

    expect(paintedShare(active.viewport)).toBe(1);
    expect(await resizeAndRead(active, 300)).toEqual({
      inTask: 1,
      firstFrame: 1,
    });
    expect(await resizeAndRead(active, 400)).toEqual({
      inTask: 1,
      firstFrame: 1,
    });
  });

  test('a volume in the acquisition plane', async () => {
    active = await createPlanarViewport({ renderMode: 'canvasCpuSlice' });

    expect(paintedShare(active.viewport)).toBe(1);
    expect(await resizeAndRead(active, 300)).toEqual({
      inTask: 1,
      firstFrame: 1,
    });
  });

  test('an MPR: a volume in another plane', async () => {
    active = await createPlanarViewport({
      renderMode: 'canvasCpuSlice',
      orientation: OrientationAxis.SAGITTAL,
      stack: { sliceCount: 32 },
    });

    expect(paintedShare(active.viewport)).toBe(1);
    expect(await resizeAndRead(active, 300)).toEqual({
      inTask: 1,
      firstFrame: 1,
    });
  });

  test('a fusion of two layers', async () => {
    active = await createPlanarViewport({ renderMode: 'canvasCpuSlice' });

    const overlayId = `${active.displaySetId}-overlay`;

    displaySetRegistry.add(overlayId, {
      imageIds: active.imageIds,
      volumeId: `${FAKE_VOLUME_LOADER_SCHEME}:${overlayId}`,
    });
    await active.viewport.addDisplaySet(overlayId, {
      mode: 'volume',
      role: 'overlay',
      renderBackend: RenderBackends.CPU,
      appearance: { opacity: 0.5 },
    });
    await renderAndWait(active.element, active.viewport);

    expect(active.viewport.getDisplaySets().length).toBe(2);
    expect(paintedShare(active.viewport)).toBe(1);

    const ctx = active;
    const oneDraw = countRendered(ctx.element, () => ctx.viewport.render());

    ctx.element.style.width = '350px';

    expect(oneDraw).toBe(2);
    expect(
      countRendered(ctx.element, () => ctx.renderingEngine.resize(true, true))
    ).toBe(oneDraw);
    expect(await resizeAndRead(active, 300)).toEqual({
      inTask: 1,
      firstFrame: 1,
    });
  });

  test('a stack with a labelmap, which is drawn again with it', async () => {
    const ctx = await setupTools({ viewport: { renderMode: 'canvasFrame' } });

    active = ctx;

    const labelmapImages = imageLoader.createAndCacheDerivedLabelmapImages(
      ctx.imageIds
    );
    const segmentationId = `${ctx.viewportId}-labelmap`;

    labelmapImages.forEach((labelmap) => {
      for (let j = 0; j < labelmap.rows; j++) {
        for (let i = 0; i < labelmap.columns; i++) {
          labelmap.voxelManager.setAtIJK(i, j, 0, 1);
        }
      }
    });
    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: LABELMAP,
          data: { imageIds: labelmapImages.map(({ imageId }) => imageId) },
        },
      },
    ]);
    await segmentation.addSegmentationRepresentations(ctx.viewportId, [
      { segmentationId, type: LABELMAP },
    ]);
    await wait(300);
    await renderAndWait(ctx.element, ctx.viewport);

    const centre = [200, 200];
    const world = ctx.viewport.canvasToWorld(centre as [number, number]);
    const tinted = colourAt(ctx.viewport, centre);

    await showLabelmap(ctx, segmentationId, false);

    const withoutLabelmap = colourAt(ctx.viewport, centre);

    await showLabelmap(ctx, segmentationId, true);

    expect(tinted).not.toEqual(withoutLabelmap);
    expect(colourAt(ctx.viewport, centre)).toEqual(tinted);

    const oneDraw = countRendered(ctx.element, () => ctx.viewport.render());

    ctx.element.style.width = '350px';

    expect(oneDraw).toBeGreaterThan(0);
    expect(
      countRendered(ctx.element, () => ctx.renderingEngine.resize(true, true))
    ).toBe(oneDraw);
    await nextFrame();

    const after = await resizeAndRead(ctx, 300, () => ({
      share: paintedShare(ctx.viewport),
      colour: colourAt(ctx.viewport, ctx.viewport.worldToCanvas(world)),
    }));

    expect(after).toEqual({
      inTask: { share: 1, colour: tinted },
      firstFrame: { share: 1, colour: tinted },
    });
  });
});
