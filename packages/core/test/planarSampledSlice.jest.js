import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import * as createVolumeSliceActorModule from '../src/RenderingEngine/helpers/createVolumeSliceActor';
import {
  BlendModes,
  Events,
  InterpolationType,
  MetadataModules,
  OrientationAxis,
  RenderBackends,
  ViewportType,
} from '../src/enums';
import { ActorRenderMode } from '../src/types';
import * as metaData from '../src/metaData';
import cache from '../src/cache/cache';
import eventTarget from '../src/eventTarget';
import triggerEvent from '../src/utilities/triggerEvent';
import {
  getConfiguration,
  isCornerstoneInitialized,
  resetInitialization,
  setConfiguration,
  setRenderBackend,
  setSliceFirst,
} from '../src/init';
import * as sampleVolumeSliceModule from '../src/utilities/sampleVolumeSlice';
import { getSlabSampleOffsets } from '../src/utilities/sampleVolumeSlice';
import * as setDefaultVolumeVOIModule from '../src/RenderingEngine/helpers/setDefaultVolumeVOI';
import {
  __resetRenderBackendRegistry,
  createRegisteredPlanarRenderPaths,
  getRenderBackendForRenderMode,
  getRenderSurfaceForRenderMode,
  getSampledVolumeRenderModeForBackend,
  isVolumeRenderMode,
  registerRenderBackend,
} from '../src/RenderingEngine/helpers/renderBackendRegistry';
import {
  MAX_CPU_SLICE_SAMPLES,
  PlanarRenderPathDecisionService,
  canSampleSlabOnCpu,
} from '../src/RenderingEngine/Viewports/Planar/PlanarRenderPathDecisionService';
import { createDefaultPlanarRenderPaths } from '../src/RenderingEngine/Viewports/Planar/PlanarRenderPathResolver';
import {
  MAX_PREFETCH_SLICE_SAMPLES,
  MAX_SCREEN_SLICE_SIZE,
  PlanarSliceSampler,
  SAMPLED_SLICE_CACHE_SIZE,
  drawsWithNearestFilter,
  getPlanarSampledSliceInputs,
  getScreenSliceGeometry,
  getVolumeClipPlanes,
  needsScreenGridSample,
} from '../src/RenderingEngine/Viewports/Planar/planarSampledSlice';
import { PlanarSampledSliceActor } from '../src/RenderingEngine/Viewports/Planar/planarSampledSliceActor';
import {
  SAMPLED_SLICE_LOADING_UPDATE_MS,
  getSampledSliceDefaultVOIRange,
  getSampledSliceMaxSize,
} from '../src/RenderingEngine/Viewports/Planar/VtkSampledSliceRenderPath';
import { MAX_CPU_CANVAS_SLICE_SIZE } from '../src/RenderingEngine/Viewports/Planar/CpuVolumeSliceRenderPath';
import {
  SAMPLED_SLICE_REST_DELAY_MS,
  scheduleSampledSliceRestWork,
} from '../src/RenderingEngine/Viewports/Planar/planarSampledSliceRest';
import * as renderingCapabilitiesModule from '../src/utilities/renderingCapabilities';
import VoxelManager from '../src/utilities/VoxelManager';
import {
  VtkVolumeSlicePath,
  VtkVolumeSliceRenderPath,
} from '../src/RenderingEngine/Viewports/Planar/VtkVolumeSliceRenderPath';
import PlanarViewport from '../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import displaySetRegistry from '../src/RenderingEngine/Viewports/displaySetRegistry';

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * A volume with the fields that the decision, the geometry, the resolved view
 * and the render path read. The voxels are not read: the tests replace
 * sampleVolumeSlice.
 */
function createVolume({
  volumeId = 'ct-volume',
  dimensions = [8, 6, 10],
  spacing = [1, 1, 2],
  numberOfComponents = 1,
  imageIds = Array.from({ length: dimensions[2] }, (_, i) => `ct:${i}`),
  loading = false,
} = {}) {
  const origin = [0, 0, 0];
  const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const imageData = vtkImageData.newInstance({ spacing, origin, direction });

  imageData.setDimensions(dimensions);

  return {
    volumeId,
    imageIds,
    dimensions,
    spacing,
    direction,
    origin,
    dataType: 'Int16Array',
    voxelGrid: { dimensions, spacing, direction, origin },
    isDynamicVolume: () => false,
    imageData,
    metadata: { FrameOfReferenceUID: 'sampled-slice-frame' },
    loadStatus: { loaded: !loading, loading },
    load: jest.fn(),
    getVoxelQuality: jest.fn(() => undefined),
    voxelManager: {
      numberOfComponents,
      getConstructor: () => Int16Array,
      getRange: () => [-1000, 2000],
    },
  };
}

function mockSampler() {
  return jest
    .spyOn(sampleVolumeSliceModule, 'sampleVolumeSlice')
    .mockImplementation(({ geometry, pixelData }) => {
      const length = geometry.width * geometry.height;
      const values =
        pixelData && pixelData.length === length
          ? pixelData
          : new Int16Array(length);

      return { pixelData: values, min: 0, max: 1 };
    });
}

describe('render backend registry: sampled volume mode', () => {
  afterEach(() => {
    __resetRenderBackendRegistry();
  });

  it('registers vtkSampledSlice as a volume mode of the gpu backend on the vtk surface', () => {
    expect(isVolumeRenderMode(ActorRenderMode.VTK_SAMPLED_SLICE)).toBe(true);
    expect(
      getRenderSurfaceForRenderMode(ActorRenderMode.VTK_SAMPLED_SLICE)
    ).toBe('vtk');
    expect(
      getRenderBackendForRenderMode(ActorRenderMode.VTK_SAMPLED_SLICE)
    ).toBe(RenderBackends.GPU);
    expect(getSampledVolumeRenderModeForBackend(RenderBackends.GPU)).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
    expect(getSampledVolumeRenderModeForBackend(RenderBackends.CPU)).toBe(
      undefined
    );
    expect(getSampledVolumeRenderModeForBackend('unknown')).toBe(undefined);
  });

  it('ships the sampled slice path in the default planar render paths', () => {
    const ids = createDefaultPlanarRenderPaths().map((path) => path.id);

    expect(ids).toContain('planar:vtk-sampled-slice');
    expect(ids).toContain('planar:vtk-volume-slice');
  });

  it('lets an extension backend declare a sampled volume mode', () => {
    const sampledPath = { id: 'test:sampled-path' };

    registerRenderBackend({
      backend: 'test:sampler',
      renderModes: {
        image: { id: 'test:samplerImage' },
        volume: { id: 'test:samplerVolume' },
        sampledVolume: {
          id: 'test:samplerSampled',
          createDefinition: () => sampledPath,
        },
      },
    });

    expect(isVolumeRenderMode('test:samplerSampled')).toBe(true);
    expect(getRenderBackendForRenderMode('test:samplerSampled')).toBe(
      'test:sampler'
    );
    expect(getSampledVolumeRenderModeForBackend('test:sampler')).toBe(
      'test:samplerSampled'
    );
    expect(createRegisteredPlanarRenderPaths()).toContain(sampledPath);
  });

  it('rejects a sampled volume mode that repeats another mode of the backend', () => {
    expect(() =>
      registerRenderBackend({
        backend: 'test:same',
        renderModes: {
          image: { id: 'test:sameImage' },
          volume: { id: 'test:sameVolume' },
          sampledVolume: { id: 'test:sameVolume' },
        },
      })
    ).toThrow(/distinct render modes/);
  });

  it('keeps the core backends after a reset', () => {
    __resetRenderBackendRegistry();

    expect(getSampledVolumeRenderModeForBackend(RenderBackends.GPU)).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
  });
});

describe('slice first decision', () => {
  const dataSet = {
    imageIds: Array.from({ length: 10 }, (_, i) => `ct:${i}`),
    volumeId: 'ct-volume',
  };
  let service;
  let volume;

  beforeEach(() => {
    service = new PlanarRenderPathDecisionService();
    volume = createVolume();
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) => (id === 'ct-volume' ? volume : undefined));
  });

  afterEach(() => {
    setSliceFirst(false);
    setRenderBackend(RenderBackends.Auto);
    __resetRenderBackendRegistry();
    jest.restoreAllMocks();
  });

  it('is on by default', () => {
    jest.isolateModules(() => {
      const freshInit = require('../src/init');

      expect(freshInit.getConfiguration().rendering.planar.sliceFirst).toBe(
        true
      );
    });
  });

  it('stays on for a configuration that does not name it', () => {
    const configuration = getConfiguration();

    setConfiguration({
      ...configuration,
      rendering: { ...configuration.rendering, planar: {} },
    });

    try {
      expect(service.select(dataSet).renderMode).toBe(
        ActorRenderMode.VTK_SAMPLED_SLICE
      );
    } finally {
      setConfiguration(configuration);
    }
  });

  it('keeps the GPU volume path while slice first is off', () => {
    setSliceFirst(false);

    expect(getConfiguration().rendering.planar.sliceFirst).toBe(false);
    expect(service.select(dataSet).renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
  });

  it('samples on the CPU when slice first is on globally', () => {
    setSliceFirst(true);

    expect(service.select(dataSet).renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
  });

  it('lets the option of the display set win over the global value', () => {
    expect(service.select(dataSet, { sliceFirst: true }).renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );

    setSliceFirst(true);

    expect(service.select(dataSet, { sliceFirst: false }).renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
  });

  it('keeps the volume mode of a cpu pin and of an extension backend with no sampled mode', () => {
    registerRenderBackend({
      backend: 'test:plain',
      renderModes: {
        image: { id: 'test:plainImage' },
        volume: { id: 'test:plainVolume' },
      },
    });

    expect(
      service.select(dataSet, { sliceFirst: true, renderBackend: 'cpu' })
        .renderMode
    ).toBe(ActorRenderMode.CPU_VOLUME);
    expect(
      service.select(dataSet, { sliceFirst: true, renderBackend: 'test:plain' })
        .renderMode
    ).toBe('test:plainVolume');
  });

  it('keeps the stack path for a stack data set', () => {
    expect(
      service.select({ imageIds: ['plain:1'] }, { sliceFirst: true }).renderMode
    ).toBe(ActorRenderMode.VTK_IMAGE);
  });

  it('gives the GPU volume path before the load creates the volume (the viewport decides again after it), and for a colour volume', () => {
    jest
      .spyOn(require('../src/utilities/isValidVolume'), 'isValidVolume')
      .mockReturnValue(true);

    expect(
      service.select(
        { imageIds: dataSet.imageIds, volumeId: 'not-cached' },
        { sliceFirst: true }
      ).renderMode
    ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);

    volume = createVolume({ numberOfComponents: 3 });

    expect(service.select(dataSet, { sliceFirst: true }).renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
  });

  it('keeps the GPU volume path for a segmentation overlay', () => {
    const segmentation = {
      ...dataSet,
      reference: { kind: 'segmentation', segmentationId: 'seg' },
    };

    expect(
      service.select(segmentation, { sliceFirst: true, role: 'overlay' })
        .renderMode
    ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
    expect(service.select(segmentation, { sliceFirst: true }).renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
    expect(
      service.select(segmentation, { sliceFirst: true, role: 'source' })
        .renderMode
    ).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
  });

  it('leaves every slab to the GPU volume path and samples a thickness of one sample on the CPU', () => {
    volume = createVolume({
      dimensions: [512, 512, 300],
      spacing: [1, 1, 1],
    });

    expect(
      service.select(dataSet, {
        sliceFirst: true,
        slabThickness: 10,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
      }).renderMode
    ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
    expect(
      service.select(dataSet, {
        sliceFirst: true,
        slabThickness: 2,
        blendMode: BlendModes.AVERAGE_INTENSITY_BLEND,
      }).renderMode
    ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
    expect(
      service.select(dataSet, {
        sliceFirst: true,
        slabThickness: 1,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
      }).renderMode
    ).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
  });

  it('estimates the slab work from the slab samples and the largest slice', () => {
    const ct = { dimensions: [512, 512, 300], spacing: [1, 1, 1] };

    expect(canSampleSlabOnCpu(ct, undefined)).toBe(true);
    expect(canSampleSlabOnCpu(ct, 0)).toBe(true);
    expect(canSampleSlabOnCpu(ct, 10)).toBe(true);
    expect(19 * 512 * 512).toBeLessThanOrEqual(MAX_CPU_SLICE_SAMPLES);
    expect(canSampleSlabOnCpu(ct, 10.5)).toBe(false);
    expect(
      canSampleSlabOnCpu(
        { dimensions: [64, 2048, 2048], spacing: [1, 1, 1] },
        1
      )
    ).toBe(true);
    expect(
      canSampleSlabOnCpu(
        { dimensions: [64, 2048, 2048], spacing: [1, 1, 1] },
        2
      )
    ).toBe(false);
  });

  it('counts the slab samples with the offsets of sampleVolumeSlice', () => {
    const ct = { dimensions: [512, 512, 300], spacing: [0.7, 0.7, 1.25] };

    [0.5, 1, 1.3, 2.9, 5.1, 6.6, 6.7, 7, 8.4, 20].forEach((thickness) => {
      const count = getSlabSampleOffsets(ct, thickness).length;

      expect(canSampleSlabOnCpu(ct, thickness)).toBe(
        count * 512 * 512 <= MAX_CPU_SLICE_SAMPLES
      );
    });
    expect(canSampleSlabOnCpu(ct, 7)).toBe(true);
    expect(canSampleSlabOnCpu(ct, 8.4)).toBe(false);
  });

  it('does not change whether a data set can render', () => {
    expect(service.canRender(dataSet, { sliceFirst: true })).toBe(true);
    expect(
      service.canRender(dataSet, { sliceFirst: true, slabThickness: 1000 })
    ).toBe(true);
  });

  it('setSliceFirst does not mark the library initialized', () => {
    resetInitialization();
    setSliceFirst(true);

    expect(isCornerstoneInitialized()).toBe(false);
    expect(getConfiguration().rendering.planar.sliceFirst).toBe(true);
  });

  it('setSliceFirst updates planar next viewports only, setRenderBackend all of them', () => {
    const engineId = 'slice-first-fan-out-engine';
    const video = {
      type: ViewportType.VIDEO,
      updateRenderingPipeline: jest.fn(),
    };
    const volume3D = {
      type: ViewportType.VOLUME_3D,
      updateRenderingPipeline: jest.fn(),
    };
    const planar = {
      type: ViewportType.PLANAR,
      updateRenderingPipeline: jest.fn(),
    };

    renderingEngineCache.set({
      id: engineId,
      getViewports: () => [video, volume3D, planar],
    });

    try {
      setSliceFirst(true);

      expect(planar.updateRenderingPipeline).toHaveBeenCalledTimes(1);
      expect(video.updateRenderingPipeline).not.toHaveBeenCalled();
      expect(volume3D.updateRenderingPipeline).not.toHaveBeenCalled();

      setRenderBackend(RenderBackends.GPU);

      expect(planar.updateRenderingPipeline).toHaveBeenCalledTimes(2);
      expect(video.updateRenderingPipeline).toHaveBeenCalledTimes(1);
      expect(volume3D.updateRenderingPipeline).toHaveBeenCalledTimes(1);
    } finally {
      renderingEngineCache.delete(engineId);
    }
  });
});

describe('sample step', () => {
  let volume;
  let sampleSpy;
  const axialCamera = (focalPoint = [3.5, 2.5, 8], viewUp = [0, -1, 0]) => ({
    focalPoint,
    viewPlaneNormal: [0, 0, 1],
    viewUp,
  });
  const nearest = { interpolationType: InterpolationType.NEAREST };
  const linear = { interpolationType: InterpolationType.LINEAR };

  beforeEach(() => {
    volume = createVolume();
    sampleSpy = mockSampler();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('samples once and keeps the slice for zoom, pan and in-plane rotation', () => {
    const sampler = new PlanarSliceSampler();
    const first = sampler.sample(volume, axialCamera(), nearest);

    expect(sampleSpy).toHaveBeenCalledTimes(1);
    expect(first.width).toBe(8);
    expect(first.height).toBe(6);
    expect(first.sampledFor.sliceIndex).toBe(4);

    expect(sampler.sample(volume, axialCamera([1, 1, 8]), nearest)).toBe(first);
    expect(
      sampler.sample(volume, axialCamera([1, 1, 8.4], [1, 0, 0]), nearest)
    ).toBe(first);
    expect(sampleSpy).toHaveBeenCalledTimes(1);
  });

  it('samples again for a new plane and keeps the slice it left', () => {
    const sampler = new PlanarSliceSampler();
    const first = sampler.sample(volume, axialCamera([3.5, 2.5, 8]), nearest);
    const second = sampler.sample(volume, axialCamera([3.5, 2.5, 10]), nearest);

    expect(sampleSpy).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
    expect(second.sampledFor.sliceIndex).toBe(5);
    expect(second.pixelData).not.toBe(first.pixelData);
    expect(sampler.sample(volume, axialCamera([3.5, 2.5, 8]), nearest)).toBe(
      first
    );
    expect(sampleSpy).toHaveBeenCalledTimes(2);
    expect(sampler.getStatistics()).toMatchObject({
      hits: 1,
      misses: 2,
      prefetched: 0,
      refined: 0,
      size: 2,
    });
  });

  it('keeps at most seven slices and reuses the array of the farthest one it drops', () => {
    const sampler = new PlanarSliceSampler();
    const slices = [0, 1, 2, 3, 4, 5, 6].map((index) =>
      sampler.sample(volume, axialCamera([3.5, 2.5, index * 2]), nearest)
    );

    expect(SAMPLED_SLICE_CACHE_SIZE).toBe(7);
    expect(sampler.getStatistics().size).toBe(7);

    sampler.sample(volume, axialCamera([3.5, 2.5, 14]), nearest);

    expect(sampleSpy).toHaveBeenCalledTimes(8);
    expect(sampleSpy.mock.calls[7][0].pixelData).toBe(slices[0].pixelData);
    expect(sampler.getStatistics().size).toBe(7);

    sampler.sample(volume, axialCamera([3.5, 2.5, 2]), nearest);

    expect(sampleSpy).toHaveBeenCalledTimes(8);
  });

  it('drops the kept slices for new voxel data, new inputs and a new view normal', () => {
    const sampler = new PlanarSliceSampler();
    const sagittal = {
      focalPoint: [3.5, 2.5, 8],
      viewPlaneNormal: [1, 0, 0],
      viewUp: [0, 0, 1],
    };

    sampler.sample(volume, axialCamera([3.5, 2.5, 8]), nearest);
    sampler.sample(volume, axialCamera([3.5, 2.5, 10]), nearest);
    sampler.invalidate();

    expect(sampler.getStatistics().size).toBe(0);

    sampler.sample(volume, axialCamera([3.5, 2.5, 8]), nearest);
    sampler.sample(volume, axialCamera([3.5, 2.5, 8]), {
      ...nearest,
      timePoint: 1,
    });

    expect(sampler.getStatistics().size).toBe(1);

    sampler.sample(volume, sagittal, { ...nearest, timePoint: 1 });

    expect(sampler.getStatistics().size).toBe(1);
    expect(sampleSpy).toHaveBeenCalledTimes(5);
  });

  it('samples a linear slice on the plane of the focal point', () => {
    const sampler = new PlanarSliceSampler();

    sampler.sample(volume, axialCamera([3.5, 2.5, 8]), linear);
    sampler.sample(volume, axialCamera([3.5, 2.5, 8.4]), linear);

    expect(sampleSpy).toHaveBeenCalledTimes(2);
    expect(sampleSpy.mock.calls[1][0].geometry.origin[2]).toBeCloseTo(8.4);
    expect(sampleSpy.mock.calls[1][0].interpolationType).toBe(
      InterpolationType.LINEAR
    );
  });

  it('samples again when the interpolation, the slab or the time point changes', () => {
    const sampler = new PlanarSliceSampler();
    const camera = axialCamera();

    sampler.sample(volume, camera, nearest);
    sampler.sample(volume, camera, linear);
    sampler.sample(volume, camera, {
      ...linear,
      slab: { thickness: 6, blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND },
    });
    sampler.sample(volume, camera, {
      ...linear,
      slab: { thickness: 6, blendMode: BlendModes.MINIMUM_INTENSITY_BLEND },
    });
    sampler.sample(volume, camera, {
      ...linear,
      slab: { thickness: 6, blendMode: BlendModes.MINIMUM_INTENSITY_BLEND },
      timePoint: 2,
    });

    expect(sampleSpy).toHaveBeenCalledTimes(5);
    expect(sampleSpy.mock.calls[3][0].slab).toEqual({
      thickness: 6,
      blendMode: BlendModes.MINIMUM_INTENSITY_BLEND,
    });
  });

  it('samples again after invalidate, and passes the lowest value as outside value', () => {
    const sampler = new PlanarSliceSampler();

    sampler.sample(volume, axialCamera(), nearest);
    sampler.invalidate();
    sampler.sample(volume, axialCamera(), nearest);

    expect(sampleSpy).toHaveBeenCalledTimes(2);
    expect(sampleSpy.mock.calls[1][0].outsideValue).toBe(-1000);
  });

  it('keeps an oblique slice when the camera pans in its plane', () => {
    const sampler = new PlanarSliceSampler();
    const normal = [0, Math.sin(0.3), Math.cos(0.3)];
    const inPlane = [1, 0, 0];
    const camera = (shift) => ({
      focalPoint: [3.5 + shift, 2.5, 8],
      viewPlaneNormal: normal,
      viewUp: [0, Math.cos(0.3), -Math.sin(0.3)],
    });

    const first = sampler.sample(volume, camera(0), linear);

    expect(first).toBeDefined();
    expect(sampler.sample(volume, camera(inPlane[0] * 1.25), linear)).toBe(
      first
    );
    expect(sampleSpy).toHaveBeenCalledTimes(1);
  });

  it('samples an oblique slice on the screen grid at rest, never an axis-aligned one', () => {
    const sampler = new PlanarSliceSampler();
    const oblique = {
      focalPoint: [3.5, 2.5, 8],
      viewPlaneNormal: [0, Math.sin(0.3), Math.cos(0.3)],
      viewUp: [0, Math.cos(0.3), -Math.sin(0.3)],
      parallelScale: 5,
    };
    const screenOf = (camera, canvasWidth = 40, canvasHeight = 20) =>
      getScreenSliceGeometry({ camera, canvasWidth, canvasHeight });
    const axial = { ...axialCamera(), parallelScale: 5 };

    sampler.sample(volume, axial, linear, screenOf(axial));

    expect(
      sampler.sampleFiner(volume, axial, linear, screenOf(axial))
    ).toBeUndefined();

    const coarse = sampler.sample(volume, oblique, linear, screenOf(oblique));

    expect(sampleSpy).toHaveBeenCalledTimes(2);

    const fine = sampler.sampleFiner(
      volume,
      oblique,
      linear,
      screenOf(oblique)
    );

    expect(sampleSpy).toHaveBeenCalledTimes(3);
    expect(sampleSpy.mock.calls[2][0].geometry).toMatchObject({
      width: 40,
      height: 20,
      sliceIndex: coarse.sampledFor.sliceIndex,
    });
    expect(sampleSpy.mock.calls[2][0].interpolationType).toBe(
      InterpolationType.LINEAR
    );
    expect(fine.spacing[0]).toBeCloseTo(0.5);
    expect(sampler.getSlice()).toBe(fine);
    expect(
      sampler.sampleFiner(volume, oblique, linear, screenOf(oblique))
    ).toBeUndefined();
    expect(sampler.sample(volume, oblique, linear, screenOf(oblique))).toBe(
      fine
    );

    const panned = { ...oblique, focalPoint: [4, 2.5, 8] };

    expect(sampler.sample(volume, panned, linear, screenOf(panned))).toBe(
      coarse
    );
    expect(sampleSpy).toHaveBeenCalledTimes(3);

    const pannedFine = sampler.sampleFiner(
      volume,
      panned,
      linear,
      screenOf(panned)
    );

    expect(sampleSpy).toHaveBeenCalledTimes(4);
    expect(pannedFine.origin[0]).toBeCloseTo(fine.origin[0] + 0.5);
    expect(sampler.getStatistics()).toMatchObject({ refined: 2, size: 2 });
    expect(sampler.getStatistics().lastFineSampleMs).toBeGreaterThanOrEqual(0);
    expect(sampler.getStatistics().lastSampleMs).toBeGreaterThanOrEqual(0);
  });

  it('samples an axis-aligned view on the screen grid at rest only for a maximum or a minimum slab', () => {
    const axial = { ...axialCamera(), parallelScale: 5 };
    const screen = getScreenSliceGeometry({
      camera: axial,
      canvasWidth: 40,
      canvasHeight: 20,
    });
    const refinedFor = (blendMode) => {
      const sampler = new PlanarSliceSampler();
      const inputs = { ...linear, slab: { thickness: 3, blendMode } };

      sampler.sample(volume, axial, inputs, screen);

      return sampler.sampleFiner(volume, axial, inputs, screen);
    };
    const maximum = refinedFor(BlendModes.MAXIMUM_INTENSITY_BLEND);

    expect(maximum).toMatchObject({
      width: 40,
      height: 20,
      insideVolume: false,
    });
    expect(refinedFor(BlendModes.MINIMUM_INTENSITY_BLEND)).toBeDefined();
    expect(refinedFor(BlendModes.AVERAGE_INTENSITY_BLEND)).toBeUndefined();
  });

  it('marks an axis-aligned slice as inside the volume, an oblique or screen grid slice not', () => {
    const sampler = new PlanarSliceSampler();
    const oblique = {
      focalPoint: [3.5, 2.5, 8],
      viewPlaneNormal: [0, Math.sin(0.3), Math.cos(0.3)],
      viewUp: [0, Math.cos(0.3), -Math.sin(0.3)],
      parallelScale: 5,
    };
    const screen = getScreenSliceGeometry({
      camera: oblique,
      canvasWidth: 20,
      canvasHeight: 20,
    });

    expect(
      sampler.sample(volume, axialCamera([3.5, 2.5, 0]), linear)
    ).toMatchObject({
      insideVolume: true,
    });
    expect(
      sampler.sample(volume, axialCamera([3.5, 2.5, 18]), nearest)
    ).toMatchObject({
      insideVolume: true,
      sampledFor: { sliceIndex: 9 },
    });
    expect(sampler.sample(volume, oblique, linear, screen).insideVolume).toBe(
      false
    );
    expect(
      sampler.sampleFiner(volume, oblique, linear, screen).insideVolume
    ).toBe(false);
  });

  it('samples the screen grid with nearest for a nearest view, and drops it for a new plane', () => {
    const sampler = new PlanarSliceSampler();
    const oblique = (z) => ({
      focalPoint: [3.5, 2.5, z],
      viewPlaneNormal: [0, Math.sin(0.3), Math.cos(0.3)],
      viewUp: [0, Math.cos(0.3), -Math.sin(0.3)],
      parallelScale: 5,
    });
    const screenOf = (camera) =>
      getScreenSliceGeometry({ camera, canvasWidth: 30, canvasHeight: 30 });

    sampler.sample(volume, oblique(8), nearest, screenOf(oblique(8)));
    sampler.sampleFiner(volume, oblique(8), nearest, screenOf(oblique(8)));

    expect(sampleSpy.mock.calls[1][0].interpolationType).toBe(
      InterpolationType.NEAREST
    );
    expect(sampler.getStatistics().size).toBe(2);

    const next = sampler.sample(
      volume,
      oblique(9),
      nearest,
      screenOf(oblique(9))
    );

    expect(next.width).not.toBe(30);
    expect(sampler.getStatistics().size).toBe(2);
    expect(
      sampler.sampleFiner(volume, oblique(8), nearest, screenOf(oblique(8)))
    ).toBeUndefined();
  });

  it('prefetches a neighbour without changing the slice on screen', () => {
    const sampler = new PlanarSliceSampler();
    const onScreen = sampler.sample(volume, axialCamera([3.5, 2.5, 8]), linear);

    expect(sampler.prefetch(volume, axialCamera([3.5, 2.5, 10]), linear)).toBe(
      true
    );
    expect(sampler.prefetch(volume, axialCamera([3.5, 2.5, 10]), linear)).toBe(
      false
    );
    expect(sampler.getSlice()).toBe(onScreen);

    sampleSpy.mockClear();
    sampler.sample(volume, axialCamera([3.5, 2.5, 10]), linear);

    expect(sampleSpy).not.toHaveBeenCalled();
    expect(sampler.getStatistics()).toMatchObject({
      hits: 1,
      misses: 1,
      prefetched: 1,
      refined: 0,
      size: 2,
    });
  });

  it('does not prefetch a slab whose samples exceed the prefetch limit', () => {
    const large = createVolume({
      dimensions: [512, 512, 40],
      spacing: [1, 1, 1],
    });
    const camera = (z) => axialCamera([255.5, 255.5, z]);
    const thinSlab = {
      ...linear,
      slab: { thickness: 2, blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND },
    };
    const thickSlab = {
      ...linear,
      slab: { thickness: 4, blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND },
    };
    const sampler = new PlanarSliceSampler();

    expect(3 * 512 * 512).toBeLessThanOrEqual(MAX_PREFETCH_SLICE_SAMPLES);
    expect(7 * 512 * 512).toBeGreaterThan(MAX_PREFETCH_SLICE_SAMPLES);

    sampler.sample(large, camera(20), thinSlab);

    expect(sampler.prefetch(large, camera(21), thinSlab)).toBe(true);

    sampler.sample(large, camera(20), thickSlab);

    expect(sampler.prefetch(large, camera(21), thickSlab)).toBe(false);
  });

  it('samples the screen grid at rest only while its work stays within the CPU slice limit', () => {
    const oblique = {
      focalPoint: [3.5, 2.5, 8],
      viewPlaneNormal: [0, Math.sin(0.3), Math.cos(0.3)],
      viewUp: [0, Math.cos(0.3), -Math.sin(0.3)],
      parallelScale: 5,
    };
    const slabOf = (thickness) => ({
      ...linear,
      slab: { thickness, blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND },
    });
    const restSample = (inputs, canvasWidth, canvasHeight) => {
      const sampler = new PlanarSliceSampler();
      const screen = getScreenSliceGeometry({
        camera: oblique,
        canvasWidth,
        canvasHeight,
      });
      const coarse = sampler.sample(volume, oblique, inputs, screen);
      const fine = sampler.sampleFiner(volume, oblique, inputs, screen);

      return { coarse, fine, shown: sampler.getSlice(), sampler };
    };
    const thickSlab = slabOf(5);
    const pixels = 1600 * 1200;

    expect(2048 * 2048).toBeLessThanOrEqual(MAX_CPU_SLICE_SAMPLES);
    expect(getSlabSampleOffsets(volume, 5).length * pixels).toBeGreaterThan(
      MAX_CPU_SLICE_SAMPLES
    );
    expect(getSlabSampleOffsets(volume, 1).length * pixels).toBeLessThanOrEqual(
      MAX_CPU_SLICE_SAMPLES
    );

    const plain = restSample(linear, 2048, 2048);

    expect(plain.fine).toBeDefined();
    expect(plain.fine.width * plain.fine.height).toBe(2048 * 2048);

    const thin = restSample(slabOf(1), 1600, 1200);

    expect(thin.fine).toBeDefined();

    const thick = restSample(thickSlab, 1600, 1200);

    expect(thick.fine).toBeUndefined();
    expect(thick.shown).toBe(thick.coarse);
    expect(thick.sampler.getStatistics().refined).toBe(0);
  });

  it('gives no slice for a plane outside the volume', () => {
    const sampler = new PlanarSliceSampler();

    expect(sampler.sample(volume, axialCamera([0, 0, 500]), nearest)).toBe(
      undefined
    );
    expect(sampleSpy).not.toHaveBeenCalled();
  });

  it('turns a presentation into sampling inputs', () => {
    expect(getPlanarSampledSliceInputs(volume, undefined)).toEqual({
      interpolationType: InterpolationType.LINEAR,
      slab: undefined,
      timePoint: undefined,
    });
    expect(
      getPlanarSampledSliceInputs(volume, {
        interpolationType: InterpolationType.NEAREST,
        slabThickness: 4,
      })
    ).toEqual({
      interpolationType: InterpolationType.NEAREST,
      slab: { thickness: 4, blendMode: BlendModes.AVERAGE_INTENSITY_BLEND },
      timePoint: undefined,
    });

    const dynamicVolume = {
      ...volume,
      isDynamicVolume: () => true,
      dimensionGroupNumber: 3,
    };

    expect(
      getPlanarSampledSliceInputs(dynamicVolume, {
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
      }).timePoint
    ).toBe(3);
  });

  it('gives the six faces of the volume, half a voxel outside the outer voxels', () => {
    const planes = getVolumeClipPlanes(volume);

    expect(planes).toHaveLength(6);
    expect(planes[0]).toEqual({ origin: [-0.5, 0, 0], normal: [1, 0, 0] });
    expect(planes[1]).toEqual({ origin: [7.5, 0, 0], normal: [-1, -0, -0] });
    expect(planes[5].origin).toEqual([0, 0, 19]);
  });
});

describe('screen grid', () => {
  const camera = (overrides = {}) => ({
    focalPoint: [10, 20, 30],
    viewPlaneNormal: [0, 0, -1],
    viewUp: [0, -1, 0],
    parallelScale: 50,
    ...overrides,
  });
  const expectPoint = (actual, expected) => {
    expected.forEach((value, index) => {
      expect(actual[index]).toBeCloseTo(value, 9);
    });
  };

  it('puts one sample on the centre of each device pixel of the canvas', () => {
    const geometry = getScreenSliceGeometry({
      camera: camera(),
      canvasWidth: 200,
      canvasHeight: 100,
    });

    expect(geometry.width).toBe(200);
    expect(geometry.height).toBe(100);
    expectPoint(geometry.origin, [-89.5, -29.5, 30]);
    expectPoint(geometry.xDirection, [1, 0, 0]);
    expectPoint(geometry.yDirection, [0, 1, 0]);
    expectPoint(geometry.zDirection, [0, 0, -1]);
    expectPoint(geometry.spacing, [1, 1]);
  });

  it('follows a rotation, a flip, a zoom and an anisotropic presentation scale', () => {
    const rotated = getScreenSliceGeometry({
      camera: camera({ viewUp: [1, 0, 0] }),
      canvasWidth: 200,
      canvasHeight: 100,
    });

    expectPoint(rotated.origin, [59.5, -79.5, 30]);
    expectPoint(rotated.xDirection, [0, 1, 0]);
    expectPoint(rotated.yDirection, [-1, 0, 0]);

    const flipped = getScreenSliceGeometry({
      camera: camera({ viewPlaneNormal: [0, 0, 1] }),
      canvasWidth: 200,
      canvasHeight: 100,
    });

    expectPoint(flipped.origin, [109.5, -29.5, 30]);
    expectPoint(flipped.xDirection, [-1, 0, 0]);
    expectPoint(flipped.zDirection, [0, 0, 1]);

    const scaled = getScreenSliceGeometry({
      camera: camera({ parallelScale: 25, presentationScale: [2, 1] }),
      canvasWidth: 200,
      canvasHeight: 100,
    });

    expectPoint(scaled.spacing, [0.25, 0.5]);
    expectPoint(scaled.origin, [10 - 99.5 * 0.25, 20 - 49.5 * 0.5, 30]);
  });

  it('lies exactly in the plane of the focal point for an oblique camera', () => {
    const normal = [
      -0.5962687715312728, 0.5453181252630661, -0.5891448840108533,
    ];
    const focalPoint = [-12.25, 180.5, -311.75];
    const geometry = getScreenSliceGeometry({
      camera: camera({
        focalPoint,
        viewPlaneNormal: normal,
        viewUp: [0.2, 0.86, 0.59].map(
          (value, index) =>
            value -
            normal[index] *
              (0.2 * normal[0] + 0.86 * normal[1] + 0.59 * normal[2])
        ),
        parallelScale: 391,
      }),
      canvasWidth: 512,
      canvasHeight: 512,
    });
    const offset = geometry.origin.reduce(
      (sum, value, index) => sum + (value - focalPoint[index]) * normal[index],
      0
    );
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    expect(Math.abs(offset)).toBeLessThan(1e-9);
    expect(Math.abs(dot(geometry.xDirection, normal))).toBeLessThan(1e-12);
    expect(Math.abs(dot(geometry.yDirection, normal))).toBeLessThan(1e-12);
    expect(geometry.spacing[0]).toBeCloseTo((2 * 391) / 512, 6);
  });

  it('spreads at most the limit it is given over a larger canvas side, and one sample per device pixel below it', () => {
    const limited = getScreenSliceGeometry({
      camera: camera(),
      canvasWidth: 3000,
      canvasHeight: 100,
      maxSize: 2048,
    });
    const step = 3000 / 2048;

    expect(limited.width).toBe(2048);
    expect(limited.height).toBe(100);
    expectPoint(limited.spacing, [step, 1]);
    expectPoint(limited.origin, [10 - 1500 + step / 2, -29.5, 30]);

    const full = getScreenSliceGeometry({
      camera: camera(),
      canvasWidth: 3000,
      canvasHeight: 100,
      maxSize: 16384,
    });

    expect(full.width).toBe(3000);
    expectPoint(full.spacing, [1, 1]);
    expectPoint(full.origin, [10 - 1499.5, -29.5, 30]);
    expect(MAX_SCREEN_SLICE_SIZE).toBe(2048);
  });

  it('takes the largest 2D texture of the device as the limit of the GPU draw step, and 16384 for the canvas', () => {
    const spy = jest.spyOn(
      renderingCapabilitiesModule,
      'getRenderingCapabilities'
    );

    spy.mockReturnValue({ webgl: true, maxTextureSize: 16384 });
    expect(getSampledSliceMaxSize()).toBe(16384);

    spy.mockReturnValue({ webgl: true, maxTextureSize: 0 });
    expect(getSampledSliceMaxSize()).toBe(2048);

    spy.mockReturnValue({ webgl: false, maxTextureSize: 8192 });
    expect(getSampledSliceMaxSize()).toBe(2048);

    expect(MAX_CPU_CANVAS_SLICE_SIZE).toBe(16384);
    spy.mockRestore();
  });

  it('gives no grid for an empty canvas or a camera without a parallel scale', () => {
    expect(
      getScreenSliceGeometry({
        camera: camera(),
        canvasWidth: 0,
        canvasHeight: 100,
      })
    ).toBeUndefined();
    expect(
      getScreenSliceGeometry({
        camera: camera({ parallelScale: undefined }),
        canvasWidth: 200,
        canvasHeight: 100,
      })
    ).toBeUndefined();
  });
});

describe('edge of the cut', () => {
  /**
   * Whether the fragment shader of the vtk.js reslice mapper draws a world
   * point: its texture coordinate, `WCTCMatrix` applied to the point, lies in
   * [0, 1] on every axis. WCTCMatrix is the inverse of indexToWorld, moved by
   * half a voxel and scaled by the dimensions (OpenGL/ImageResliceMapper.js).
   */
  function isDrawnByResliceMapper(volume, point) {
    const index = volume.imageData.worldToIndex(point, [0, 0, 0]);

    return index.every((value, axis) => {
      const textureCoordinate = (value + 0.5) / volume.dimensions[axis];

      return textureCoordinate >= 0 && textureCoordinate <= 1;
    });
  }

  function isKeptByClipPlanes(planes, point) {
    return planes.every(
      ({ origin, normal }) =>
        (point[0] - origin[0]) * normal[0] +
          (point[1] - origin[1]) * normal[1] +
          (point[2] - origin[2]) * normal[2] >=
        0
    );
  }

  function createObliqueVolume() {
    const dimensions = [8, 6, 10];
    const spacing = [0.7, 0.9, 2];
    const origin = [-3, 4, 11];
    const angle = 0.35;
    const direction = [
      Math.cos(angle),
      Math.sin(angle),
      0,
      -Math.sin(angle),
      Math.cos(angle),
      0,
      0,
      0,
      1,
    ];
    const imageData = vtkImageData.newInstance({ spacing, origin, direction });

    imageData.setDimensions(dimensions);

    return { dimensions, spacing, origin, direction, imageData };
  }

  it('clips where the GPU volume path stops drawing, on the faces of the volume', () => {
    const volume = createObliqueVolume();
    const planes = getVolumeClipPlanes(volume);
    let state = 7;
    const random = () => {
      state = (state * 16807) % 2147483647;

      return state / 2147483647;
    };

    for (let i = 0; i < 5000; i++) {
      const index = [0, 1, 2].map(
        (axis) => -1.5 + random() * (volume.dimensions[axis] + 2)
      );
      const point = volume.imageData.indexToWorld(index, [0, 0, 0]);

      expect(isKeptByClipPlanes(planes, point)).toBe(
        isDrawnByResliceMapper(volume, point)
      );
    }
  });

  it('draws a slice that lies on the first or the last voxel centre, with no margin', () => {
    const volume = createObliqueVolume();
    const planes = getVolumeClipPlanes(volume);
    const lastSlice = volume.dimensions[2] - 1;

    [0, lastSlice].forEach((k) => {
      [
        [0, 0],
        [7, 5],
        [3.2, 2.7],
        [-0.49, 5.49],
      ].forEach(([i, j]) => {
        const point = volume.imageData.indexToWorld([i, j, k], [0, 0, 0]);

        expect(isKeptByClipPlanes(planes, point)).toBe(true);
        expect(isDrawnByResliceMapper(volume, point)).toBe(true);
      });
    });

    [-0.51, lastSlice + 0.51].forEach((k) => {
      const point = volume.imageData.indexToWorld([3, 3, k], [0, 0, 0]);

      expect(isKeptByClipPlanes(planes, point)).toBe(false);
      expect(isDrawnByResliceMapper(volume, point)).toBe(false);
    });
  });
});

describe('draw step', () => {
  function createSlice(overrides = {}) {
    return {
      pixelData: new Int16Array(12),
      width: 4,
      height: 3,
      origin: [1, 2, 3],
      xDirection: [1, 0, 0],
      yDirection: [0, 1, 0],
      zDirection: [0, 0, 1],
      spacing: [0.5, 2],
      min: 0,
      max: 1,
      sampledFor: {
        interpolationType: InterpolationType.NEAREST,
        sliceIndex: 0,
      },
      ...overrides,
    };
  }

  it('hides the actor until it has a slice', () => {
    const draw = new PlanarSampledSliceActor();

    expect(draw.actor.getVisibility()).toBe(false);

    draw.setSlice(createSlice());

    expect(draw.actor.getVisibility()).toBe(true);

    draw.setSlice(undefined);

    expect(draw.actor.getVisibility()).toBe(false);
  });

  it('draws the slice in world coordinates on a real vtkImageData', () => {
    const draw = new PlanarSampledSliceActor({ voxelManager: { id: 'vm' } });
    const slice = createSlice();

    expect(draw.setSlice(slice)).toBe(true);
    expect(draw.setSlice(slice)).toBe(false);

    const imageData = draw.mapper.getInputData();

    expect(imageData.getDimensions()).toEqual([4, 3, 1]);
    expect(Array.from(imageData.getSpacing())).toEqual([0.5, 2, 1]);
    expect(Array.from(imageData.getOrigin())).toEqual([1, 2, 3]);
    expect(Array.from(imageData.getDirection())).toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
    expect(imageData.getPointData().getScalars().getData()).not.toBe(
      slice.pixelData
    );
    expect(imageData.getPointData().getScalars().getData()).toEqual(
      slice.pixelData
    );
    expect(imageData.get('voxelManager').voxelManager).toEqual({ id: 'vm' });
  });

  it('reuses the image data and its scalar array while the size and type stay', () => {
    const draw = new PlanarSampledSliceActor();
    const pixelData = new Int16Array(12);

    draw.setSlice(createSlice({ pixelData }));

    const imageData = draw.mapper.getInputData();
    const scalars = imageData.getPointData().getScalars();
    const mtime = imageData.getMTime();

    pixelData[0] = 7;
    draw.setSlice(createSlice({ pixelData, origin: [1, 2, 5] }));

    expect(draw.mapper.getInputData()).toBe(imageData);
    expect(imageData.getPointData().getScalars()).toBe(scalars);
    expect(imageData.getMTime()).toBeGreaterThan(mtime);
    expect(Array.from(imageData.getOrigin())).toEqual([1, 2, 5]);

    draw.setSlice(createSlice({ pixelData: new Int16Array(12) }));

    expect(imageData.getPointData().getScalars()).toBe(scalars);

    draw.setSlice(
      createSlice({ pixelData: new Int16Array(20), width: 5, height: 4 })
    );

    expect(draw.mapper.getInputData()).toBe(imageData);
    expect(imageData.getDimensions()).toEqual([5, 4, 1]);
    expect(imageData.getPointData().getScalars().getData().length).toBe(20);
  });

  it('clips to the faces of the volume and moves the planes with the actor', () => {
    const draw = new PlanarSampledSliceActor();
    const volume = createVolume();

    draw.setClipPlanes(getVolumeClipPlanes(volume));
    draw.setSlice(createSlice({ origin: [0, 0, 8.5] }));

    expect(draw.mapper.getNumberOfClippingPlanes()).toBe(6);

    draw.followCamera(
      {
        focalPoint: [0, 0, 8],
        viewPlaneNormal: [0, 0, 1],
        viewUp: [0, -1, 0],
      },
      0
    );

    const position = draw.actor.getPosition();

    expect(position[0]).toBeCloseTo(0);
    expect(position[1]).toBeCloseTo(0);
    expect(position[2]).toBeCloseTo(-0.5);

    const lowerZ = draw.mapper.getClippingPlanes()[4];

    expect(lowerZ.getOrigin()[2]).toBeCloseTo(-1.5);
    expect(Array.from(lowerZ.getNormal())).toEqual([0, 0, 1]);
  });

  it('draws a slice inside the volume without clip planes, so its edges are the faces', () => {
    const draw = new PlanarSampledSliceActor();

    draw.setClipPlanes(getVolumeClipPlanes(createVolume()));
    draw.setSlice(createSlice({ insideVolume: true }));

    expect(draw.mapper.getNumberOfClippingPlanes()).toBe(0);

    draw.setSlice(createSlice({ insideVolume: false }));

    expect(draw.mapper.getNumberOfClippingPlanes()).toBe(6);

    const image = createSlice({
      insideVolume: true,
      origin: [0, 5, 0],
      width: 8,
      height: 6,
      pixelData: new Int16Array(48),
      spacing: [1, 1],
      xDirection: [1, 0, 0],
      yDirection: [0, -1, 0],
      zDirection: [0, 0, 1],
    });

    draw.setSlice(image);

    expect(draw.mapper.getNumberOfClippingPlanes()).toBe(0);
    expect(draw.mapper.getInputData().getBounds().slice(0, 4)).toEqual([
      -0.5, 7.5, -0.5, 5.5,
    ]);
  });

  it('applies the presentation of the volume path', () => {
    const draw = new PlanarSampledSliceActor();

    draw.setSlice(createSlice());
    draw.applyPresentation(
      { interpolationType: InterpolationType.NEAREST, invert: false },
      { lower: -100, upper: 300 }
    );

    const property = draw.actor.getProperty();

    expect(property.getInterpolationType()).toBe(InterpolationType.NEAREST);
    expect(property.getRGBTransferFunction(0).getRange()).toEqual([-100, 300]);

    draw.applyPresentation({ visible: false }, { lower: -100, upper: 300 });

    expect(draw.actor.getVisibility()).toBe(false);
  });
});

describe('sample step: array types and size limits', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * A volume with real voxels, i * 3 + j * 5 + k * 7, so that a sample
   * between two slices has a fraction.
   */
  function createSampledVolume(ArrayType = Int16Array) {
    const dimensions = [4, 3, 20];
    const scalarData = new ArrayType(4 * 3 * 20);

    for (let k = 0; k < 20; k++) {
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 4; i++) {
          scalarData[(k * 3 + j) * 4 + i] = i * 3 + j * 5 + k * 7;
        }
      }
    }

    return {
      ...createVolume({ dimensions, spacing: [1, 1, 1] }),
      voxelManager: VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData,
      }),
    };
  }

  const axial = (z) => ({
    focalPoint: [1.5, 1, z],
    viewPlaneNormal: [0, 0, 1],
    viewUp: [0, -1, 0],
  });
  const linear = { interpolationType: InterpolationType.LINEAR };

  it('keeps fractions only when asked, and reuses spare arrays of the type of each sample', () => {
    const volume = createSampledVolume();
    const spy = jest.spyOn(sampleVolumeSliceModule, 'sampleVolumeSlice');
    const sampler = new PlanarSliceSampler({ keepFractions: true });
    const slices = [];

    for (let step = 0; step < 16; step++) {
      slices.push(sampler.sample(volume, axial(step * 0.5), linear));

      if (step === 1) {
        expect(slices[1].pixelData[0]).toBe(13.5);
      }
    }

    slices.forEach((slice, step) => {
      expect(slice.pixelData.constructor).toBe(
        step % 2 ? Float32Array : Int16Array
      );
    });
    const given = spy.mock.calls
      .map((call, index) => ({
        given: call[0].pixelData,
        returned: spy.mock.results[index].value.pixelData,
      }))
      .filter(({ given }) => given);

    expect(given.length).toBeGreaterThan(4);
    given.forEach(({ given, returned }) => {
      expect(returned).toBe(given);
    });
    expect(new Set(given.map(({ given }) => given.constructor)).size).toBe(2);

    const rounded = new PlanarSliceSampler().sample(volume, axial(0.5), linear);

    expect(rounded.pixelData).toBeInstanceOf(Int16Array);
    expect(rounded.pixelData[0]).toBe(14);
  });

  it('draws a slice whose array type changes from one slice to the next', () => {
    const volume = createSampledVolume();
    const sampler = new PlanarSliceSampler({ keepFractions: true });
    const draw = new PlanarSampledSliceActor();
    const scalarsOf = () =>
      draw.mapper.getInputData().getPointData().getScalars();

    [0, 0.5, 1, 1.5].forEach((z) => {
      const slice = sampler.sample(volume, axial(z), linear);

      draw.setSlice(slice);

      expect(scalarsOf().getData().constructor).toBe(
        slice.pixelData.constructor
      );
      expect(Array.from(scalarsOf().getData())).toEqual(
        Array.from(slice.pixelData)
      );
      expect(scalarsOf().getDataType()).toBe(slice.pixelData.constructor.name);
    });
  });

  it('gives an oblique slice the size limit of the sampler', () => {
    const tall = createVolume({ dimensions: [8, 6, 3000], spacing: [1, 1, 1] });
    const oblique = {
      focalPoint: [3.5, 2.5, 1500],
      viewPlaneNormal: [Math.cos(0.3), Math.sin(0.3), 0],
      viewUp: [0, 0, 1],
    };

    mockSampler();

    expect(new PlanarSliceSampler().sample(tall, oblique, linear).height).toBe(
      2048
    );
    expect(
      new PlanarSliceSampler({ maxSliceSize: 16384 }).sample(
        tall,
        oblique,
        linear
      ).height
    ).toBeGreaterThan(2048);
  });
});

describe('screen grid at rest on a device that cannot filter float textures', () => {
  const axialNormal = [0, 0, 1];
  const linear = { interpolationType: InterpolationType.LINEAR };
  const nearest = { interpolationType: InterpolationType.NEAREST };
  const slice = (pixelData, min, max) => ({ pixelData, min, max });
  const cannot = () => false;
  const can = () => true;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('knows which float slices vtk.js keeps out of a half float texture', () => {
    expect(
      drawsWithNearestFilter(slice(new Float32Array(1), -1000, 3000))
    ).toBe(true);
    expect(drawsWithNearestFilter(slice(new Float32Array(1), -3000, 10))).toBe(
      true
    );
    expect(
      drawsWithNearestFilter(slice(new Float32Array(1), -2048, 2048))
    ).toBe(false);
    expect(drawsWithNearestFilter(slice(new Int16Array(1), -1000, 3000))).toBe(
      false
    );
  });

  it('asks for the screen grid for a linear float slice beyond a half float only when float textures cannot be filtered', () => {
    const volume = createVolume();
    const wide = slice(new Float32Array(4), -1000, 3000);
    const narrow = slice(new Float32Array(4), 0, 47);

    expect(
      needsScreenGridSample(volume, axialNormal, linear, false, wide, cannot)
    ).toBe(true);
    expect(
      needsScreenGridSample(volume, axialNormal, linear, false, wide, can)
    ).toBe(false);
    expect(
      needsScreenGridSample(volume, axialNormal, linear, false, narrow, cannot)
    ).toBe(false);
    expect(
      needsScreenGridSample(volume, axialNormal, nearest, false, wide, cannot)
    ).toBe(false);
    expect(
      needsScreenGridSample(
        volume,
        axialNormal,
        linear,
        false,
        slice(new Int16Array(4), -1000, 3000),
        cannot
      )
    ).toBe(false);
    expect(needsScreenGridSample(volume, axialNormal, linear, false)).toBe(
      false
    );
  });

  it('asks for the screen grid for a linear maximum or minimum slab along an axis, and not for a NEAREST one', () => {
    const volume = createVolume();

    [
      BlendModes.MAXIMUM_INTENSITY_BLEND,
      BlendModes.MINIMUM_INTENSITY_BLEND,
    ].forEach((blendMode) => {
      const slab = { thickness: 10, blendMode };

      expect(
        needsScreenGridSample(volume, axialNormal, { ...linear, slab }, false)
      ).toBe(true);
      expect(
        needsScreenGridSample(volume, axialNormal, { ...nearest, slab }, false)
      ).toBe(false);
    });
  });

  it('samples an enlarged axis-aligned float slice once more on the screen grid at rest', () => {
    const volume = createVolume();
    const camera = {
      focalPoint: [3.5, 2.5, 8.3],
      viewPlaneNormal: axialNormal,
      viewUp: [0, -1, 0],
      parallelScale: 2,
    };
    const screen = getScreenSliceGeometry({
      camera,
      canvasWidth: 64,
      canvasHeight: 48,
    });

    jest
      .spyOn(sampleVolumeSliceModule, 'sampleVolumeSlice')
      .mockImplementation(({ geometry }) => ({
        pixelData: new Float32Array(geometry.width * geometry.height),
        min: -1000,
        max: 3000,
      }));

    const rest = (canFilterFloatTextures) => {
      const sampler = new PlanarSliceSampler({ canFilterFloatTextures });

      sampler.sample(volume, camera, linear, screen);

      return sampler.sampleFiner(volume, camera, linear, screen);
    };

    expect(rest(can)).toBeUndefined();

    const fine = rest(cannot);

    expect(fine).toBeDefined();
    expect(fine.width).toBe(64);
    expect(fine.height).toBe(48);
  });
});

describe('work at rest after a cancel', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules no prefetch when the finer slice cancels the work', () => {
    jest.useFakeTimers();

    const getNeighbours = jest.fn(() => [{}]);
    let cancel;
    const sampler = {
      sampleFiner: jest.fn(() => ({ id: 'fine' })),
      prefetch: jest.fn(() => true),
      hasPendingSteps: () => false,
    };

    cancel = scheduleSampledSliceRestWork({
      sampler,
      volume: { loadStatus: { loaded: true } },
      getCamera: () => undefined,
      getInputs: () => ({}),
      getScreen: () => undefined,
      getNeighbours,
      onFinerSlice: () => cancel(),
    });
    jest.advanceTimersByTime(10 * SAMPLED_SLICE_REST_DELAY_MS);

    expect(sampler.sampleFiner).toHaveBeenCalledTimes(1);
    expect(getNeighbours).not.toHaveBeenCalled();
    expect(sampler.prefetch).not.toHaveBeenCalled();
  });
});

describe('default VOI of a sampled slice', () => {
  afterEach(() => jest.restoreAllMocks());

  it('takes the default VOI of the volume path, else the voxel range', async () => {
    const volume = createVolume();
    const spy = jest
      .spyOn(setDefaultVolumeVOIModule, 'getDefaultVolumeVOIRange')
      .mockResolvedValue({ lower: 40, upper: 400 });

    expect(await getSampledSliceDefaultVOIRange(volume)).toEqual({
      lower: 40,
      upper: 400,
    });

    spy.mockResolvedValue(undefined);

    expect(await getSampledSliceDefaultVOIRange(volume)).toEqual({
      lower: -1000,
      upper: 2000,
    });
  });
});

describe('PlanarViewport with slice first (render path)', () => {
  const displaySetId = 'ct-display-set';
  const volumeId = 'ct-volume';
  const engineId = 'sampled-slice-engine';
  const sliceCount = 10;
  const imageIds = Array.from({ length: sliceCount }, (_, i) => `ct:${i}`);
  let viewport;
  let renderer;
  let provider;
  let volume;
  let sampleSpy;

  const binding = () => viewport.bindings.get(displaySetId);

  beforeEach(() => {
    const actors = [];
    const camera = vtkCamera.newInstance();

    renderer = {
      getActiveCamera: jest.fn(() => camera),
      addActor: jest.fn((actor) => actors.push(actor)),
      removeActor: jest.fn((actor) => actors.splice(actors.indexOf(actor), 1)),
      getActors: jest.fn(() => actors),
      resetCameraClippingRange: jest.fn(),
      computeVisiblePropBounds: () => [1, -1, 1, -1, 1, -1],
      getViewProps: () => actors,
    };
    renderingEngineCache.set({
      id: engineId,
      getRenderer: jest.fn(() => renderer),
      getViewports: jest.fn(() => (viewport ? [viewport] : [])),
      renderViewport: jest.fn(),
    });
    viewport = new PlanarViewport({
      id: 'sampled-slice-viewport',
      element: document.createElement('div'),
      renderingEngineId: engineId,
      canvas: document.createElement('canvas'),
      sWidth: 200,
      sHeight: 100,
      defaultOptions: {},
    });
    provider = (type, imageId) => {
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
        rows: 6,
        columns: 8,
        frameOfReferenceUID: 'sampled-slice-frame',
      };
    };
    metaData.addProvider(provider, 10000);
    displaySetRegistry.add(displaySetId, {
      imageIds,
      volumeId,
    });
    volume = createVolume({ imageIds });
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) => (id === volumeId ? volume : undefined));
    jest
      .spyOn(viewport.dataProvider, 'load')
      .mockImplementation(async (id, options) => ({
        id,
        type: 'image',
        imageIds,
        imageVolume: volume,
        renderMode: options.renderMode,
        volumeId,
      }));
    jest
      .spyOn(setDefaultVolumeVOIModule, 'getDefaultVolumeVOIRange')
      .mockResolvedValue({ lower: -100, upper: 300 });
    sampleSpy = mockSampler();
  });

  afterEach(() => {
    viewport.destroy();
    jest.useRealTimers();
    renderingEngineCache.delete(engineId);
    setSliceFirst(false);
    metaData.removeProvider(provider);
    displaySetRegistry.clear();
    jest.restoreAllMocks();
  });

  function createFakeVolumeSliceAttachment(renderMode) {
    return {
      rendering: {
        renderMode,
        imageVolume: volume,
        imageIds,
        currentImageIdIndex: 0,
        maxImageIdIndex: sliceCount - 1,
      },
      updateDataPresentation: jest.fn(),
      applyViewState: jest.fn(),
      getFrameOfReferenceUID: () => 'sampled-slice-frame',
      removeData: jest.fn(),
    };
  }

  async function mount(options = {}) {
    await viewport.setDisplaySets({
      displaySetId: displaySetId,
      options: {
        orientation: OrientationAxis.AXIAL,
        sliceFirst: true,
        ...options,
      },
    });
    await flush();
  }

  it('mounts the sampled slice path, samples the visible slice and adds no 3D texture', async () => {
    await mount();

    const rendering = binding().rendering;

    expect(rendering.renderMode).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
    expect(viewport.getCurrentMode()).toBe('volume');
    expect(rendering.mapper.getClassName()).toBe('vtkImageMapper');
    expect(rendering.fullGrid).toBe(volume.voxelGrid);
    expect(rendering.sampleDistanceLod).toBe(1);
    expect(rendering.actor.getVisibility()).toBe(true);
    expect(sampleSpy).toHaveBeenCalled();
    expect(renderer.getActors()).toEqual([rendering.actor]);
    expect(binding().getImageData().imageData).toBe(volume.imageData);
    expect(viewport.getDefaultImageData()).toBe(volume.imageData);

    const entry = binding().getActorEntry(binding().data);

    expect(entry.referencedId).toBe(volumeId);
    expect(entry.actorMapper.renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
  });

  it('does not sample for zoom, pan or VOI, and samples once for a scroll', async () => {
    await mount();
    sampleSpy.mockClear();

    viewport.setZoom(2);
    viewport.setPan([5, 3]);
    viewport.setDisplaySetPresentation(displaySetId, {
      voiRange: { lower: 0, upper: 80 },
    });

    expect(sampleSpy).not.toHaveBeenCalled();
    expect(
      binding()
        .rendering.actor.getProperty()
        .getRGBTransferFunction(0)
        .getRange()
    ).toEqual([0, 80]);

    const events = [];

    for (const type of [
      Events.NEW_IMAGE,
      'CORNERSTONE_STACK_NEW_IMAGE',
      'CORNERSTONE_VOLUME_NEW_IMAGE',
    ]) {
      viewport.element.addEventListener(type, () => events.push(type));
    }
    await viewport.scroll(1);
    await flush();

    expect(sampleSpy).toHaveBeenCalledTimes(1);
    expect(events).toEqual([Events.NEW_IMAGE]);
  });

  it('remounts only when a slab change moves the display set to another render mode', async () => {
    await mount();

    const remount = jest
      .spyOn(viewport, 'applyRenderingPipelineUpdate')
      .mockResolvedValue(undefined);

    viewport.setDisplaySetPresentation(displaySetId, {
      voiRange: { lower: 0, upper: 80 },
    });
    viewport.setDisplaySetPresentation(displaySetId, { slabThickness: 0.8 });

    expect(remount).not.toHaveBeenCalled();

    viewport.setDisplaySetPresentation(displaySetId, { slabThickness: 2 });

    expect(remount).toHaveBeenCalledTimes(1);
  });

  it('samples again when the volume changes, and when the time point changes', async () => {
    await mount();
    sampleSpy.mockClear();

    triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, { volumeId });
    triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, { volumeId });
    triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, {
      volumeId: 'other-volume',
    });
    await nextFrame();

    expect(sampleSpy).toHaveBeenCalledTimes(1);

    triggerEvent(eventTarget, Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED, {
      volumeId,
    });
    await nextFrame();

    expect(sampleSpy).toHaveBeenCalledTimes(2);
  });

  it('removes its actor and listeners with the display set', async () => {
    await mount();
    viewport.removeDisplaySet(displaySetId);
    sampleSpy.mockClear();

    triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, { volumeId });
    await nextFrame();

    expect(renderer.getActors()).toEqual([]);
    expect(sampleSpy).not.toHaveBeenCalled();
  });

  it('remounts a mounted volume in place when setSliceFirst turns slice first on', async () => {
    const realResolver = viewport.renderPathResolver;
    const gpuAttachment = createFakeVolumeSliceAttachment(
      ActorRenderMode.VTK_VOLUME_SLICE
    );

    viewport.renderPathResolver = {
      resolve: (type, data, options) =>
        options.renderMode === ActorRenderMode.VTK_VOLUME_SLICE
          ? { createRenderPath: () => ({ addData: async () => gpuAttachment }) }
          : realResolver.resolve(type, data, options),
    };
    await mount({ sliceFirst: undefined });

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );

    setSliceFirst(true);
    await flush();

    const rendering = binding().rendering;

    expect(rendering.renderMode).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
    expect(gpuAttachment.removeData).toHaveBeenCalledTimes(1);
    expect(rendering.actor.getVisibility()).toBe(true);
    expect(renderer.getActors()).toEqual([rendering.actor]);
  });

  it.each([
    ['a volume id', { volumeId }, OrientationAxis.AXIAL],
    ['image ids only', {}, OrientationAxis.SAGITTAL],
  ])(
    'mounts the sampled slice path for a volume that the data provider creates during the load (%s)',
    async (_name, registration, orientation) => {
      const volumes = new Map();

      displaySetRegistry.add(displaySetId, {
        imageIds,
        ...registration,
      });
      jest
        .spyOn(require('../src/utilities/isValidVolume'), 'isValidVolume')
        .mockReturnValue(true);
      cache.getVolume.mockImplementation((id) => volumes.get(id));
      viewport.dataProvider.load.mockImplementation(async (id, options) => {
        const createdId = `cornerstoneStreamingImageVolume:${options.volumeId}`;

        volumes.set(createdId, volume);

        return {
          id,
          type: 'image',
          imageIds,
          imageVolume: volume,
          renderMode: options.renderMode,
          volumeId: createdId,
        };
      });
      await mount({ orientation });

      expect(viewport.dataProvider.load).toHaveBeenCalledTimes(1);
      expect(viewport.dataProvider.load.mock.calls[0][1].renderMode).toBe(
        ActorRenderMode.VTK_VOLUME_SLICE
      );
      expect(binding().rendering.renderMode).toBe(
        ActorRenderMode.VTK_SAMPLED_SLICE
      );
      expect(binding().data.renderMode).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
      expect(sampleSpy).toHaveBeenCalled();
    }
  );

  it('keeps the image path of a stack with no volume id in the acquisition plane', async () => {
    const stackId = 'ct-stack-display-set';
    const realResolver = viewport.renderPathResolver;
    const decide = jest.spyOn(
      require('../src/RenderingEngine/Viewports/Planar/PlanarRenderPathDecisionService')
        .defaultPlanarRenderPathDecisionService,
      'select'
    );
    let renderMode;

    displaySetRegistry.add(stackId, {
      imageIds,
    });
    viewport.dataProvider.load.mockImplementation(async (id, options) => ({
      id,
      type: 'image',
      imageIds,
      renderMode: options.renderMode,
    }));
    viewport.renderPathResolver = {
      resolve: (type, data, options) => {
        renderMode = options.renderMode;

        return options.renderMode === ActorRenderMode.VTK_IMAGE
          ? {
              createRenderPath: () => ({
                addData: async () => ({
                  rendering: { renderMode: options.renderMode },
                  updateDataPresentation: jest.fn(),
                  applyViewState: jest.fn(),
                  getFrameOfReferenceUID: () => 'sampled-slice-frame',
                  removeData: jest.fn(),
                }),
              }),
            }
          : realResolver.resolve(type, data, options);
      },
    };
    await viewport.setDisplaySets({
      displaySetId: stackId,
      options: { orientation: OrientationAxis.ACQUISITION, sliceFirst: true },
    });
    await flush();

    expect(renderMode).toBe(ActorRenderMode.VTK_IMAGE);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('keeps the GPU volume decision when slice first is off', async () => {
    const remount = jest.spyOn(viewport, 'applyRenderingPipelineUpdate');

    viewport.renderPathResolver = {
      resolve: (_type, _data, options) => ({
        createRenderPath: () => ({
          addData: async () =>
            createFakeVolumeSliceAttachment(options.renderMode),
        }),
      }),
    };
    await mount({ sliceFirst: undefined });

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );

    viewport.setDisplaySetPresentation(displaySetId, { slabThickness: 1e6 });

    expect(remount).not.toHaveBeenCalled();
  });

  const obliqueOrientation = {
    viewPlaneNormal: [0, Math.sin(0.4), Math.cos(0.4)],
    viewUp: [0, Math.cos(0.4), -Math.sin(0.4)],
  };

  const useFakeTimers = () =>
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

  const sampledSpacing = (call) => call[0].geometry.spacing[0];

  const drawnSpacing = () =>
    binding().rendering.mapper.getInputData().getSpacing()[0];

  const isScreenGridCall = (call) =>
    call[0].geometry.width === viewport.canvas.width &&
    call[0].geometry.height === viewport.canvas.height;

  it('samples an oblique view coarse while it moves and once on the screen grid after the rest time', async () => {
    useFakeTimers();
    await mount({ orientation: obliqueOrientation });

    const fineCalls = () => sampleSpy.mock.calls.filter(isScreenGridCall);

    sampleSpy.mockClear();
    await viewport.scroll(1);
    await flush();

    expect(sampleSpy).toHaveBeenCalledTimes(1);
    expect(fineCalls()).toHaveLength(0);

    jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS - 1);

    expect(sampleSpy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);

    expect(fineCalls()).toHaveLength(1);
    expect(drawnSpacing()).toBeCloseTo(sampledSpacing(fineCalls()[0]));
    expect(binding().rendering.mapper.getInputData().getDimensions()).toEqual([
      viewport.canvas.width,
      viewport.canvas.height,
      1,
    ]);

    jest.advanceTimersByTime(10 * SAMPLED_SLICE_REST_DELAY_MS);

    expect(fineCalls()).toHaveLength(1);

    const statistics = binding().rendering.getSliceCacheStatistics();

    expect(statistics.refined).toBe(1);
    expect(statistics.lastSampleMs).toBeGreaterThanOrEqual(0);
    expect(statistics.lastFineSampleMs).toBeGreaterThanOrEqual(0);
  });

  it('never samples the slice of an axis-aligned view twice', async () => {
    useFakeTimers();
    await mount();

    const onScreenZ = sampleSpy.mock.calls[0][0].geometry.origin[2];

    jest.advanceTimersByTime(10 * SAMPLED_SLICE_REST_DELAY_MS);
    viewport.setZoom(3);
    jest.advanceTimersByTime(10 * SAMPLED_SLICE_REST_DELAY_MS);

    const onScreenSamples = sampleSpy.mock.calls.filter(
      (call) => call[0].geometry.origin[2] === onScreenZ
    );

    expect(onScreenSamples).toHaveLength(1);
    expect(binding().rendering.getSliceCacheStatistics().refined).toBe(0);
  });

  it('samples the screen grid once per rest after a zoom or a pan, and draws the coarse slice while the view moves', async () => {
    useFakeTimers();
    await mount({ orientation: obliqueOrientation });

    const coarseSpacing = sampledSpacing(sampleSpy.mock.calls[0]);

    jest.advanceTimersByTime(10 * SAMPLED_SLICE_REST_DELAY_MS);

    const firstFineSpacing = drawnSpacing();

    expect(firstFineSpacing).not.toBeCloseTo(coarseSpacing);

    sampleSpy.mockClear();
    viewport.setZoom(4);

    expect(sampleSpy).not.toHaveBeenCalled();
    expect(drawnSpacing()).toBeCloseTo(coarseSpacing);

    jest.advanceTimersByTime(10 * SAMPLED_SLICE_REST_DELAY_MS);

    expect(sampleSpy).toHaveBeenCalledTimes(1);
    expect(isScreenGridCall(sampleSpy.mock.calls[0])).toBe(true);
    expect(drawnSpacing()).toBeCloseTo(firstFineSpacing / 4);

    viewport.setPan([5, 3]);

    expect(sampleSpy).toHaveBeenCalledTimes(1);
    expect(drawnSpacing()).toBeCloseTo(coarseSpacing);

    jest.advanceTimersByTime(10 * SAMPLED_SLICE_REST_DELAY_MS);

    expect(sampleSpy).toHaveBeenCalledTimes(2);
    expect(drawnSpacing()).toBeCloseTo(firstFineSpacing / 4);

    viewport.setDisplaySetPresentation(displaySetId, {
      voiRange: { lower: 0, upper: 80 },
    });
    jest.advanceTimersByTime(10 * SAMPLED_SLICE_REST_DELAY_MS);

    expect(sampleSpy).toHaveBeenCalledTimes(2);
    expect(drawnSpacing()).toBeCloseTo(firstFineSpacing / 4);
    expect(binding().rendering.getSliceCacheStatistics()).toMatchObject({
      refined: 3,
      size: SAMPLED_SLICE_CACHE_SIZE + 1,
    });
  });

  it('does nothing when the load callback of the volume comes after the display set was removed', async () => {
    useFakeTimers();
    await mount();

    const onLoad = volume.load.mock.calls
      .map((call) => call[0])
      .find((callback) => typeof callback === 'function');

    expect(onLoad).toBeDefined();

    viewport.removeDisplaySet(displaySetId);
    sampleSpy.mockClear();
    onLoad();
    jest.advanceTimersByTime(10 * SAMPLED_SLICE_LOADING_UPDATE_MS);

    expect(sampleSpy).not.toHaveBeenCalled();
  });

  it('cancels the work at rest when the display set is removed', async () => {
    useFakeTimers();
    await mount({ orientation: obliqueOrientation });
    viewport.removeDisplaySet(displaySetId);
    sampleSpy.mockClear();
    jest.advanceTimersByTime(10 * SAMPLED_SLICE_REST_DELAY_MS);

    expect(sampleSpy).not.toHaveBeenCalled();
  });

  it('prefetches one neighbour per idle callback, and the next scroll finds its slice', async () => {
    const idleCallbacks = [];

    window.requestIdleCallback = jest.fn((callback) => {
      idleCallbacks.push(callback);

      return idleCallbacks.length;
    });
    window.cancelIdleCallback = jest.fn();

    try {
      useFakeTimers();
      await mount();

      const onScreenZ = sampleSpy.mock.calls[0][0].geometry.origin[2];

      sampleSpy.mockClear();
      jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS);

      expect(sampleSpy).not.toHaveBeenCalled();
      expect(window.requestIdleCallback).toHaveBeenCalledWith(
        expect.any(Function),
        { timeout: 500 }
      );

      idleCallbacks.shift()();

      expect(sampleSpy).toHaveBeenCalledTimes(1);
      expect(
        Math.abs(sampleSpy.mock.calls[0][0].geometry.origin[2] - onScreenZ)
      ).toBeCloseTo(2);

      while (idleCallbacks.length) {
        idleCallbacks.shift()();
      }

      const { prefetched } = binding().rendering.getSliceCacheStatistics();

      expect(prefetched).toBe(sampleSpy.mock.calls.length);
      expect(prefetched).toBeGreaterThanOrEqual(5);

      sampleSpy.mockClear();
      await viewport.scroll(1);
      await flush();
      await viewport.scroll(-2);
      await flush();

      expect(sampleSpy).not.toHaveBeenCalled();
      expect(binding().rendering.getSliceCacheStatistics().hits).toBe(2);

      jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS);
      viewport.setZoom(2);

      expect(window.cancelIdleCallback).toHaveBeenCalled();
    } finally {
      delete window.requestIdleCallback;
      delete window.cancelIdleCallback;
    }
  });

  it('keeps the source of the GPU volume path behind its overlay after a remount', async () => {
    const overlayId = 'pt-display-set';
    const ptVolume = createVolume({ volumeId: 'pt-volume', imageIds });
    const volumes = { [volumeId]: volume, 'pt-volume': ptVolume };
    const realResolver = viewport.renderPathResolver;
    const gpuPath = new VtkVolumeSlicePath();

    jest
      .spyOn(createVolumeSliceActorModule, 'default')
      .mockImplementation(async () => {
        const actor = vtkImageSlice.newInstance();

        actor.setMapper(vtkImageResliceMapper.newInstance());

        return { actor };
      });
    cache.getVolume.mockImplementation((id) => volumes[id]);
    viewport.dataProvider.load.mockImplementation(async (id, options) => ({
      id,
      type: 'image',
      imageIds,
      imageVolume: id === overlayId ? ptVolume : volume,
      renderMode: options.renderMode,
      volumeId: id === overlayId ? 'pt-volume' : volumeId,
    }));
    displaySetRegistry.add(overlayId, {
      imageIds,
      volumeId: 'pt-volume',
    });
    viewport.renderPathResolver = {
      resolve: (type, data, options) =>
        options.renderMode === ActorRenderMode.VTK_VOLUME_SLICE
          ? {
              createRenderPath: () =>
                new VtkVolumeSliceRenderPath(
                  () => [],
                  () => undefined
                ),
              selectContext: (rootContext) =>
                gpuPath.selectContext(rootContext),
            }
          : realResolver.resolve(type, data, options),
    };

    setSliceFirst(true);
    await viewport.setDisplaySets(
      {
        displaySetId: displaySetId,
        options: { orientation: OrientationAxis.AXIAL },
      },
      {
        displaySetId: overlayId,
        options: { orientation: OrientationAxis.AXIAL, sliceFirst: false },
      }
    );
    await flush();

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
    expect(viewport.bindings.get(overlayId).rendering.renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );

    setSliceFirst(false);
    await flush();

    const source = binding().rendering;
    const overlay = viewport.bindings.get(overlayId).rendering;

    expect(source.renderMode).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
    expect(source.overlayOrder).toBe(0);
    expect(overlay.overlayOrder).toBe(1);
    expect(Array.from(source.actor.getPosition())).toEqual([0, 0, 0]);
    expect(Math.abs(overlay.actor.getPosition()[2])).toBeCloseTo(1e-4, 8);
  });
});
