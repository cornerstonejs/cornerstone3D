jest.mock('../src/RenderingEngine/helpers/cpuFallback/drawImageSync', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { Events, InterpolationType } from '../src/enums';
import { ActorRenderMode } from '../src/types';
import drawImageSync from '../src/RenderingEngine/helpers/cpuFallback/drawImageSync';
import { CpuVolumeSliceRenderPath } from '../src/RenderingEngine/ViewportNext/Planar/CpuVolumeSliceRenderPath';
import PlanarCPUVolumeSampler from '../src/RenderingEngine/ViewportNext/Planar/PlanarCPUVolumeSampler';

function createCanvas(width = 256, height = 256) {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

function createSampledImage() {
  return {
    imageId: 'sampled-image',
    width: 64,
    height: 64,
    rows: 64,
    columns: 64,
    columnPixelSpacing: 1,
    rowPixelSpacing: 1,
    minPixelValue: 0,
    maxPixelValue: 255,
  };
}

function createSampledSliceState(image = createSampledImage()) {
  return {
    image,
    samplingMode: 'source-slice',
    focalPoint: [0, 0, 0],
    translationReferenceFocalPoint: [0, 0, 0],
    right: [1, 0, 0],
    up: [0, 1, 0],
    normal: [0, 0, 1],
    spacingInNormalDirection: 1,
    canvasWidth: 256,
    canvasHeight: 256,
    parallelScale: 32,
    scaleRatio: 1,
    interpolationType: InterpolationType.LINEAR,
  };
}

function createContext(canvas = createCanvas()) {
  return {
    viewportId: 'viewport-1',
    renderingEngineId: 'rendering-engine',
    viewport: {
      element: document.createElement('div'),
    },
    view: {
      activeSourceICamera: {
        focalPoint: [0, 0, 0],
        parallelScale: 32,
        viewPlaneNormal: [0, 0, 1],
        viewUp: [0, 1, 0],
      },
    },
    display: {
      activateRenderMode: jest.fn(),
    },
    cpu: {
      canvas,
      context: canvas.getContext('2d'),
      composition: {
        clearedRenderPassId: -1,
        renderPassId: 1,
      },
    },
  };
}

function createRendering(sampledSliceState = createSampledSliceState()) {
  return {
    renderMode: ActorRenderMode.CPU_VOLUME,
    actorEntryUID: 'actor-1',
    compatibilityActor: {
      getMapper: () => ({
        getInputData: () => ({
          setDerivedImage: jest.fn(),
        }),
      }),
    },
    enabledElement: {
      canvas: createCanvas(),
      image: sampledSliceState.image,
      options: {},
      renderingTools: {},
      viewport: {},
    },
    imageVolume: {
      loadStatus: {
        loaded: true,
      },
      metadata: {},
    },
    imageIds: ['image-1'],
    layerCanvas: createCanvas(),
    currentImageIdIndex: 0,
    maxImageIdIndex: 0,
    renderingInvalidated: true,
    sampledSliceState,
  };
}

describe('CpuVolumeSliceRenderPath', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redraws an invalidated CPU volume slice without resampling when the cached plane is still valid', () => {
    const sampledSliceState = createSampledSliceState();
    const rendering = createRendering(sampledSliceState);
    const path = new CpuVolumeSliceRenderPath();
    const sampler = {
      needsResample: jest.fn(() => false),
      sampleSliceImage: jest.fn(() => {
        throw new Error('sampleSliceImage should not be called');
      }),
      createOrUpdateEnabledElement: jest.fn(() => rendering.enabledElement),
      updateCPUFallbackViewport: jest.fn(),
      getResolvedVOIRange: jest.fn(() => ({ lower: 0, upper: 255 })),
    };

    path.sampler = sampler;

    path.render(createContext(), rendering);

    expect(sampler.needsResample).toHaveBeenCalledTimes(1);
    expect(sampler.sampleSliceImage).not.toHaveBeenCalled();
    expect(drawImageSync).toHaveBeenCalledWith(rendering.enabledElement, true);
    expect(rendering.renderingInvalidated).toBe(false);
  });

  it('still emits IMAGE_RENDERED when redrawing from the cached sampled slice', () => {
    const element = document.createElement('div');
    const ctx = createContext();
    const rendering = createRendering();
    const path = new CpuVolumeSliceRenderPath();

    ctx.viewport.element = element;
    path.sampler = {
      needsResample: jest.fn(() => false),
      sampleSliceImage: jest.fn(),
      createOrUpdateEnabledElement: jest.fn(() => rendering.enabledElement),
      updateCPUFallbackViewport: jest.fn(),
      getResolvedVOIRange: jest.fn(() => ({ lower: 0, upper: 255 })),
    };

    const listener = jest.fn();

    element.addEventListener(Events.IMAGE_RENDERED, listener);

    path.render(ctx, rendering);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('PlanarCPUVolumeSampler resampling decisions', () => {
  it('reuses orthogonal source-slice samples across zoom changes', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const sampledSliceState = createSampledSliceState();

    expect(
      sampler.needsResample({
        sampledSliceState,
        width: 256,
        height: 256,
        camera: {
          focalPoint: [0, 0, 0],
          parallelScale: 16,
          viewPlaneNormal: [0, 0, 1],
          viewUp: [0, 1, 0],
        },
        dataPresentation: {
          interpolationType: InterpolationType.LINEAR,
        },
      })
    ).toBe(false);
  });

  it('resamples viewport-cropped samples across zoom changes', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const sampledSliceState = {
      ...createSampledSliceState(),
      samplingMode: 'viewport',
    };

    expect(
      sampler.needsResample({
        sampledSliceState,
        width: 256,
        height: 256,
        camera: {
          focalPoint: [0, 0, 0],
          parallelScale: 16,
          viewPlaneNormal: [0, 0, 1],
          viewUp: [0, 1, 0],
        },
        dataPresentation: {
          interpolationType: InterpolationType.LINEAR,
        },
      })
    ).toBe(true);
  });
});
