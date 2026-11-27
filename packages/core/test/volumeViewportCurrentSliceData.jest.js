import { vec3 } from 'gl-matrix';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import cache from '../src/cache/cache';
import { ViewportType } from '../src/enums';
import { getConfiguration, setConfiguration } from '../src/init';
import { createLocalVolume } from '../src/loaders/volumeLoader';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import VolumeViewport from '../src/RenderingEngine/VolumeViewport';
import getCurrentVolumeViewportSlice from '../src/utilities/getCurrentVolumeViewportSlice';

// Only the default VOI setup is stubbed; the viewport also uses the other
// exports of the module.
jest.mock('../src/RenderingEngine/helpers/setDefaultVolumeVOI', () => ({
  __esModule: true,
  ...jest.requireActual('../src/RenderingEngine/helpers/setDefaultVolumeVOI'),
  default: async () => undefined,
}));

// These tests run a VolumeViewport with its own camera, slice range and
// coordinate transforms. Only WebGL is absent: a vtkRenderer that never draws
// stands in for the rendering engine.

const renderingEngineId = 'current-slice-data';
const canvasSize = 256;
const dimensions = [7, 8, 9];
const spacing = [0.7, 0.8, 2.5];
const origin = [-123.4, -211.9, -487.25];
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const sagittalAcquisition = [0, 1, 0, 0, 0, -1, -1, 0, 0];

// For each direction matrix: the IJK axis that each view holds fixed.
const geometries = [
  ['an axial acquisition', identity, [2, 0, 1]],
  [
    'an axial acquisition stored head to feet',
    [1, 0, 0, 0, 1, 0, 0, 0, -1],
    [2, 0, 1],
  ],
  [
    'an axial acquisition with negative in-plane directions',
    [-1, 0, 0, 0, -1, 0, 0, 0, 1],
    [2, 0, 1],
  ],
  ['a sagittal acquisition', sagittalAcquisition, [1, 2, 0]],
  ['a coronal acquisition', [1, 0, 0, 0, 0, -1, 0, 1, 0], [1, 0, 2]],
];
const views = [
  ['axial', 2],
  ['sagittal', 0],
  ['coronal', 1],
];

let renderedViewport;
const encode = ([i, j, k]) => 10000 * k + 100 * j + i;

function createVolume(volumeId, options = {}) {
  const dims = options.dimensions ?? dimensions;
  const [nx, ny, nz] = dims;
  const scalarData = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        scalarData[i + j * nx + k * nx * ny] = encode([i, j, k]);
      }
    }
  }

  return createLocalVolume(volumeId, {
    dimensions: dims,
    spacing,
    origin,
    direction: identity,
    ...options,
    scalarData,
    metadata: { FrameOfReferenceUID: 'for', Modality: 'MR' },
  });
}

/** The values of one slice, in the storage order of `getSliceData`. */
function storedSlice(axis, sliceIndex, dims) {
  const [first, second] = [0, 1, 2].filter((other) => other !== axis);
  const values = [];
  for (let b = 0; b < dims[second]; b++) {
    for (let a = 0; a < dims[first]; a++) {
      const ijk = [];
      ijk[axis] = sliceIndex;
      ijk[first] = a;
      ijk[second] = b;
      values.push(encode(ijk));
    }
  }
  return values;
}

async function createViewport(orientation, volumes) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = canvasSize;
  const viewport = new VolumeViewport({
    id: 'viewport',
    renderingEngineId,
    type: ViewportType.ORTHOGRAPHIC,
    element: document.createElement('div'),
    canvas,
    sx: 0,
    sy: 0,
    sWidth: canvasSize,
    sHeight: canvasSize,
    defaultOptions: { orientation, suppressEvents: true },
  });
  await viewport.setVolumes(
    volumes.map(({ volumeId }) => ({ volumeId })),
    false,
    true
  );
  renderedViewport = viewport;
  return viewport;
}

/** Moves the view plane to a position along an IJK axis of the default volume. */
function moveTo(viewport, axis, position) {
  const { imageData } = viewport.getImageData();
  const camera = viewport.getCamera();
  const index = Array.from(imageData.worldToIndex(camera.focalPoint));
  index[axis] = position;
  const focalPoint = Array.from(imageData.indexToWorld(index));
  viewport.setCamera({
    focalPoint,
    position: camera.position.map(
      (value, n) => value + focalPoint[n] - camera.focalPoint[n]
    ),
  });
}

function expectSlice(viewport, axis, sliceIndex, dims = dimensions) {
  const expected = storedSlice(axis, sliceIndex, dims);

  expect(Array.from(viewport.getCurrentSlicePixelData())).toEqual(expected);

  const { scalarData, sliceToIndexMatrix, indexToSliceMatrix } =
    getCurrentVolumeViewportSlice(viewport);
  expect(Array.from(scalarData)).toEqual(expected);

  // Inside the volume, the data is of the slice that the returned matrices
  // put their points on.
  const point = vec3.transformMat4([], [0, 0, 0], sliceToIndexMatrix);
  if (point[axis] >= 0 && point[axis] < dims[axis]) {
    expect(point[axis]).toBe(sliceIndex);
    expect(vec3.transformMat4([], point, indexToSliceMatrix)[2]).toBeCloseTo(
      0,
      5
    );
  }
}

describe('VolumeViewport current slice data', () => {
  let configuration;

  beforeEach(() => {
    configuration = getConfiguration();
    setConfiguration({
      ...configuration,
      rendering: {
        ...configuration.rendering,
        renderingEngineMode: 'contextPool',
      },
    });
    const renderer = vtkRenderer.newInstance();
    renderer.setViewport(0, 0, 1, 1);
    renderingEngineCache.set({
      id: renderingEngineId,
      hasBeenDestroyed: false,
      getRenderer: () => renderer,
      getViewport: () => renderedViewport,
      getViewports: () => [renderedViewport],
      renderViewport: () => undefined,
    });
  });

  afterEach(() => {
    cache.purgeCache();
    renderingEngineCache.delete(renderingEngineId);
    setConfiguration(configuration);
  });

  describe.each(geometries)('%s', (_, direction, slicedAxes) => {
    it.each(views.map(([name], n) => [name, slicedAxes[n]]))(
      'returns every displayed slice in the %s view',
      async (name, axis) => {
        const viewport = await createViewport(name, [
          createVolume('volume', { direction }),
        ]);

        for (let index = 0; index < dimensions[axis]; index++) {
          moveTo(viewport, axis, index);
          expectSlice(viewport, axis, index);
        }
      }
    );
  });

  describe.each(views)('the %s view', (name, axis) => {
    it.each([
      ['flipped horizontally', (v) => v.setCamera({ flipHorizontal: true })],
      ['flipped vertically', (v) => v.setCamera({ flipVertical: true })],
      ['turned by 90', (v) => v.setViewPresentation({ rotation: 90 })],
      ['turned by 180', (v) => v.setViewPresentation({ rotation: 180 })],
    ])('returns the displayed slice when %s', async (_, change) => {
      const viewport = await createViewport(name, [createVolume('volume')]);
      const before = viewport.getCamera();

      moveTo(viewport, axis, 2);
      change(viewport);

      const { viewUp, viewPlaneNormal } = viewport.getCamera();
      expect([viewUp, viewPlaneNormal]).not.toEqual([
        before.viewUp,
        before.viewPlaneNormal,
      ]);
      expectSlice(viewport, axis, 2);
    });

    it('returns the end slices past the ends of the volume', async () => {
      const viewport = await createViewport(name, [createVolume('volume')]);

      moveTo(viewport, axis, -2.2);
      expectSlice(viewport, axis, 0);
      moveTo(viewport, axis, dimensions[axis] + 1.2);
      expectSlice(viewport, axis, dimensions[axis] - 1);
    });
  });

  it('returns the nearest slice between two slices', async () => {
    const viewport = await createViewport('sagittal', [createVolume('volume')]);

    for (const [position, index] of [
      [1.3, 1],
      [1.7, 2],
      [4.4, 4],
      [4.6, 5],
    ]) {
      moveTo(viewport, 0, position);
      expectSlice(viewport, 0, index);
    }
  });

  it.each(views)(
    'returns the slice toward the camera halfway, in the %s view',
    async (name, axis) => {
      const viewport = await createViewport(name, [createVolume('volume')]);
      const toCamera = viewport.getCamera().viewPlaneNormal[axis] > 0 ? 1 : 0;
      for (let index = 0; index < dimensions[axis] - 1; index++) {
        moveTo(viewport, axis, index + 0.5);
        expectSlice(viewport, axis, index + toCamera);
      }
    }
  );

  it('returns the slice toward the camera halfway after a pan', async () => {
    const viewport = await createViewport('axial', [
      createVolume('volume', {
        spacing: [0.7, 0.8, 5],
        origin: [origin[0], origin[1], -487.3],
      }),
    ]);
    moveTo(viewport, 2, 3.5);

    // setPan rounds the focal point to single precision, here past the tie
    const [x, y] = viewport.getPan();
    viewport.setPan([x + 3, y + 2]);

    expectSlice(viewport, 2, 3);
  });

  it.each(views)(
    'puts the matrices on the end slices on the outer faces, in the %s view',
    async (name, axis) => {
      const viewport = await createViewport(name, [createVolume('volume')]);
      const last = dimensions[axis] - 1;

      for (const [position, index] of [
        [-0.5, 0],
        [last + 0.5, last],
      ]) {
        moveTo(viewport, axis, position);
        expectSlice(viewport, axis, index);

        const { sliceToIndexMatrix } = getCurrentVolumeViewportSlice(viewport);
        expect(sliceToIndexMatrix[12 + axis]).toBe(index);
      }
    }
  );

  it('returns the only slice of a single-slice volume', async () => {
    const dims = [7, 8, 1];
    const viewport = await createViewport('axial', [
      createVolume('volume', { dimensions: dims }),
    ]);

    expectSlice(viewport, 2, 0, dims);
  });

  it('indexes the default volume of a fusion, not the finest one', async () => {
    const coarse = createVolume('coarse');
    const fine = createVolume('fine', {
      dimensions: [7, 8, 31],
      spacing: [0.7, 0.8, 1],
      origin: [origin[0], origin[1], origin[2] - 4],
    });
    const viewport = await createViewport('axial', [coarse, fine]);

    for (let index = 0; index < dimensions[2]; index++) {
      moveTo(viewport, 2, index);
      expectSlice(viewport, 2, index);
    }
  });

  it('leaves sliceIndex and slicePlane of getSliceViewInfo as they are', async () => {
    const viewport = await createViewport('axial', [
      createVolume('volume', { direction: sagittalAcquisition }),
    ]);
    moveTo(viewport, 1, 6);

    const { sliceIndex, slicePlane } = viewport.getSliceViewInfo();

    expect(sliceIndex).toBe(viewport.getSliceIndex());
    expect(slicePlane).toBe(2);
  });

  it('still throws for an oblique view', async () => {
    const viewport = await createViewport('axial', [createVolume('volume')]);
    const { focalPoint } = viewport.getCamera();
    const normal = [0, 0.6, -0.8];
    viewport.setCamera({
      focalPoint,
      viewPlaneNormal: normal,
      viewUp: [0, -0.8, -0.6],
      position: focalPoint.map((value, n) => value + 100 * normal[n]),
    });

    const message = 'getSliceInfo is not supported for oblique views';
    expect(() => viewport.getCurrentSlicePixelData()).toThrow(message);
    expect(() => getCurrentVolumeViewportSlice(viewport)).toThrow(message);
  });
});
