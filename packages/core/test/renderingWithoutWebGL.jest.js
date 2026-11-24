import { describe, it, expect, jest, afterEach } from '@jest/globals';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import {
  getEffectiveRenderBackend,
  init,
  resetInitialization,
  setRenderBackend,
} from '../src/init';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import { PlanarRenderPathDecisionService } from '../src/RenderingEngine/Viewports/Planar/PlanarRenderPathDecisionService';
import { ActorRenderMode } from '../src/types';
import { RenderBackends } from '../src/enums';
import cache from '../src/cache/cache';
import * as imageLoader from '../src/loaders/imageLoader';
import * as metaData from '../src/metaData';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';

let mockWebGL = false;

jest.mock('../src/utilities/renderingCapabilities', () => {
  const actual = jest.requireActual('../src/utilities/renderingCapabilities');

  return {
    ...actual,
    getRenderingCapabilities: () => ({
      webgl: mockWebGL,
      maxTextureSize: mockWebGL ? 16384 : 0,
      max3DTextureSize: mockWebGL ? 2048 : 0,
      renderer: mockWebGL ? 'test GPU' : '',
      softwareRasterizer: false,
      webglCanvasCopy: mockWebGL,
      norm16: false,
      norm16Linear: false,
      float: mockWebGL,
      floatLinear: mockWebGL,
      halfFloat: false,
      halfFloatLinear: false,
    }),
  };
});

jest.mock('../src/RenderingEngine/vtkClasses', () => {
  const actual = jest.requireActual('../src/RenderingEngine/vtkClasses');

  return {
    ...actual,
    vtkOffscreenMultiRenderWindow: {
      newInstance: () => {
        const canvas = globalThis.document.createElement('canvas');
        const openGLRenderWindow = {
          getCanvas: () => canvas,
          getContext: () => null,
          getInitialized: () => false,
          isDeleted: () => false,
        };

        return {
          getOpenGLRenderWindow: () => openGLRenderWindow,
          setContainer: () => undefined,
          delete: () => undefined,
        };
      },
    },
  };
});

const IMAGE_DATASET = { imageIds: ['plain-img-1'] };
const VOLUME_DATASET = {
  imageIds: ['vol-img-1', 'vol-img-2'],
  volumeId: 'vol-1',
};

/** Runs init() again as on a page of a device with or without WebGL. */
function initOnDevice({ webgl }) {
  mockWebGL = webgl;
  resetInitialization();
  init();
}

/** A stack of two 16 by 16 images of the fake image loader. */
function createImageIds() {
  return [0, 1].map(
    (sliceIndex) =>
      `fakeImageLoader:${encodeURIComponent(
        JSON.stringify({
          loader: 'fakeImageLoader',
          name: 'imageURI',
          rows: 16,
          columns: 16,
          barStart: 2,
          barWidth: 4,
          xSpacing: 1,
          ySpacing: 1,
          sliceIndex,
        })
      )}`
  );
}

/** Gives an element of 64 by 64 pixels in the document. */
function createElement() {
  const element = document.createElement('div');

  ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight'].forEach(
    (key) => Object.defineProperty(element, key, { value: 64 })
  );
  document.body.appendChild(element);

  return element;
}

describe('Rendering on a device without WebGL', () => {
  let engines = [];

  afterEach(() => {
    engines.forEach((engine) => engine.destroy());
    engines = [];
    cache.purgeCache();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    genericViewportDisplaySetMetadataProvider.clear();
    document.body.innerHTML = '';
    setRenderBackend(RenderBackends.Auto);
    mockWebGL = false;
    resetInitialization();
  });

  it('makes no WebGL context pool in the context pool rendering engine', () => {
    initOnDevice({ webgl: false });

    const engine = new ContextPoolRenderingEngine('withoutWebGL:contextPool');

    engines.push(engine);

    expect(engine.contextPool).toBeUndefined();
  });

  it('makes no offscreen WebGL window in the tiled rendering engine', () => {
    initOnDevice({ webgl: false });

    const engine = new TiledRenderingEngine('withoutWebGL:tiled');

    engines.push(engine);

    expect(engine.offscreenMultiRenderWindow).toBeUndefined();
  });

  it('draws a stack and a volume of every planar viewport on the CPU', () => {
    initOnDevice({ webgl: false });

    const service = new PlanarRenderPathDecisionService();
    const getVolumeSpy = jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((volumeId) =>
        volumeId === 'vol-1' ? { volumeId } : undefined
      );

    try {
      expect(getEffectiveRenderBackend()).toBe(RenderBackends.CPU);
      expect(service.select(IMAGE_DATASET).renderMode).toBe(
        ActorRenderMode.CPU_IMAGE
      );
      expect(service.select(VOLUME_DATASET).renderMode).toBe(
        ActorRenderMode.CPU_VOLUME
      );
    } finally {
      getVolumeSpy.mockRestore();
    }
  });

  it('lets a global gpu pin win over the CPU of a device without WebGL', () => {
    initOnDevice({ webgl: false });
    setRenderBackend('gpu');

    const { renderMode } = new PlanarRenderPathDecisionService().select(
      IMAGE_DATASET
    );

    expect(renderMode).toBe(ActorRenderMode.VTK_IMAGE);
  });

  it('shows a stack on a planar viewport with the CPU in its render plan', async () => {
    initOnDevice({ webgl: false });
    window.devicePixelRatio = 1;
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);

    const { renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      createElement(),
      'withoutWebGL:planar'
    );

    engines.push(renderingEngine);
    genericViewportDisplaySetMetadataProvider.add('withoutWebGL:stack', {
      kind: 'planar',
      imageIds: createImageIds(),
      initialImageIdIndex: 0,
    });
    await viewport.setDisplaySets({ displaySetId: 'withoutWebGL:stack' });

    expect(
      viewport
        .getRenderPlan()
        .map(({ dataId, draw, renderMode }) => ({ dataId, draw, renderMode }))
    ).toEqual([
      {
        dataId: 'withoutWebGL:stack',
        draw: 'cpu',
        renderMode: ActorRenderMode.CPU_IMAGE,
      },
    ]);
  });

  it('makes the WebGL context pool and draws on the GPU on a device with WebGL', () => {
    initOnDevice({ webgl: true });

    const contextPoolEngine = new ContextPoolRenderingEngine(
      'withWebGL:contextPool'
    );
    const tiledEngine = new TiledRenderingEngine('withWebGL:tiled');

    engines.push(contextPoolEngine, tiledEngine);

    expect(contextPoolEngine.contextPool).toBeDefined();
    expect(tiledEngine.offscreenMultiRenderWindow).toBeDefined();
    expect(getEffectiveRenderBackend()).toBe(RenderBackends.GPU);
  });
});
