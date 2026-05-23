jest.mock('../src/RenderingEngine/helpers/cpuFallback/drawImageSync', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { Events, InterpolationType } from '../src/enums';
import { ActorRenderMode } from '../src/types';
import drawImageSync from '../src/RenderingEngine/helpers/cpuFallback/drawImageSync';
import { CpuVolumeSliceRenderPath } from '../src/RenderingEngine/GenericViewport/Planar/CpuVolumeSliceRenderPath';
import PlanarCPUVolumeSampler from '../src/RenderingEngine/GenericViewport/Planar/PlanarCPUVolumeSampler';
import eventTarget from '../src/eventTarget';

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
      getViewState: jest.fn(() => ({})),
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
      renderNow: jest.fn(),
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

function createTestVolume() {
  const dimensions = [4, 4, 4];

  return {
    volumeId: 'test-volume',
    dimensions,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    metadata: {},
    voxelManager: {
      numberOfComponents: 1,
      getRange: () => [0, 333],
      getAtIJK: (i, j, k) => i + j * 10 + k * 100,
    },
  };
}

function createScalarDataTestVolume() {
  const dimensions = [4, 4, 4];
  const scalarData = new Int16Array(
    dimensions[0] * dimensions[1] * dimensions[2]
  );

  for (let k = 0; k < dimensions[2]; k++) {
    for (let j = 0; j < dimensions[1]; j++) {
      for (let i = 0; i < dimensions[0]; i++) {
        scalarData[i + j * dimensions[0] + k * dimensions[0] * dimensions[1]] =
          i + j * 10 + k * 100;
      }
    }
  }

  const getAtIJK = jest.fn(() => {
    throw new Error('axis-aligned scalar viewport sampling should be direct');
  });
  const getCompleteScalarDataArray = jest.fn(() => scalarData);

  return {
    volume: {
      volumeId: 'test-scalar-data-volume',
      dimensions,
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      metadata: {},
      voxelManager: {
        numberOfComponents: 1,
        getRange: () => [0, 333],
        getAtIJK,
        getCompleteScalarDataArray,
      },
    },
    getAtIJK,
    getCompleteScalarDataArray,
  };
}

function createCoronalCamera(focalPoint) {
  return {
    focalPoint,
    parallelScale: 0.5,
    viewPlaneNormal: [0, 1, 0],
    viewUp: [0, 0, 1],
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
      getResampleDecision: jest.fn(() => 'reuse'),
      sampleSliceImage: jest.fn(() => {
        throw new Error('sampleSliceImage should not be called');
      }),
      createOrUpdateEnabledElement: jest.fn(() => rendering.enabledElement),
      updateCPUFallbackViewport: jest.fn(),
      getResolvedVOIRange: jest.fn(() => ({ lower: 0, upper: 255 })),
    };

    path.sampler = sampler;

    path.render(createContext(), rendering);

    expect(sampler.getResampleDecision).toHaveBeenCalledTimes(1);
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
      getResampleDecision: jest.fn(() => 'reuse'),
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

  it('redraws cached viewport samples immediately and schedules a deferred high-quality resample', () => {
    jest.useFakeTimers();

    const sampledSliceState = {
      ...createSampledSliceState(),
      samplingMode: 'viewport',
    };
    const rendering = createRendering(sampledSliceState);
    const path = new CpuVolumeSliceRenderPath();
    const ctx = createContext();
    const sampler = {
      getResampleDecision: jest.fn(() => 'defer'),
      sampleSliceImage: jest.fn(() => {
        throw new Error('sampleSliceImage should be deferred');
      }),
      createOrUpdateEnabledElement: jest.fn(() => rendering.enabledElement),
      updateCPUFallbackViewport: jest.fn(),
      getResolvedVOIRange: jest.fn(() => ({ lower: 0, upper: 255 })),
    };

    path.sampler = sampler;

    path.render(ctx, rendering);

    expect(sampler.sampleSliceImage).not.toHaveBeenCalled();
    expect(drawImageSync).toHaveBeenCalledWith(rendering.enabledElement, true);
    expect(ctx.display.renderNow).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();

    expect(rendering.forceHighQualityResample).toBe(true);
    expect(rendering.renderingInvalidated).toBe(true);
    expect(ctx.display.renderNow).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('clears cached CPU volume scalar data again on the deferred loading-completed render', async () => {
    let animationFrameCallback;
    const requestAnimationFrame = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        animationFrameCallback = callback;
        return 1;
      });
    const cancelAnimationFrame = jest
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(jest.fn());
    const ctx = createContext();
    const path = new CpuVolumeSliceRenderPath();
    const voxelManager = {
      invalidateCache: jest.fn(),
    };
    const clearCachedScalarRange = jest.fn();

    path.sampler = {
      clearCachedScalarRange,
    };

    const attachment = await path.addData(
      ctx,
      {
        id: 'volume-data-id',
        volumeId: 'volume-1',
        imageIds: [],
        imageVolume: {
          volumeId: 'volume-1',
          imageIds: [],
          metadata: {
            voiLut: [{ windowWidth: 255, windowCenter: 128 }],
          },
          voxelManager,
        },
        initialImageIdIndex: 0,
      },
      {}
    );

    eventTarget.dispatchEvent(
      new CustomEvent(Events.IMAGE_VOLUME_LOADING_COMPLETED, {
        detail: {
          volumeId: 'volume-1',
        },
      })
    );

    expect(voxelManager.invalidateCache).toHaveBeenCalledTimes(1);
    expect(clearCachedScalarRange).toHaveBeenCalledTimes(1);
    expect(clearCachedScalarRange).toHaveBeenLastCalledWith(voxelManager);
    expect(ctx.display.renderNow).toHaveBeenCalledTimes(1);

    animationFrameCallback();

    expect(voxelManager.invalidateCache).toHaveBeenCalledTimes(2);
    expect(clearCachedScalarRange).toHaveBeenCalledTimes(2);
    expect(clearCachedScalarRange).toHaveBeenLastCalledWith(voxelManager);
    expect(ctx.display.renderNow).toHaveBeenCalledTimes(2);

    attachment.removeData();
    requestAnimationFrame.mockRestore();
    cancelAnimationFrame.mockRestore();
  });
});

describe('PlanarCPUVolumeSampler resampling decisions', () => {
  it('reuses orthogonal source-slice samples across zoom changes', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const sampledSliceState = {
      ...createSampledSliceState(),
      interpolationType: InterpolationType.NEAREST,
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
          interpolationType: InterpolationType.NEAREST,
        },
      })
    ).toBe(false);
  });

  it('resamples viewport samples synchronously by default across zoom changes', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const sampledSliceState = {
      ...createSampledSliceState(),
      samplingMode: 'viewport',
    };

    const args = {
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
    };

    expect(sampler.getResampleDecision(args)).toBe('resample');
    expect(sampler.needsResample(args)).toBe(true);
  });

  it('defers viewport sample refreshes across zoom changes when high-quality linear sampling is enabled', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const sampledSliceState = {
      ...createSampledSliceState(),
      samplingMode: 'viewport',
    };

    expect(
      sampler.getResampleDecision({
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
        deferViewportResample: true,
      })
    ).toBe('defer');
  });

  it('uses viewport sampling for linear orthogonal planes between voxel centers', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const sampledSliceState = sampler.sampleSliceImage({
      volume: createTestVolume(),
      width: 1,
      height: 1,
      camera: createCoronalCamera([1.5, 1.5, 1.5]),
      dataPresentation: {
        interpolationType: InterpolationType.LINEAR,
      },
    });

    expect(sampledSliceState.samplingMode).toBe('viewport');
    expect(sampledSliceState.image.width).toBe(1);
    expect(sampledSliceState.image.height).toBe(1);
    expect(Array.from(sampledSliceState.image.getPixelData())).toEqual([167]);
  });

  it('samples linear viewport planes through the half-voxel spatial boundary', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const sampledSliceState = sampler.sampleSliceImage({
      volume: createTestVolume(),
      width: 1,
      height: 1,
      camera: createCoronalCamera([1.5, -0.25, 1.5]),
      dataPresentation: {
        interpolationType: InterpolationType.LINEAR,
      },
    });

    expect(sampledSliceState.samplingMode).toBe('viewport');
    expect(Array.from(sampledSliceState.image.getPixelData())).toEqual([152]);
  });

  it('keeps linear viewport samples outside the half-voxel boundary empty', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const sampledSliceState = sampler.sampleSliceImage({
      volume: createTestVolume(),
      width: 1,
      height: 1,
      camera: createCoronalCamera([1.5, -0.75, 1.5]),
      dataPresentation: {
        interpolationType: InterpolationType.LINEAR,
      },
    });

    expect(sampledSliceState.samplingMode).toBe('viewport');
    expect(Array.from(sampledSliceState.image.getPixelData())).toEqual([0]);
  });

  it('reuses source slices for linear orthogonal planes on voxel centers when high-quality linear sampling is disabled', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const sampledSliceState = sampler.sampleSliceImage({
      volume: createTestVolume(),
      width: 1,
      height: 1,
      camera: createCoronalCamera([1, 1, 1]),
      dataPresentation: {
        interpolationType: InterpolationType.LINEAR,
      },
      useViewportSamplingForLinear: false,
    });

    expect(sampledSliceState.samplingMode).toBe('source-slice');
    expect(sampledSliceState.image.width).toBe(4);
    expect(sampledSliceState.image.height).toBe(4);
  });

  it('uses viewport sampling for linear voxel-center planes by default', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const sampledSliceState = sampler.sampleSliceImage({
      volume: createTestVolume(),
      width: 1,
      height: 1,
      camera: createCoronalCamera([1, 1, 1]),
      dataPresentation: {
        interpolationType: InterpolationType.LINEAR,
      },
    });

    expect(sampledSliceState.samplingMode).toBe('viewport');
    expect(sampledSliceState.image.width).toBe(1);
    expect(sampledSliceState.image.height).toBe(1);
  });

  it('uses packed scalar data for axis-aligned high-quality viewport samples', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const { volume, getAtIJK, getCompleteScalarDataArray } =
      createScalarDataTestVolume();
    const sampledSliceState = sampler.sampleSliceImage({
      volume,
      width: 1,
      height: 1,
      camera: createCoronalCamera([1.5, 1.5, 1.5]),
      dataPresentation: {
        interpolationType: InterpolationType.LINEAR,
      },
      useViewportSamplingForLinear: true,
    });

    expect(sampledSliceState.samplingMode).toBe('viewport');
    expect(Array.from(sampledSliceState.image.getPixelData())).toEqual([167]);
    expect(getCompleteScalarDataArray).toHaveBeenCalledTimes(1);
    expect(getAtIJK).not.toHaveBeenCalled();
  });

  it('matches generic linear viewport sampling with the fixed-axis scalar path', () => {
    const genericSampler = new PlanarCPUVolumeSampler();
    const fastSampler = new PlanarCPUVolumeSampler();
    const { volume, getAtIJK } = createScalarDataTestVolume();
    const sampleArgs = {
      width: 3,
      height: 3,
      camera: createCoronalCamera([1.5, 1.5, 1.5]),
      dataPresentation: {
        interpolationType: InterpolationType.LINEAR,
      },
      useViewportSamplingForLinear: true,
    };
    const genericSampledSliceState = genericSampler.sampleSliceImage({
      volume: createTestVolume(),
      ...sampleArgs,
    });
    const fastSampledSliceState = fastSampler.sampleSliceImage({
      volume,
      ...sampleArgs,
    });

    expect(Array.from(fastSampledSliceState.image.getPixelData())).toEqual(
      Array.from(genericSampledSliceState.image.getPixelData())
    );
    expect(getAtIJK).not.toHaveBeenCalled();
  });

  it('reuses cached packed scalar data across high-quality viewport samples', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const { volume, getAtIJK, getCompleteScalarDataArray } =
      createScalarDataTestVolume();

    sampler.sampleSliceImage({
      volume,
      width: 1,
      height: 1,
      camera: createCoronalCamera([1.5, 1.5, 1.5]),
      dataPresentation: {
        interpolationType: InterpolationType.LINEAR,
      },
      useViewportSamplingForLinear: true,
    });
    sampler.sampleSliceImage({
      volume,
      width: 1,
      height: 1,
      camera: createCoronalCamera([1.5, -0.25, 1.5]),
      dataPresentation: {
        interpolationType: InterpolationType.LINEAR,
      },
      useViewportSamplingForLinear: true,
    });

    expect(getCompleteScalarDataArray).toHaveBeenCalledTimes(1);
    expect(getAtIJK).not.toHaveBeenCalled();
  });

  it('reuses released slice arrays for matching CPU volume sample shapes', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const volume = createTestVolume();
    const sampleArgs = {
      volume,
      width: 2,
      height: 2,
      camera: createCoronalCamera([1.5, 1.5, 1.5]),
      dataPresentation: {
        interpolationType: InterpolationType.LINEAR,
      },
    };
    const firstSampledSliceState = sampler.sampleSliceImage(sampleArgs);
    const firstScalarData = firstSampledSliceState.image.getPixelData();

    sampler.releaseSampledSliceState(firstSampledSliceState);

    const secondSampledSliceState = sampler.sampleSliceImage(sampleArgs);

    expect(secondSampledSliceState.image.getPixelData()).toBe(firstScalarData);
  });

  it('reuses fixed-axis viewport geometry across normal-only slice changes', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const { volume } = createScalarDataTestVolume();
    const createPlan = jest.spyOn(
      sampler.scalarViewportSampler,
      'createAxisInterpolationPlan'
    );
    const sampleArgs = {
      volume,
      width: 3,
      height: 3,
      dataPresentation: {
        interpolationType: InterpolationType.LINEAR,
      },
      useViewportSamplingForLinear: true,
    };

    sampler.sampleSliceImage({
      ...sampleArgs,
      camera: createCoronalCamera([1.5, 1.5, 1.5]),
    });
    sampler.sampleSliceImage({
      ...sampleArgs,
      camera: createCoronalCamera([1.5, 2.5, 1.5]),
    });

    expect(createPlan).toHaveBeenCalledTimes(2);

    createPlan.mockRestore();
  });

  it('matches nearest-neighbor tie breaking for half-index source slices', () => {
    const sampler = new PlanarCPUVolumeSampler();
    const sampledSliceState = sampler.sampleSliceImage({
      volume: createTestVolume(),
      width: 1,
      height: 1,
      camera: createCoronalCamera([1.5, 1.5, 1.5]),
      dataPresentation: {
        interpolationType: InterpolationType.NEAREST,
      },
    });

    expect(sampledSliceState.samplingMode).toBe('source-slice');
    expect(sampledSliceState.image.width).toBe(4);
    expect(sampledSliceState.image.height).toBe(4);
    expect(sampledSliceState.image.getPixelData()[0]).toBe(313);
  });
});
