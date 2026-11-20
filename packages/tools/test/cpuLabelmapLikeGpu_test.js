import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, imageLoader, volumeLoader, cache } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const { segmentation, Enums: csToolsEnums } = csTools3d;
const { Labelmap } = csToolsEnums.SegmentationRepresentations;

const renderingEngineId = 'renderingEngineId-cpuLabelmapLikeGpu_test';
const toolGroupId = 'toolGroupId-cpuLabelmapLikeGpu_test';
const gpuViewportId = 'GPU_LABELMAP_VIEWPORT';
const cpuViewportId = 'CPU_LABELMAP_VIEWPORT';
const size = 64;

/**
 * The tolerance of the Playwright pictures under `--cpu`: a pixel differs
 * when its colour distance is above the threshold 0.1 of Playwright's
 * comparator, and a picture may differ in 0.2 percent of its pixels.
 */
const CPU_PICTURE_THRESHOLD = 0.1;
const CPU_PICTURE_MAX_DIFF_PIXEL_RATIO = 0.002;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rgb2y(r, g, b) {
  return r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
}

function rgb2i(r, g, b) {
  return r * 0.59597799 - g * 0.2741761 - b * 0.32180189;
}

function rgb2q(r, g, b) {
  return r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
}

/**
 * Counts the pixels that differ by more than the colour threshold, with the
 * colour distance of pixelmatch, the comparator of Playwright. Unlike
 * Playwright it does not forgive antialiased pixels, so it is stricter.
 */
function countDifferentPixels(expected, actual, threshold) {
  const maxDelta = 35215 * threshold * threshold;
  let count = 0;

  for (let index = 0; index < expected.data.length; index += 4) {
    const [r1, g1, b1] = expected.data.slice(index, index + 3);
    const [r2, g2, b2] = actual.data.slice(index, index + 3);
    const y = rgb2y(r1, g1, b1) - rgb2y(r2, g2, b2);
    const i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2);
    const q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2);
    const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;

    if (delta > maxDelta) {
      count++;
    }
  }

  return count;
}

function readPicture(viewport) {
  const canvas = viewport.getCanvas();
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext('2d');
  context.drawImage(canvas, 0, 0);

  return context.getImageData(0, 0, copy.width, copy.height);
}

/**
 * Expects the picture of the CPU viewport to be the picture of the GPU
 * viewport under the tolerance of the `--cpu` Playwright run.
 */
function expectCpuPictureLikeGpu(gpuViewport, cpuViewport) {
  const expected = readPicture(gpuViewport);
  const actual = readPicture(cpuViewport);

  expect([actual.width, actual.height]).toEqual([
    expected.width,
    expected.height,
  ]);

  const different = countDifferentPixels(
    expected,
    actual,
    CPU_PICTURE_THRESHOLD
  );
  const allowed = Math.floor(
    expected.width * expected.height * CPU_PICTURE_MAX_DIFF_PIXEL_RATIO
  );

  expect(different)
    .withContext(`pixels that differ from the GPU picture (${allowed} allowed)`)
    .toBeLessThanOrEqual(allowed);
}

function disk(cx, cy, r, value) {
  return { value, contains: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 < r * r };
}

function rect(x0, y0, x1, y1, value) {
  return {
    value,
    contains: (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1,
  };
}

/** The label of a pixel: the value of the last shape that holds it. */
function labelAt(shapes, x, y) {
  let label = 0;

  shapes.forEach((shape) => {
    if (shape.contains(x, y)) {
      label = shape.value;
    }
  });

  return label;
}

function fillImage(image, shapes) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const label = labelAt(shapes, x, y);

      if (label) {
        image.voxelManager.setAtIndex(y * size + x, label);
      }
    }
  }
}

function fillVolume(volume, shapes) {
  const [columns, rows, slices] = volume.dimensions;

  for (let z = 0; z < slices; z++) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const label = labelAt(shapes, x, y);

        if (label) {
          volume.voxelManager.setAtIndex((z * rows + y) * columns + x, label);
        }
      }
    }
  }
}

function createGpuAndCpuViewports(renderingEngine) {
  testUtils.createViewports(renderingEngine, [
    {
      viewportType: ViewportType.PLANAR,
      viewportId: gpuViewportId,
      orientation: OrientationAxis.AXIAL,
      width: 256,
      height: 256,
    },
    {
      viewportType: ViewportType.PLANAR,
      viewportId: cpuViewportId,
      orientation: OrientationAxis.AXIAL,
      width: 256,
      height: 256,
    },
  ]);

  return [
    renderingEngine.getViewport(gpuViewportId),
    renderingEngine.getViewport(cpuViewportId),
  ];
}

/**
 * Shows a stack of one fake image on both viewports, the second on the CPU,
 * and makes one labelmap image per list of shapes.
 * @returns The ids of the segmentations, in the order of the lists.
 */
async function showStackWithLabelmaps(viewports, shapeLists) {
  const imageId = testUtils.encodeImageIdInfo({
    loader: 'fakeImageLoader',
    name: 'imageURI',
    rows: size,
    columns: size,
    barStart: 10,
    barWidth: 5,
    xSpacing: 1,
    ySpacing: 1,
    sliceIndex: 0,
  });

  await testUtils.setStackOnNextViewport(viewports[0], [imageId], 0);
  await testUtils.setStackOnNextViewport(viewports[1], [imageId], 0, {
    renderBackend: 'cpu',
  });

  return shapeLists.map((shapes, index) => {
    const segmentationId = `stackLabelmap${index}`;
    const labelmapImage =
      imageLoader.createAndCacheDerivedLabelmapImage(imageId);

    fillImage(labelmapImage, shapes);
    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: Labelmap,
          data: { imageIds: [labelmapImage.imageId] },
        },
      },
    ]);

    return segmentationId;
  });
}

/**
 * Shows a fake volume of 64 x 64 x 10 voxels on both viewports, the second on
 * the CPU, and makes one labelmap volume per list of shapes (the same shapes
 * on every slice).
 * @returns The ids of the segmentations, in the order of the lists.
 */
async function showVolumeWithLabelmaps(viewports, shapeLists) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    rows: size,
    columns: size,
    slices: 10,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  await testUtils.setVolumesOnNextViewport(viewports[0], [volumeId]);
  await testUtils.setVolumesOnNextViewport(viewports[1], [volumeId], {
    renderBackend: 'cpu',
  });

  return shapeLists.map((shapes, index) => {
    const segmentationId = `volumeLabelmap${index}`;

    volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
      volumeId: segmentationId,
    });
    fillVolume(cache.getVolume(segmentationId), shapes);
    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: Labelmap,
          data: { volumeId: segmentationId },
        },
      },
    ]);

    return segmentationId;
  });
}

/**
 * Adds the labelmaps to both viewports, one after the other, and lets both
 * draw them.
 */
async function addLabelmapsAndDraw(renderingEngine, segmentationIds) {
  for (const segmentationId of segmentationIds) {
    for (const viewportId of [gpuViewportId, cpuViewportId]) {
      await segmentation.addSegmentationRepresentations(viewportId, [
        { segmentationId, type: Labelmap },
      ]);
    }
    await wait(100);
  }

  for (let pass = 0; pass < 3; pass++) {
    renderingEngine.render();
    await wait(300);
  }
}

/**
 * True when the GPU viewport draws on the GPU and the CPU viewport on the
 * CPU. A karma run that draws every viewport on the CPU has no GPU picture.
 */
function drawsOnBothBackends(gpuViewport, cpuViewport) {
  const gpuLayers = gpuViewport.getRenderPlan();
  const cpuLayers = cpuViewport.getRenderPlan();

  expect(cpuLayers.length).toBeGreaterThan(1);
  cpuLayers.forEach((layer) => expect(layer.draw).toBe('cpu'));

  return gpuLayers.every((layer) => layer.draw === 'gpu');
}

const outlineStyle = {
  renderOutline: true,
  renderOutlineInactive: true,
  outlineWidth: 2,
  activeSegmentOutlineWidthDelta: 2,
  outlineWidthInactive: 1,
  renderFill: true,
  renderFillInactive: true,
  fillAlpha: 0.5,
  fillAlphaInactive: 0.3,
  outlineOpacity: 1,
  outlineOpacityInactive: 0.7,
};

const overlapStyle = {
  renderOutline: false,
  renderOutlineInactive: false,
  renderFill: true,
  renderFillInactive: true,
  fillAlpha: 0.9,
  fillAlphaInactive: 0.9,
};

/**
 * The labelmaps of the outline scenes: an active segmentation with two
 * segments that touch and a block at a corner of the image, and an inactive
 * segmentation that does not overlap it.
 */
const outlineShapes = [
  [
    disk(24, 26, 12, 1),
    disk(38, 30, 9, 2),
    rect(0, 52, 10, size, 1),
    rect(54, 0, size, 8, 2),
  ],
  [disk(48, 52, 7, 3)],
];

/** The labelmaps of the overlap scenes: two blocks of other colours. */
const overlapShapes = [[rect(10, 10, 40, 40, 1)], [rect(25, 25, 55, 55, 2)]];

describe('A labelmap on a CPU planar viewport looks as on the GPU:', () => {
  let renderingEngine;
  let globalLabelmapStyle;

  beforeEach(() => {
    const setup = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      viewportIds: [gpuViewportId, cpuViewportId],
    });

    renderingEngine = setup.renderingEngine;
    globalLabelmapStyle = {
      ...segmentation.config.style.getStyle({ type: Labelmap }),
    };
  });

  afterEach(() => {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      cleanupDOMElements: true,
    });
    segmentation.config.style.setStyle(
      { type: Labelmap },
      globalLabelmapStyle,
      false
    );
  });

  it('draws the outlines of the labelmaps of a stack as the GPU does', async () => {
    const viewports = createGpuAndCpuViewports(renderingEngine);
    const segmentationIds = await showStackWithLabelmaps(
      viewports,
      outlineShapes
    );

    segmentation.config.style.setStyle({ type: Labelmap }, outlineStyle);
    await addLabelmapsAndDraw(renderingEngine, segmentationIds);

    if (!drawsOnBothBackends(...viewports)) {
      pending('this karma run draws every viewport on the CPU');
    }

    expectCpuPictureLikeGpu(...viewports);
  });

  it('draws the outlines of the labelmaps of a volume as the GPU does', async () => {
    const viewports = createGpuAndCpuViewports(renderingEngine);
    const segmentationIds = await showVolumeWithLabelmaps(
      viewports,
      outlineShapes
    );

    segmentation.config.style.setStyle({ type: Labelmap }, outlineStyle);
    await addLabelmapsAndDraw(renderingEngine, segmentationIds);

    if (!drawsOnBothBackends(...viewports)) {
      pending('this karma run draws every viewport on the CPU');
    }

    expectCpuPictureLikeGpu(...viewports);
  });

  it('blends two overlapping labelmaps of a stack as the GPU does', async () => {
    const viewports = createGpuAndCpuViewports(renderingEngine);
    const segmentationIds = await showStackWithLabelmaps(
      viewports,
      overlapShapes
    );

    segmentation.config.style.setStyle({ type: Labelmap }, overlapStyle);
    await addLabelmapsAndDraw(renderingEngine, segmentationIds);

    if (!drawsOnBothBackends(...viewports)) {
      pending('this karma run draws every viewport on the CPU');
    }

    expectCpuPictureLikeGpu(...viewports);
  });

  it('blends two overlapping labelmaps of a volume as the GPU does', async () => {
    const viewports = createGpuAndCpuViewports(renderingEngine);
    const segmentationIds = await showVolumeWithLabelmaps(
      viewports,
      overlapShapes
    );

    segmentation.config.style.setStyle({ type: Labelmap }, overlapStyle);
    await addLabelmapsAndDraw(renderingEngine, segmentationIds);

    if (!drawsOnBothBackends(...viewports)) {
      pending('this karma run draws every viewport on the CPU');
    }

    expectCpuPictureLikeGpu(...viewports);
  });
});
