import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { SAMPLED_SLICE_REST_DELAY_MS } from '../src/RenderingEngine/GenericViewport/Planar/planarSampledSliceRest';

const { Enums, volumeLoader, imageLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const SIZE = 128;
const VOXELS = 32;
const VALUE = 200;
const VOI_RANGE = { lower: 0, upper: 255 };

/**
 * The difference of one sample of the four of a multisampled GPU picture on
 * a pixel of VALUE over black, plus a level for the rounding.
 */
const ONE_SAMPLE = VALUE / 4 + 1;

/**
 * The share of the edge pixels of the GPU picture that may differ by one
 * sample: a sample point that lies on the edge, where the rounding of the
 * GPU rasterizer decides.
 */
const MAX_DIFFERING_EDGE_SHARE = 0.125;

const TILTED_ORIENTATION = {
  viewPlaneNormal: [0, 0.5, Math.sqrt(3) / 2],
  viewUp: [0, -Math.sqrt(3) / 2, 0.5],
};

/** Makes a cube volume of VOXELS voxels a side, each of VALUE. */
async function createVolume() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURIExact',
    id: `edge-${utilities.uuidv4()}`,
    rows: VOXELS,
    columns: VOXELS,
    slices: VOXELS,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
    exactRegion: {
      startRow: 0,
      endRow: 0,
      startColumn: 0,
      endColumn: 0,
      startSlice: 0,
      endSlice: 0,
      value: 0,
    },
  });
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: [],
  });

  for (let k = 0; k < VOXELS; k++) {
    for (let j = 0; j < VOXELS; j++) {
      for (let i = 0; i < VOXELS; i++) {
        volume.voxelManager.setAtIJK(i, j, k, VALUE);
      }
    }
  }

  volume.modified();

  return volumeId;
}

/** Loads one image of VOXELS pixels a side, each of VALUE. */
async function createImageIds() {
  const imageId = testUtils.encodeImageIdInfo({
    loader: 'fakeImageLoader',
    name: 'imageURI',
    id: `edge-${utilities.uuidv4()}`,
    rows: VOXELS,
    columns: VOXELS,
    barStart: 0,
    barWidth: 1,
    xSpacing: 1,
    ySpacing: 1,
  });
  const image = await imageLoader.loadAndCacheImage(imageId);

  for (let y = 0; y < VOXELS; y++) {
    for (let x = 0; x < VOXELS; x++) {
      image.voxelManager.setAtIJK(x, y, 0, VALUE);
    }
  }

  return [imageId];
}

function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

/**
 * Waits for the draw of the CPU path at rest, which samples the slice once
 * more on the screen grid, and for the frames of the rendering engine.
 */
async function waitForDraws() {
  await new Promise((resolve) =>
    setTimeout(resolve, 3 * SAMPLED_SLICE_REST_DELAY_MS)
  );

  for (let frame = 0; frame < 3; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** The red channel of each pixel of the canvas that shows the viewport. */
function readRed(viewport) {
  const canvas = Array.from(viewport.element.querySelectorAll('canvas')).find(
    (element) => element.style.display !== 'none' && element.width
  );
  const data = canvas
    .getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height).data;

  return data.filter((_, index) => index % 4 === 0);
}

function createViewport(renderingEngine, viewportId) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.PLANAR,
    orientation: OrientationAxis.AXIAL,
    width: SIZE,
    height: SIZE,
    background: [0, 0, 0],
    useEnableElement: true,
  });

  return renderingEngine.getViewport(viewportId);
}

/** Shows the volume on a planar viewport, axial, with a render backend. */
async function showVolume(renderingEngine, viewportId, volumeId, options) {
  const viewport = createViewport(renderingEngine, viewportId);
  const displaySetId = `volume:${utilities.uuidv4()}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { ...options, orientation: OrientationAxis.AXIAL },
  });
  viewport.setDisplaySetPresentation(displaySetId, { voiRange: VOI_RANGE });
  await renderAndWait(viewport);

  return viewport;
}

/** Shows the image on a planar viewport with a render backend. */
async function showStack(renderingEngine, viewportId, imageIds, options) {
  const viewport = createViewport(renderingEngine, viewportId);
  const displaySetId = `stack:${utilities.uuidv4()}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { ...options, orientation: OrientationAxis.ACQUISITION },
  });
  viewport.setDisplaySetPresentation(displaySetId, { voiRange: VOI_RANGE });
  await renderAndWait(viewport);

  return viewport;
}

/** Applies a view to both viewports and gives their pictures at rest. */
async function drawBoth(gpu, cpu, apply) {
  for (const viewport of [gpu, cpu]) {
    apply(viewport);
    await renderAndWait(viewport);
  }

  await waitForDraws();

  return { gpuRed: readRed(gpu), cpuRed: readRed(cpu) };
}

/**
 * The largest difference between two pictures, the number of pixels that
 * differ, and the number of edge pixels of the first: neither black nor
 * VALUE.
 */
function compare(gpuRed, cpuRed) {
  let max = 0;
  let differing = 0;
  let edge = 0;

  for (let index = 0; index < gpuRed.length; index++) {
    const difference = Math.abs(gpuRed[index] - cpuRed[index]);

    max = Math.max(max, difference);
    differing += difference ? 1 : 0;
    edge += gpuRed[index] > 0 && gpuRed[index] < VALUE ? 1 : 0;
  }

  return { max, differing, edge };
}

describe('The edge pixels of a slice on the CPU against the GPU picture -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('paints a partly covered edge pixel of a rotated volume slice along an axis by the part that the slice covers, as the GPU', async function () {
    const volumeId = await createVolume();
    const gpu = await showVolume(renderingEngine, 'gpu', volumeId, {
      renderBackend: 'gpu',
    });
    const cpu = await showVolume(renderingEngine, 'cpu', volumeId, {
      renderBackend: 'cpu',
    });
    const { gpuRed, cpuRed } = await drawBoth(gpu, cpu, (viewport) =>
      viewport.setViewState({ rotation: 30 })
    );
    const result = compare(gpuRed, cpuRed);

    expect(gpu.getRenderPlan()[0].renderMode).toBe('vtkSampledSlice');
    expect(cpu.getRenderPlan()[0].renderMode).toBe('cpuVolume');
    expect(result.edge).toBeGreaterThan(0);
    expect(result.max).toBeLessThanOrEqual(ONE_SAMPLE);
    expect(result.differing).toBeLessThanOrEqual(
      result.edge * MAX_DIFFERING_EDGE_SHARE
    );
  }, 30000);

  it('paints a partly covered edge pixel of a rotated stack image by the part that the image covers, as the GPU', async function () {
    const imageIds = await createImageIds();
    const gpu = await showStack(renderingEngine, 'gpu', imageIds, {
      renderBackend: 'gpu',
    });
    const cpu = await showStack(renderingEngine, 'cpu', imageIds, {
      renderBackend: 'cpu',
    });
    const { gpuRed, cpuRed } = await drawBoth(gpu, cpu, (viewport) =>
      viewport.setViewState({ rotation: 30 })
    );
    const result = compare(gpuRed, cpuRed);

    expect(gpu.getRenderPlan()[0].renderMode).toBe('vtkImage');
    expect(cpu.getRenderPlan()[0].renderMode).toBe('cpuImage');
    expect(result.edge).toBeGreaterThan(0);
    expect(result.max).toBeLessThanOrEqual(ONE_SAMPLE);
    expect(result.differing).toBeLessThanOrEqual(
      result.edge * MAX_DIFFERING_EDGE_SHARE
    );
  }, 30000);

  it('paints an edge pixel of a tilted volume slice by its centre, as the GPU clips a tilted slice', async function () {
    const volumeId = await createVolume();
    const gpu = await showVolume(renderingEngine, 'gpu', volumeId, {
      renderBackend: 'gpu',
    });
    const cpu = await showVolume(renderingEngine, 'cpu', volumeId, {
      renderBackend: 'cpu',
    });
    const { gpuRed, cpuRed } = await drawBoth(gpu, cpu, (viewport) =>
      viewport.setOrientation(TILTED_ORIENTATION)
    );
    const result = compare(gpuRed, cpuRed);

    expect(gpu.getRenderPlan()[0].renderMode).toBe('vtkSampledSlice');
    expect(result.edge).toBe(0);
    expect(result.differing).toBe(0);
  }, 30000);
});
