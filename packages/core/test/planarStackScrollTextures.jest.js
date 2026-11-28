import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { MetadataModules, OrientationAxis, ViewportType } from '../src/enums';
import * as metaData from '../src/metaData';
import cache from '../src/cache/cache';
import VoxelManager from '../src/utilities/VoxelManager';
import {
  registerImageLoader,
  unregisterAllImageLoaders,
} from '../src/loaders/imageLoader';
import { init, resetInitialization } from '../src/init';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import { PlanarRenderModeId } from '../src/RenderingEngine/Viewports/Planar/planarRenderModeIds';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import { create2DStandIn, createWebGL2StandIn } from './utils/webglStandIn';

/**
 * Row 373 (lane FIX365-373): vtk.js keeps one opacity texture per opacity
 * function of an image property and makes a new one at every build of the
 * buffers of an image mapper whose property has none; the old one is dropped
 * without `deleteTexture`. The stack image path gave a plain grey image no
 * opacity function, so every new image of a stack scroll made a texture and
 * uploaded a table of 1,024 values of one channel. A layer of the stack path
 * with no opacity ramp now has an opacity function of 1 of its own, which
 * vtk.js keeps one texture for.
 *
 * The real context pool engine draws the pane with the vtk.js OpenGL classes
 * on a WebGL2 stand-in (`utils/webglStandIn`), which records the calls of the
 * context of the engine.
 */

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

const COLUMNS = 8;
const ROWS = 6;
const NUMBER_OF_IMAGES = 6;
const SIZE = 64;
const LOADER = 'stackTextures';
const glCalls = new WeakMap();
const engines = [];
const providers = [];
const cachedImageIds = [];

/** The numbers of the constants of the stand-in, the same in every context. */
const gl = createWebGL2StandIn(document.createElement('canvas'));

/** Waits for the given number of animation frames. */
async function frames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
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
  unregisterAllImageLoaders();
  displaySetRegistry.clear();
  document.body.innerHTML = '';
  jest.restoreAllMocks();
  resetInitialization();
});

/** An image of the stack, of the array type `ArrayType`, other values per index. */
function createImage(imageId, index, ArrayType, { color = false } = {}) {
  const numberOfComponents = color ? 3 : 1;
  const scalarData = new ArrayType(COLUMNS * ROWS * numberOfComponents).map(
    (_, i) => 10 + ((i * 7 + index * 31) % 50)
  );

  return {
    imageId,
    rows: ROWS,
    columns: COLUMNS,
    width: COLUMNS,
    height: ROWS,
    rowPixelSpacing: 1,
    columnPixelSpacing: 1,
    slope: 1,
    intercept: 0,
    windowCenter: 35,
    windowWidth: 50,
    minPixelValue: 10,
    maxPixelValue: 59,
    color,
    rgba: false,
    numberOfComponents,
    invert: false,
    dataType: ArrayType.name,
    sizeInBytes: scalarData.byteLength,
    getPixelData: () => scalarData,
    voxelManager: VoxelManager.createImageVoxelManager({
      width: COLUMNS,
      height: ROWS,
      scalarData,
      numberOfComponents,
    }),
  };
}

/**
 * A stack of images of an image loader of the test, with a metadata
 * provider of their image planes, registered as a display set.
 */
function createStack(name, ArrayType, options) {
  const imageIds = Array.from(
    { length: NUMBER_OF_IMAGES },
    (_, index) => `${LOADER}:${name}:${index}`
  );
  const images = new Map(
    imageIds.map((imageId, index) => [
      imageId,
      createImage(imageId, index, ArrayType, options),
    ])
  );
  const provider = (type, imageId) => {
    const index = imageIds.indexOf(imageId);

    if (index < 0) {
      return;
    }

    if (type === MetadataModules.IMAGE_PLANE) {
      return {
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        rowCosines: [1, 0, 0],
        columnCosines: [0, 1, 0],
        imagePositionPatient: [0, 0, index * 2],
        rowPixelSpacing: 1,
        columnPixelSpacing: 1,
        rows: ROWS,
        columns: COLUMNS,
        frameOfReferenceUID: 'stack-textures-frame',
      };
    }

    if (type === MetadataModules.IMAGE_PIXEL) {
      const bits = ArrayType.BYTES_PER_ELEMENT * 8;

      return {
        pixelRepresentation: ArrayType === Int16Array ? 1 : 0,
        bitsAllocated: bits,
        bitsStored: bits,
        highBit: bits - 1,
        photometricInterpretation: options?.color ? 'RGB' : 'MONOCHROME2',
        samplesPerPixel: options?.color ? 3 : 1,
      };
    }

    if (type === MetadataModules.GENERAL_SERIES) {
      return { modality: 'CT' };
    }
  };

  metaData.addProvider(provider, 10000);
  providers.push(provider);
  registerImageLoader(LOADER, (imageId) => ({
    promise: Promise.resolve(images.get(imageId)),
  }));
  cachedImageIds.push(...imageIds);
  displaySetRegistry.add(name, { imageIds });

  return imageIds;
}

/**
 * A planar pane of the real context pool engine, with the calls of the
 * WebGL2 stand-in of the context that draws it.
 */
function createPane(name) {
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
      defaultOptions: { orientation: OrientationAxis.ACQUISITION },
    },
  ]);

  const glCanvas = engine.contextPool
    .getContextByIndex(0)
    .context.getOpenGLRenderWindow()
    .getCanvas();

  return {
    viewport: engine.getViewport(`${name}-viewport`),
    calls: () => glCalls.get(glCanvas) ?? {},
  };
}

/** The number of calls of a WebGL method. */
const count = (calls, name) => calls[name]?.length ?? 0;

/**
 * Whether the arguments of a `texImage2D` upload a table of one row of one
 * channel: the opacity table that vtk.js makes for an image property
 * (`RED` on WebGL2, `LUMINANCE` where vtk.js takes the WebGL1 formats).
 */
const isOpacityTable = ([, , , width, height, , format]) =>
  height === 1 && width > 1 && (format === gl.RED || format === gl.LUMINANCE);

/** Whether the values of an uploaded opacity table are all an opacity of 1. */
const isFullOpacityTable = (args) => {
  const [, , , , , , , type, data] = args;
  const full = type === gl.UNSIGNED_BYTE ? 255 : 1;

  return Array.from(data).every((value) => value === full);
};

/**
 * Mounts a stack on a pane of the GPU backend, draws its first image, then
 * shows each other image once (after `beforeScroll`), and gives the WebGL
 * calls of the scroll: the textures made and deleted, the opacity tables
 * uploaded, the uploads of the images, and the last opacity table uploaded
 * before the scroll.
 */
async function scrollThroughStack(name, ArrayType, options = {}) {
  createStack(name, ArrayType, options.image);

  const pane = createPane(name);

  await pane.viewport.setDisplaySets({
    displaySetId: name,
    options: {
      orientation: OrientationAxis.ACQUISITION,
      mode: 'stack',
      ...options.displaySet,
    },
  });
  await frames(2);
  await options.beforeScroll?.(pane.viewport);
  await frames(2);

  const mounted = pane.calls();
  const before = {
    created: count(mounted, 'createTexture'),
    deleted: count(mounted, 'deleteTexture'),
    uploads: count(mounted, 'texImage2D'),
  };
  const mountedOpacityTables = (mounted.texImage2D ?? []).filter(
    isOpacityTable
  );

  for (let index = 1; index < NUMBER_OF_IMAGES; index++) {
    await pane.viewport.setImageIdIndex(index);
    await frames(2);
  }

  const calls = pane.calls();
  const scrollUploads = (calls.texImage2D ?? []).slice(before.uploads);

  return {
    rendering: pane.viewport.bindings.get(name).rendering,
    currentImageIdIndex: pane.viewport.getCurrentImageIdIndex(),
    createdTextures: count(calls, 'createTexture') - before.created,
    deletedTextures: count(calls, 'deleteTexture') - before.deleted,
    opacityTables: scrollUploads.filter(isOpacityTable).length,
    imageUploads: scrollUploads.filter(([, , , , height]) => height > 1).length,
    lastMountedOpacityTable:
      mountedOpacityTables[mountedOpacityTables.length - 1],
  };
}

const NEW_IMAGES = NUMBER_OF_IMAGES - 1;

/** The texture counts of a scroll, to compare in one expect. */
const texturesOf = ({
  imageUploads,
  opacityTables,
  createdTextures,
  deletedTextures,
}) => ({ imageUploads, opacityTables, createdTextures, deletedTextures });

/** An appearance with the opacity ramp of a colormap. */
const RAMP_APPEARANCE = {
  colormap: {
    name: 'hsv',
    opacityMapping: [
      { value: 10, opacity: 0 },
      { value: 59, opacity: 1 },
    ],
  },
  voiRange: { lower: 10, upper: 59 },
};

describe('A scroll through a stack on the GPU backend', () => {
  it.each([
    ['grey Int16Array', Int16Array, false],
    ['grey Uint16Array', Uint16Array, false],
    ['grey Uint8Array', Uint8Array, false],
    ['grey Float32Array', Float32Array, false],
    ['RGB Uint8Array', Uint8Array, true],
  ])(
    'of plain %s images makes one texture per new image, the colour table of its window, deletes the one before, and makes and uploads no opacity table',
    async (name, ArrayType, color) => {
      const scroll = await scrollThroughStack(
        name.replace(' ', '-'),
        ArrayType,
        { image: { color } }
      );
      const opacity = scroll.rendering.actor.getProperty().getScalarOpacity(0);

      expect(scroll.rendering.renderMode).toBe(PlanarRenderModeId.VTK_FRAME);
      expect(scroll.currentImageIdIndex).toBe(NUMBER_OF_IMAGES - 1);
      expect(texturesOf(scroll)).toEqual({
        imageUploads: NEW_IMAGES,
        opacityTables: 0,
        createdTextures: NEW_IMAGES,
        deletedTextures: NEW_IMAGES,
      });
      expect(isFullOpacityTable(scroll.lastMountedOpacityTable)).toBe(true);
      expect(Array.from(opacity.getDataPointer())).toEqual([0, 1, 1, 1]);
    }
  );

  it('with the opacity ramp of a colormap keeps the ramp as the opacity function of the layer, a new one for each new image as before', async () => {
    const scroll = await scrollThroughStack('ramp', Int16Array, {
      displaySet: { appearance: RAMP_APPEARANCE },
    });
    const opacity = scroll.rendering.actor.getProperty().getScalarOpacity(0);

    expect(Array.from(opacity.getDataPointer())).toEqual([10, 0, 59, 1]);
    expect(texturesOf(scroll)).toEqual({
      imageUploads: NEW_IMAGES,
      opacityTables: NEW_IMAGES,
      createdTextures: 2 * NEW_IMAGES,
      deletedTextures: 2 * NEW_IMAGES,
    });
  });

  it('after the opacity ramp of a colormap is taken away makes and uploads no opacity table per new image', async () => {
    const scroll = await scrollThroughStack('rampRemoved', Int16Array, {
      displaySet: { appearance: RAMP_APPEARANCE },
      beforeScroll: (viewport) =>
        viewport.setDisplaySetAppearance('rampRemoved', {
          colormap: { name: 'hsv', opacityMapping: [] },
        }),
    });
    const opacity = scroll.rendering.actor.getProperty().getScalarOpacity(0);

    expect(texturesOf(scroll)).toEqual({
      imageUploads: NEW_IMAGES,
      opacityTables: 0,
      createdTextures: NEW_IMAGES,
      deletedTextures: NEW_IMAGES,
    });
    expect(Array.from(opacity?.getDataPointer() ?? [])).toEqual([0, 1, 1, 1]);
    expect(isFullOpacityTable(scroll.lastMountedOpacityTable)).toBe(true);
  });
});
