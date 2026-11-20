import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { SAMPLED_SLICE_REST_DELAY_MS } from '../src/RenderingEngine/GenericViewport/Planar/planarSampledSliceRest';

const { Enums, volumeLoader, imageLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events, InterpolationType } = Enums;

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

/**
 * A view tilted about two axes: its cut through the cube is no rectangle of
 * the slice, so the rectangle of the slice has corners outside the volume.
 */
const OBLIQUE_ORIENTATION = {
  viewPlaneNormal: [1 / Math.sqrt(6), 1 / Math.sqrt(6), 2 / Math.sqrt(6)],
  viewUp: [0, -2 / Math.sqrt(5), 1 / Math.sqrt(5)],
};

/**
 * Makes a cube volume of VOXELS voxels a side, each of VALUE, or of the value
 * that `valueOf(i, j, k)` gives.
 */
async function createVolume(valueOf = () => VALUE) {
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
        volume.voxelManager.setAtIJK(i, j, k, valueOf(i, j, k));
      }
    }
  }

  volume.modified();

  return volumeId;
}

/**
 * Loads one image of VOXELS pixels a side, each of VALUE, or of the value
 * that `valueOf(x, y)` gives.
 */
async function createImageIds(valueOf = () => VALUE) {
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
      image.voxelManager.setAtIJK(x, y, 0, valueOf(x, y));
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

/**
 * Adds a labelmap of the volume with every voxel of label 1 to a viewport as
 * a segmentation overlay, drawn opaque green. Its images say that their
 * lowest and highest value is 1, as the images of a loaded mask of every
 * voxel do, so the range of the labelmap is [1, 1].
 */
async function addFullLabelmap(viewport, volumeId) {
  const labelmapId = `labelmap-${utilities.uuidv4()}`;
  const labelmap = volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: labelmapId,
  });
  const representationUID = `${labelmapId}-Labelmap`;

  for (let k = 0; k < VOXELS; k++) {
    for (let j = 0; j < VOXELS; j++) {
      for (let i = 0; i < VOXELS; i++) {
        labelmap.voxelManager.setAtIJK(i, j, k, 1);
      }
    }
  }

  labelmap.imageIds.forEach((imageId) => {
    const image = cache.getImage(imageId);

    image.minPixelValue = 1;
    image.maxPixelValue = 1;
  });
  labelmap.modified();
  utilities.genericViewportDisplaySetMetadataProvider.add(representationUID, {
    kind: 'planar',
    imageIds: labelmap.imageIds,
    initialImageIdIndex: 0,
    volumeId: labelmapId,
    reference: {
      kind: 'segmentation',
      segmentationId: labelmapId,
      representationUID,
      labelmapId,
    },
  });
  await viewport.addDisplaySet(representationUID, {
    role: 'overlay',
    renderBackend: 'cpu',
  });

  const colours = vtkColorTransferFunction.newInstance();

  colours.addRGBPoint(0, 0, 0, 0);
  colours.addRGBPoint(1, 0, 1, 0);

  const { actor } = viewport
    .getActors()
    .find((entry) => entry.representationUID === representationUID);

  actor.getProperty().setRGBTransferFunction(0, colours);
  actor.getProperty().setScalarOpacity(1);
  actor.modified();
}

/** The red and green channels of each pixel of the canvas of the viewport. */
function readRedGreen(viewport) {
  const canvas = Array.from(viewport.element.querySelectorAll('canvas')).find(
    (element) => element.style.display !== 'none' && element.width
  );
  const data = canvas
    .getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height).data;

  return {
    red: data.filter((_, index) => index % 4 === 0),
    green: data.filter((_, index) => index % 4 === 1),
  };
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

/**
 * Stripes one voxel wide, VALUE and a fifth of it, so that the value changes
 * along each face that crosses them.
 */
function stripes(x) {
  return x % 2 ? VALUE : VALUE / 5;
}

/**
 * Turns the view by 45 degrees and makes a canvas pixel about one voxel
 * (scale 0.33), with linear interpolation: along a face the point of the
 * slice under the centre of a pixel then moves by about a stripe from one
 * pixel to the next. Measured on the GPU picture before the change of
 * `clearOutsideVolume`: 44 of 236 edge pixels of the CPU picture differed by
 * more than a tenth of VALUE, none after it.
 */
function showStripedEdges(viewport) {
  viewport.setDisplaySetPresentation(viewport.getRenderPlan()[0].dataId, {
    interpolationType: InterpolationType.LINEAR,
  });
  viewport.setViewState({ rotation: 45, scale: [0.33, 0.33] });
}

/** Whether a layer of voxels is one of the two in the middle of the volume. */
function isMiddleLayer(k) {
  return k === VOXELS / 2 - 1 || k === VOXELS / 2;
}

/**
 * The view of `showStripedEdges` with a maximum slab of 4 mm, which the GPU
 * draws on its volume path. The plane of the slab lies on the middle layers,
 * and the slab reaches the layers beside them. The GPU volume path shows
 * nothing of the slab on a pixel whose centre lies outside the faces.
 * Measured before the change of `clearOutsideVolume`: with stripes on the
 * middle layers only, 88 of 348 edge pixels of the CPU picture differed by
 * more than a tenth of VALUE, up to half of VALUE.
 */
function showStripedSlabEdges(viewport) {
  viewport.setDisplaySetPresentation(viewport.getRenderPlan()[0].dataId, {
    interpolationType: InterpolationType.LINEAR,
    slabThickness: 4,
    blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
  });
  viewport.setViewState({ rotation: 45, scale: [0.33, 0.33] });
}

/**
 * Shows a volume on a GPU and a CPU viewport with the view of
 * `showStripedSlabEdges` and compares the edge pixels of their pictures.
 */
async function compareStripedSlabEdges(renderingEngine, valueOf) {
  const volumeId = await createVolume(valueOf);
  const gpu = await showVolume(renderingEngine, 'gpu', volumeId, {
    renderBackend: 'gpu',
  });
  const cpu = await showVolume(renderingEngine, 'cpu', volumeId, {
    renderBackend: 'cpu',
  });
  const { gpuRed, cpuRed } = await drawBoth(gpu, cpu, showStripedSlabEdges);

  expect(gpu.getRenderPlan()[0].renderMode).toBe('vtkVolumeSlice');
  expect(cpu.getRenderPlan()[0].renderMode).toBe('cpuVolume');

  return compareEdges(gpuRed, cpuRed);
}

/**
 * Compares two pictures on the edge pixels of the first: the pixels shown in
 * either picture with a pixel of the background of the first beside them or
 * at a corner. Gives the number of edge pixels, their largest difference and
 * the number of them that differ by more than a tenth of VALUE.
 */
function compareEdges(gpuRed, cpuRed) {
  const width = Math.round(Math.sqrt(gpuRed.length));
  let edge = 0;
  let max = 0;
  let differing = 0;

  for (let index = 0; index < gpuRed.length; index++) {
    const column = index % width;
    const nextToBackground = [-1, 0, 1].some((rowStep) =>
      [-1, 0, 1].some(
        (columnStep) =>
          column + columnStep < 0 ||
          column + columnStep >= width ||
          !(gpuRed[index + rowStep * width + columnStep] > 0)
      )
    );

    if ((!gpuRed[index] && !cpuRed[index]) || !nextToBackground) {
      continue;
    }

    const difference = Math.abs(gpuRed[index] - cpuRed[index]);

    edge++;
    max = Math.max(max, difference);
    differing += difference > VALUE / 10 ? 1 : 0;
  }

  return { edge, max, differing };
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

  it('paints a partly covered edge pixel of a rotated striped stack image with the value at its centre moved onto the image, as the GPU', async function () {
    const imageIds = await createImageIds(stripes);
    const gpu = await showStack(renderingEngine, 'gpu', imageIds, {
      renderBackend: 'gpu',
    });
    const cpu = await showStack(renderingEngine, 'cpu', imageIds, {
      renderBackend: 'cpu',
    });
    const { gpuRed, cpuRed } = await drawBoth(gpu, cpu, showStripedEdges);
    const result = compareEdges(gpuRed, cpuRed);

    expect(gpu.getRenderPlan()[0].renderMode).toBe('vtkImage');
    expect(cpu.getRenderPlan()[0].renderMode).toBe('cpuImage');
    expect(result.edge).toBeGreaterThan(0);
    expect(result.max).toBeLessThanOrEqual(ONE_SAMPLE);
    expect(result.differing).toBeLessThanOrEqual(
      result.edge * MAX_DIFFERING_EDGE_SHARE
    );
  }, 30000);

  it('paints a partly covered edge pixel of a rotated striped volume slice with the value at its centre moved onto the face, as the GPU', async function () {
    const volumeId = await createVolume(stripes);
    const gpu = await showVolume(renderingEngine, 'gpu', volumeId, {
      renderBackend: 'gpu',
    });
    const cpu = await showVolume(renderingEngine, 'cpu', volumeId, {
      renderBackend: 'cpu',
    });
    const { gpuRed, cpuRed } = await drawBoth(gpu, cpu, showStripedEdges);
    const result = compareEdges(gpuRed, cpuRed);

    expect(gpu.getRenderPlan()[0].renderMode).toBe('vtkSampledSlice');
    expect(cpu.getRenderPlan()[0].renderMode).toBe('cpuVolume');
    expect(result.edge).toBeGreaterThan(0);
    expect(result.max).toBeLessThanOrEqual(ONE_SAMPLE);
    expect(result.differing).toBeLessThanOrEqual(
      result.edge * MAX_DIFFERING_EDGE_SHARE
    );
  }, 30000);

  it('shows nothing of a rotated maximum slab on a partly covered edge pixel whose centre lies outside the faces, as the GPU volume path, where the middle layers are bright', async function () {
    const result = await compareStripedSlabEdges(renderingEngine, (i, j, k) =>
      isMiddleLayer(k) ? stripes(i) : VALUE / 5
    );

    expect(result.edge).toBeGreaterThan(0);
    expect(result.max).toBeLessThanOrEqual(ONE_SAMPLE);
    expect(result.differing).toBeLessThanOrEqual(
      result.edge * MAX_DIFFERING_EDGE_SHARE
    );
  }, 30000);

  it('shows nothing of a rotated maximum slab on a partly covered edge pixel whose centre lies outside the faces, as the GPU volume path, where only the layers beside the middle are bright', async function () {
    const result = await compareStripedSlabEdges(renderingEngine, (i, j, k) =>
      isMiddleLayer(k) ? VALUE / 5 : stripes(i)
    );

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

  it('draws a labelmap of every voxel on an oblique slice only inside the faces of the volume, where the slice is drawn', async function () {
    const volumeId = await createVolume();
    const cpu = await showVolume(renderingEngine, 'cpu', volumeId, {
      renderBackend: 'cpu',
    });

    cpu.setOrientation(OBLIQUE_ORIENTATION);
    await renderAndWait(cpu);
    await waitForDraws();

    const slice = readRed(cpu);

    await addFullLabelmap(cpu, volumeId);
    await renderAndWait(cpu);
    await waitForDraws();

    const { red, green } = readRedGreen(cpu);
    const width = Math.round(Math.sqrt(slice.length));
    const isNextToSlice = (index) =>
      [-1, 0, 1].some((rowStep) =>
        [-1, 0, 1].some((columnStep) => {
          const column = (index % width) + columnStep;
          const neighbour = index + rowStep * width + columnStep;

          return column >= 0 && column < width && slice[neighbour] > 0;
        })
      );
    let inside = 0;
    let labelledFarOutside = 0;
    let unlabelledInside = 0;

    slice.forEach((value, index) => {
      const labelled = green[index] > red[index];

      if (value > 0) {
        inside++;
        unlabelledInside += labelled ? 0 : 1;
      } else if (labelled && !isNextToSlice(index)) {
        labelledFarOutside++;
      }
    });

    expect(cpu.getRenderPlan().length).toBe(2);
    cpu
      .getRenderPlan()
      .forEach((layer) => expect(layer.renderMode).toBe('cpuVolume'));
    expect(inside).toBeGreaterThan(0);
    expect(inside).toBeLessThan(slice.length);
    expect(labelledFarOutside).toBe(0);
    expect(unlabelledInside).toBe(0);
  }, 30000);
});
