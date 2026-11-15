import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import { BlendModes, MetadataModules, OrientationAxis } from '../src/enums';
import { ActorRenderMode } from '../src/types';
import * as metaData from '../src/metaData';
import cache from '../src/cache/cache';
import ImageVolume from '../src/cache/classes/ImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import VoxelManager from '../src/utilities/VoxelManager';
import { setSliceFirst } from '../src/init';
import { getSlabSampleOffsets } from '../src/utilities/sampleVolumeSlice';
import {
  defaultVolumeStrategyProvider,
  selectFirstReadyStrategy,
} from '../src/RenderingEngine/helpers/volumeRenderStrategy';
import * as lifecycle from '../src/RenderingEngine/helpers/volumeStrategyLifecycle';
import {
  MAX_CPU_SLICE_SAMPLES,
  PlanarRenderPathDecisionService,
  canSampleSlabOnCpu,
} from '../src/RenderingEngine/GenericViewport/Planar/PlanarRenderPathDecisionService';
import { VtkVolumeSliceRenderPath } from '../src/RenderingEngine/GenericViewport/Planar/VtkVolumeSliceRenderPath';
import PlanarViewport from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

/**
 * A volume with the fields that the decision and the viewport read. The
 * voxels are not read.
 */
function createVolume({
  volumeId = 'ct-volume',
  dimensions = [8, 6, 10],
  spacing = [1, 1, 2],
  direction = [1, 0, 0, 0, 1, 0, 0, 0, 1],
  imageIds = Array.from({ length: dimensions[2] }, (_, i) => `ct:${i}`),
} = {}) {
  const origin = [0, 0, 0];
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
    metadata: { FrameOfReferenceUID: 'routing-frame' },
    loadStatus: { loaded: true, loading: false },
    load: jest.fn(),
    getVoxelQuality: jest.fn(() => undefined),
    voxelManager: {
      numberOfComponents: 1,
      getConstructor: () => Int16Array,
      getRange: () => [-1000, 2000],
    },
  };
}

describe('slab estimate of the slice first decision', () => {
  const dataSet = {
    imageIds: Array.from({ length: 135 }, (_, i) => `ct:${i}`),
    volumeId: 'ct-volume',
  };
  const ctSpacing = [0.98, 0.98, 3.27];
  const mip = {
    sliceFirst: true,
    slabThickness: 10,
    blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
  };
  let service;
  let volume;

  beforeEach(() => {
    service = new PlanarRenderPathDecisionService();
    volume = createVolume({ dimensions: [512, 512, 135], spacing: ctSpacing });
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) => (id === 'ct-volume' ? volume : undefined));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts the pixels of the view for a normal that follows a volume axis', () => {
    const ct = { dimensions: [512, 512, 135], spacing: ctSpacing };
    const count = getSlabSampleOffsets(ct, 10).length;

    expect(count * 512 * 135).toBeLessThanOrEqual(MAX_CPU_SLICE_SAMPLES);
    expect(count * 512 * 512).toBeGreaterThan(MAX_CPU_SLICE_SAMPLES);
    expect(canSampleSlabOnCpu(ct, 10)).toBe(false);
    expect(canSampleSlabOnCpu(volume, 10, [0, 1, 0])).toBe(true);
    expect(canSampleSlabOnCpu(volume, 10, [-1, 0, 0])).toBe(true);
    expect(canSampleSlabOnCpu(volume, 10, [0, 0, 1])).toBe(false);
    expect(
      canSampleSlabOnCpu(volume, 10, [0, Math.sin(0.3), Math.cos(0.3)])
    ).toBe(false);
    expect(canSampleSlabOnCpu(ct, 10, [0, 1, 0])).toBe(false);
  });

  it('samples a 10 mm MIP of a coronal or sagittal view of a CT on the CPU', () => {
    expect(
      service.select(dataSet, { ...mip, orientation: OrientationAxis.CORONAL })
        .renderMode
    ).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
    expect(
      service.select(dataSet, {
        ...mip,
        orientation: OrientationAxis.SAGITTAL,
      }).renderMode
    ).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
  });

  it('leaves the same slab of an axial, acquisition, oblique or unknown view to the GPU', () => {
    [
      OrientationAxis.AXIAL,
      OrientationAxis.ACQUISITION,
      {
        viewPlaneNormal: [0, -Math.cos(0.3), Math.sin(0.3)],
        viewUp: [0, Math.sin(0.3), Math.cos(0.3)],
      },
      undefined,
    ].forEach((orientation) => {
      expect(service.select(dataSet, { ...mip, orientation }).renderMode).toBe(
        ActorRenderMode.VTK_VOLUME_SLICE
      );
    });
  });

  it('resolves the orientation against the direction of the volume', () => {
    volume = createVolume({
      dimensions: [512, 512, 135],
      spacing: ctSpacing,
      direction: [0, 1, 0, 0, 0, 1, 1, 0, 0],
    });

    expect(
      service.select(dataSet, { ...mip, orientation: OrientationAxis.AXIAL })
        .renderMode
    ).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
    expect(
      service.select(dataSet, { ...mip, orientation: OrientationAxis.CORONAL })
        .renderMode
    ).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
    expect(
      service.select(dataSet, {
        ...mip,
        orientation: OrientationAxis.SAGITTAL,
      }).renderMode
    ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
    expect(
      service.select(dataSet, {
        ...mip,
        orientation: OrientationAxis.ACQUISITION,
      }).renderMode
    ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
  });
});

describe('PlanarViewport remount after presentation changes', () => {
  const dataId = 'ct-display-set';
  const volumeId = 'ct-volume';
  const engineId = 'routing-engine';
  const imageIds = Array.from({ length: 10 }, (_, i) => `ct:${i}`);
  let viewport;
  let provider;
  let volume;
  let pendingLoads;
  let deferLoads;

  const binding = () => viewport.bindings.get(dataId);

  beforeEach(() => {
    const camera = vtkCamera.newInstance();
    const renderer = {
      getActiveCamera: jest.fn(() => camera),
      addActor: jest.fn(),
      removeActor: jest.fn(),
      getActors: jest.fn(() => []),
      resetCameraClippingRange: jest.fn(),
    };

    renderingEngineCache.set({
      id: engineId,
      getRenderer: jest.fn(() => renderer),
      getViewports: jest.fn(() => (viewport ? [viewport] : [])),
      renderViewport: jest.fn(),
    });
    viewport = new PlanarViewport({
      id: 'routing-viewport',
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
        frameOfReferenceUID: 'routing-frame',
      };
    };
    metaData.addProvider(provider, 10000);
    genericViewportDisplaySetMetadataProvider.add(dataId, {
      kind: 'planar',
      imageIds,
      volumeId,
    });
    volume = createVolume({ imageIds });
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) => (id === volumeId ? volume : undefined));
    pendingLoads = [];
    deferLoads = false;
    jest
      .spyOn(viewport.dataProvider, 'load')
      .mockImplementation((id, options) => {
        const data = {
          id,
          type: 'image',
          imageIds,
          imageVolume: volume,
          renderMode: options.renderMode,
          volumeId,
        };

        if (!deferLoads) {
          return Promise.resolve(data);
        }

        return new Promise((resolve) => {
          pendingLoads.push(() => resolve(data));
        });
      });
    viewport.renderPathResolver = {
      resolve: (_type, _data, options) => ({
        createRenderPath: () => ({
          addData: async () => ({
            rendering: {
              renderMode: options.renderMode,
              imageVolume: volume,
              imageIds,
              currentImageIdIndex: 0,
              maxImageIdIndex: imageIds.length - 1,
            },
            updateDataPresentation: jest.fn(),
            applyViewState: jest.fn(),
            getFrameOfReferenceUID: () => 'routing-frame',
            removeData: jest.fn(),
          }),
        }),
      }),
    };
  });

  afterEach(() => {
    viewport.destroy();
    renderingEngineCache.delete(engineId);
    setSliceFirst(false);
    metaData.removeProvider(provider);
    genericViewportDisplaySetMetadataProvider.clear();
    jest.restoreAllMocks();
  });

  async function resolvePendingLoads() {
    while (pendingLoads.length) {
      pendingLoads.shift()();
      await flush();
    }
  }

  it('ends on the render mode of the final presentation when a slab comes and goes during a remount', async () => {
    await viewport.setDisplaySets({
      displaySetId: dataId,
      options: { orientation: OrientationAxis.AXIAL, sliceFirst: true },
    });
    await flush();

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );

    deferLoads = true;
    viewport.setDisplaySetPresentation(dataId, {
      blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
    });
    viewport.setDisplaySetPresentation(dataId, { slabThickness: 1e6 });

    expect(pendingLoads.length).toBe(1);

    viewport.setDisplaySetPresentation(dataId, { slabThickness: undefined });
    await resolvePendingLoads();

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
  });

  it('still remounts when the final presentation needs the other render mode', async () => {
    await viewport.setDisplaySets({
      displaySetId: dataId,
      options: { orientation: OrientationAxis.AXIAL, sliceFirst: true },
    });
    await flush();

    deferLoads = true;
    viewport.setDisplaySetPresentation(dataId, { slabThickness: 1e6 });
    viewport.setDisplaySetPresentation(dataId, {
      blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
    });
    await resolvePendingLoads();

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
  });
});

describe('GPU volume textures after a switch to slice first', () => {
  const volumeId = 'texture-volume';
  let volume;

  /** A real volume, so the strategies provision and claim real texture sets. */
  function makeVolume() {
    const dimensions = [16, 16, 4];

    return new ImageVolume({
      volumeId,
      metadata: { FrameOfReferenceUID: 'texture-frame' },
      dimensions,
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      imageIds: [],
      dataType: 'Float32Array',
      numberOfComponents: 1,
      voxelManager: VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData: new Float32Array(dimensions[0] * dimensions[1] * 4),
        numberOfComponents: 1,
      }),
    });
  }

  /**
   * The strategy state of one GPU volume rendering of the volume, as the
   * render path builds it when it mounts: provision, then select and claim.
   */
  function mountRendering(viewportId) {
    const rendering = {
      imageVolume: volume,
      viewportId,
      actor: {},
      mapper: { setScalarTexture: jest.fn(), modified: jest.fn() },
    };

    lifecycle.provisionStrategies(
      rendering,
      defaultVolumeStrategyProvider,
      'initial'
    );
    lifecycle.applyStrategy(rendering, {
      provideStrategies: defaultVolumeStrategyProvider,
      selectStrategy: selectFirstReadyStrategy,
    });

    return rendering;
  }

  function removeRendering(rendering) {
    new VtkVolumeSliceRenderPath().removeData(
      { vtk: { renderer: { removeActor: jest.fn() } } },
      rendering
    );
  }

  beforeEach(() => {
    volumeTextureStore.clear();
    volumeTextureStore.setBudget(0);
    volume = makeVolume();
  });

  afterEach(() => {
    setSliceFirst(false);
    volumeTextureStore.clear();
  });

  it('frees the sets of a volume when the last GPU volume rendering leaves while slice first is on', () => {
    const first = mountRendering('viewport-1');
    const second = mountRendering('viewport-2');
    const [set] = volume.textureSets;

    expect(volume.textureSets.length).toBe(1);
    expect(set.references).toBe(2);

    setSliceFirst(true);
    removeRendering(first);

    expect(volume.textureSets).toEqual([set]);
    expect(set.references).toBe(1);

    removeRendering(second);

    expect(volume.textureSets).toEqual([]);
    expect(ImageVolume.textureBytesUsed).toBe(0);
  });

  it('keeps the sets while slice first is off', () => {
    const first = mountRendering('viewport-1');
    const second = mountRendering('viewport-2');

    removeRendering(first);
    removeRendering(second);

    expect(volume.textureSets.length).toBe(1);
    expect(volume.textureSets[0].references).toBe(0);
  });

  it('keeps a set that another consumer still holds', () => {
    const rendering = mountRendering('viewport-1');
    const [set] = volume.textureSets;

    volume.claimTextureSet(set.name);
    setSliceFirst(true);
    removeRendering(rendering);

    expect(volume.textureSets).toEqual([set]);
    expect(set.references).toBe(1);
  });
});
