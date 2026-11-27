import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import {
  Events,
  ImageQualityStatus,
  MetadataModules,
  OrientationAxis,
  ViewportType,
} from '../src/enums';
import * as metaData from '../src/metaData';
import cache from '../src/cache/cache';
import eventTarget from '../src/eventTarget';
import triggerEvent from '../src/utilities/triggerEvent';
import VoxelManager from '../src/utilities/VoxelManager';
import { init, resetInitialization, setSliceFirst } from '../src/init';
import * as setDefaultVolumeVOIModule from '../src/RenderingEngine/helpers/setDefaultVolumeVOI';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import { create2DStandIn, createWebGL2StandIn } from './utils/webglStandIn';

/**
 * Row 359 (lane FX27): the first frame of a planar pane on the sampled slice
 * path built the program, the colour and opacity textures and the image
 * texture of its layer when its first slice was drawn, so the first content
 * of a pane came tens of ms after the first frame of its volume. A layer
 * mounted before any frame of its plane arrived is now built after the first
 * picture of the pane, drawn without showing it, and its first slice only
 * uploads its pixels, in the frame of the update that sampled it.
 *
 * The real context pool engine draws the panes with the vtk.js OpenGL
 * classes on a WebGL2 stand-in (`utils/webglStandIn`), which records the calls
 * of the context of the engine.
 */

const mockShaderHashes = { count: 0 };

jest.mock('spark-md5', () => {
  const actual = jest.requireActual('spark-md5');
  const SparkMD5 = actual.default ?? actual;

  return {
    __esModule: true,
    default: {
      ...SparkMD5,
      hash: (...args) => {
        mockShaderHashes.count++;

        return SparkMD5.hash(...args);
      },
    },
  };
});

jest.mock('../src/utilities/renderingCapabilities', () => {
  const actual = jest.requireActual('../src/utilities/renderingCapabilities');

  return {
    ...actual,
    getRenderingCapabilities: () => ({
      webgl: true,
      maxTextureSize: 4096,
      max3DTextureSize: 2048,
      renderer: 'WebGL 2.0 stand-in',
      softwareRasterizer: false,
      webglCanvasCopy: true,
      norm16: true,
      norm16Linear: true,
      float: true,
      floatLinear: true,
      halfFloat: true,
      halfFloatLinear: true,
    }),
  };
});

const dimensions = [8, 6, 10];
const frameSize = dimensions[0] * dimensions[1];
const SIZE = 64;
const glCalls = new WeakMap();
const engines = [];
const cachedImageIds = [];
const providers = [];
let volumes = [];

/** Waits for the given number of animation frames. */
async function frames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Lets the tasks that wait for an idle period or a background task run. */
async function idleTasks() {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(function (type) {
      if (type === '2d') {
        this.standIn2D ||= create2DStandIn(this);

        return this.standIn2D;
      }

      if (!this.standInGL) {
        const calls = {};

        this.standInGL = createWebGL2StandIn(this, calls);
        glCalls.set(this, calls);
      }

      return this.standInGL;
    });
  ['clientWidth', 'clientHeight'].forEach((key) =>
    jest
      .spyOn(HTMLCanvasElement.prototype, key, 'get')
      .mockImplementation(() => SIZE)
  );
  jest
    .spyOn(cache, 'getVolume')
    .mockImplementation((id) =>
      volumes.find((volume) => volume.volumeId === id)
    );
  jest
    .spyOn(setDefaultVolumeVOIModule, 'getDefaultVolumeVOIRange')
    .mockResolvedValue({ lower: 0, upper: 60 });
  resetInitialization();
  init();
});

afterEach(() => {
  engines.splice(0).forEach((engine) => engine.destroy());
  providers.splice(0).forEach((provider) => metaData.removeProvider(provider));
  cachedImageIds.splice(0).forEach((imageId) => {
    if (cache.getImage(imageId)) {
      cache.removeImageLoadObject(imageId);
    }
  });
  volumes = [];
  setSliceFirst(false);
  displaySetRegistry.clear();
  document.body.innerHTML = '';
  jest.restoreAllMocks();
  resetInitialization();
});

function putFrame(imageId, k, ArrayType) {
  const scalarData = new ArrayType(frameSize).map(
    (_, index) => 10 + ((index * 7 + k * 31) % 50)
  );

  cache.putImageSync(imageId, {
    imageId,
    width: dimensions[0],
    height: dimensions[1],
    voxelManager: VoxelManager.createImageVoxelManager({
      width: dimensions[0],
      height: dimensions[1],
      scalarData,
      numberOfComponents: 1,
    }),
    getPixelData: () => scalarData,
    minPixelValue: 10,
    maxPixelValue: 59,
    sizeInBytes: scalarData.byteLength,
  });
  cachedImageIds.push(imageId);
}

/**
 * A streaming volume of one cached image per frame, acquired axially, in
 * the array type `ArrayType`, none of whose frames has arrived, with a
 * metadata provider of its image planes.
 */
function createStreamingVolume(name, ArrayType) {
  const imageIds = Array.from(
    { length: dimensions[2] },
    (_, k) => `${name}:${k}`
  );
  const spacing = [1, 1, 2];
  const origin = [0, 0, 0];
  const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const imageData = vtkImageData.newInstance({ spacing, origin, direction });
  const delivered = new Set();

  imageData.setDimensions(dimensions);

  const voxelManager = VoxelManager.createImageVolumeVoxelManager({
    dimensions,
    imageIds,
    numberOfComponents: 1,
    dataType: ArrayType.name,
  });
  const volume = {
    volumeId: `${name}-volume`,
    imageIds,
    dimensions,
    spacing,
    direction,
    origin,
    dataType: ArrayType.name,
    voxelGrid: { dimensions, spacing, direction, origin },
    isDynamicVolume: () => false,
    imageData,
    metadata: { FrameOfReferenceUID: 'first-slice-frame' },
    loadStatus: { loaded: false, loading: true },
    load: jest.fn(),
    getVoxelQuality: jest.fn((options) => {
      const [from, to] = options?.region?.[2] ?? [0, dimensions[2] - 1];
      let missing = 0;

      for (let k = from; k <= to; k++) {
        missing += delivered.has(k) ? 0 : frameSize;
      }

      return {
        status: missing
          ? ImageQualityStatus.FAR_REPLICATE
          : ImageQualityStatus.FULL_RESOLUTION,
        missing,
        grid: { dimensions, spacing, direction, origin },
      };
    }),
    voxelManager,
  };
  const provider = (type, imageId) => {
    const i = imageIds.indexOf(imageId);

    if (i < 0 || type !== MetadataModules.IMAGE_PLANE) {
      return;
    }

    return {
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imagePositionPatient: [0, 0, i * 2],
      rowPixelSpacing: 1,
      columnPixelSpacing: 1,
      rows: dimensions[1],
      columns: dimensions[0],
      frameOfReferenceUID: 'first-slice-frame',
    };
  };

  metaData.addProvider(provider, 10000);
  providers.push(provider);
  displaySetRegistry.add(name, { imageIds, volumeId: volume.volumeId });
  volumes.push(volume);

  return {
    volume,
    deliverAll() {
      imageIds.forEach((imageId, k) => {
        putFrame(imageId, k, ArrayType);
        voxelManager.invalidateSlice(k);
        delivered.add(k);
      });
      triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, {
        volumeId: volume.volumeId,
      });
    },
  };
}

/**
 * A planar pane of the real context pool engine, with the calls of the
 * WebGL2 stand-in of the context that draws it and the `IMAGE_RENDERED`
 * events of its element.
 */
function createPane(name, orientation) {
  const element = document.createElement('div');

  ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight'].forEach(
    (key) => Object.defineProperty(element, key, { value: SIZE })
  );
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: SIZE,
    bottom: SIZE,
    width: SIZE,
    height: SIZE,
  });
  document.body.appendChild(element);

  const engine = new ContextPoolRenderingEngine(`${name}-engine`);

  engines.push(engine);
  engine.setViewports([
    {
      viewportId: `${name}-viewport`,
      type: ViewportType.PLANAR,
      element,
      defaultOptions: { orientation },
    },
  ]);

  const viewport = engine.getViewport(`${name}-viewport`);
  const rendered = [];

  element.addEventListener(Events.IMAGE_RENDERED, () => rendered.push(true));
  jest
    .spyOn(viewport.dataProvider, 'load')
    .mockImplementation(async (displaySetId, options) => {
      const volume = volumes.find(
        (candidate) => candidate.volumeId === `${displaySetId}-volume`
      );

      return {
        id: displaySetId,
        type: 'image',
        imageIds: volume.imageIds,
        imageVolume: volume,
        renderMode: options.renderMode,
        volumeId: volume.volumeId,
      };
    });

  const glCanvas = engine.contextPool
    .getContextByIndex(0)
    .context.getOpenGLRenderWindow()
    .getCanvas();

  return {
    engine,
    viewport,
    rendered,
    calls: () => glCalls.get(glCanvas) ?? {},
    resetCalls: () => {
      const calls = glCalls.get(glCanvas);

      Object.keys(calls ?? {}).forEach((key) => delete calls[key]);
    },
  };
}

/** The number of calls of a WebGL method. */
const count = (calls, name) => calls[name]?.length ?? 0;

/** The layer of a display set of a pane. */
const getRendering = (viewport, displaySetId) =>
  viewport.bindings.get(displaySetId).rendering;

/**
 * Mounts display sets on a pane of the sampled slice path, waits for the
 * first picture of the pane and for the tasks after it.
 */
async function mount(pane, entries, orientation) {
  await pane.viewport.setDisplaySets(
    ...entries.map(({ displaySetId, options = {} }) => ({
      displaySetId,
      options: { orientation, mode: 'volume', sliceFirst: true, ...options },
    }))
  );
  await frames(2);
  await idleTasks();
}

/** Expects that the calls built no program, texture or framebuffer. */
function expectNothingBuilt(calls) {
  expect(count(calls, 'compileShader')).toBe(0);
  expect(count(calls, 'linkProgram')).toBe(0);
  expect(count(calls, 'createTexture')).toBe(0);
  expect(count(calls, 'texStorage2D')).toBe(0);
  expect(count(calls, 'createFramebuffer')).toBe(0);
}

const TRANSLUCENT_OVERLAY = {
  role: 'overlay',
  appearance: {
    colormap: {
      name: 'hsv',
      opacityMapping: [
        { value: 0, opacity: 0 },
        { value: 1, opacity: 1 },
      ],
    },
    opacity: 0.5,
    voiRange: { lower: 0, upper: 60 },
  },
};

describe('The first slice of a layer on the sampled slice path of the GPU backend', () => {
  it.each([
    ['Int16Array', 'axial', Int16Array, OrientationAxis.AXIAL],
    ['Int16Array', 'sagittal', Int16Array, OrientationAxis.SAGITTAL],
    ['Uint16Array', 'axial', Uint16Array, OrientationAxis.AXIAL],
    ['Uint8Array', 'coronal', Uint8Array, OrientationAxis.CORONAL],
    ['Float32Array', 'axial', Float32Array, OrientationAxis.AXIAL],
    ['Float32Array', 'sagittal', Float32Array, OrientationAxis.SAGITTAL],
  ])(
    'of a %s volume, %s, compiles no shader, links no program, makes no texture, and uploads its slice once',
    async (_, plane, ArrayType, orientation) => {
      const name = `${ArrayType.name}-${plane}`;
      const streaming = createStreamingVolume(name, ArrayType);
      const pane = createPane(name, orientation);

      await mount(pane, [{ displaySetId: name }], orientation);

      const rendering = getRendering(pane.viewport, name);

      expect(rendering.actor.getVisibility()).toBe(false);

      pane.resetCalls();
      pane.rendered.length = 0;
      streaming.deliverAll();
      await frames(2);

      const calls = pane.calls();
      const uploads = calls.texImage2D ?? [];

      expect(pane.rendered.length).toBeGreaterThan(0);
      expect(rendering.actor.getVisibility()).toBe(true);
      expectNothingBuilt(calls);
      expect(uploads).toHaveLength(1);
      expect(uploads[0][3] * uploads[0][4]).toBeGreaterThan(1);
    }
  );

  it.each([
    ['in one frame', false],
    ['the overlay in a later frame', true],
  ])(
    'of an opaque source and of a translucent overlay, %s, compiles no shader, links no program and makes no texture or framebuffer',
    async (_, overlayLater) => {
      const source = createStreamingVolume(
        `source-${overlayLater}`,
        Int16Array
      );
      const overlay = createStreamingVolume(
        `overlay-${overlayLater}`,
        Float32Array
      );
      const pane = createPane(`fusion-${overlayLater}`, OrientationAxis.AXIAL);

      await mount(
        pane,
        [
          { displaySetId: `source-${overlayLater}` },
          {
            displaySetId: `overlay-${overlayLater}`,
            options: TRANSLUCENT_OVERLAY,
          },
        ],
        OrientationAxis.AXIAL
      );

      pane.resetCalls();
      source.deliverAll();

      if (overlayLater) {
        await frames(2);
        expectNothingBuilt(pane.calls());
      }

      overlay.deliverAll();
      await frames(2);

      const overlayRendering = getRendering(
        pane.viewport,
        `overlay-${overlayLater}`
      );

      expect(overlayRendering.actor.getVisibility()).toBe(true);
      expect(overlayRendering.actor.getProperty().getOpacity()).toBeLessThan(1);
      expectNothingBuilt(pane.calls());
    }
  );

  it('draws in the animation frame of the update that sampled it', async () => {
    const streaming = createStreamingVolume('same-frame', Float32Array);
    const pane = createPane('same-frame', OrientationAxis.AXIAL);

    await mount(pane, [{ displaySetId: 'same-frame' }], OrientationAxis.AXIAL);
    pane.rendered.length = 0;
    streaming.deliverAll();
    await frames(1);

    expect(
      getRendering(pane.viewport, 'same-frame').actor.getVisibility()
    ).toBe(true);
    expect(pane.rendered).toHaveLength(1);
  });

  it('of a layer that drew a slice before builds no shader text for its next slice', async () => {
    const streaming = createStreamingVolume('next-slice', Float32Array);
    const pane = createPane('next-slice', OrientationAxis.AXIAL);

    await mount(pane, [{ displaySetId: 'next-slice' }], OrientationAxis.AXIAL);
    streaming.deliverAll();
    await frames(2);

    pane.resetCalls();
    mockShaderHashes.count = 0;
    await pane.viewport.setImageIdIndex(
      pane.viewport.getCurrentImageIdIndex() + 1
    );
    await frames(2);

    expect(count(pane.calls(), 'texImage2D')).toBe(1);
    expect(mockShaderHashes.count).toBe(0);
  });
});

describe('A pane mounted on a volume with no frame', () => {
  it('draws nothing and uploads no slice, also when its layer is built: one texel and the colour and opacity tables, drawn as a quad of no area, and no event', async () => {
    createStreamingVolume('no-frame', Float32Array);

    const pane = createPane('no-frame', OrientationAxis.AXIAL);

    await mount(pane, [{ displaySetId: 'no-frame' }], OrientationAxis.AXIAL);

    const calls = pane.calls();
    const rendering = getRendering(pane.viewport, 'no-frame');
    const statistics = rendering.getSliceCacheStatistics();
    const quadMatrices = (calls.uniformMatrix4fv ?? []).filter(
      ([location]) => location?.name === 'MCPCMatrix'
    );

    expect(rendering.actor.getVisibility()).toBe(false);
    expect(pane.rendered).toHaveLength(1);
    expect(statistics.allocatedBytes).toBe(0);
    expect(statistics.copiedBytes).toBe(0);
    expect(count(calls, 'texSubImage2D')).toBe(0);
    expect(
      (calls.texImage2D ?? []).filter(([, , , width, height]) => height > 1)
    ).toHaveLength(0);
    expect(
      (calls.texImage2D ?? []).filter(
        ([, , , width, height]) => width === 1 && height === 1
      )
    ).toHaveLength(1);
    expect(quadMatrices.length).toBeGreaterThan(0);
    quadMatrices.forEach(([, , matrix]) => {
      expect(Array.from(matrix.slice(0, 8)).every((value) => value === 0)).toBe(
        true
      );
    });
  });
});
