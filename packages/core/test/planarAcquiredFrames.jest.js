import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { BlendModes, MetadataModules, OrientationAxis } from '../src/enums';
import { ActorRenderMode } from '../src/types';
import * as metaData from '../src/metaData';
import cache from '../src/cache/cache';
import PlanarViewport from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewport';
import { PlanarRenderPathDecisionService } from '../src/RenderingEngine/GenericViewport/Planar/PlanarRenderPathDecisionService';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';
import {
  resetGpuSettingsPreset,
  setGpuSettingsPreset,
} from '../src/utilities/gpuSettingsPresets';
import * as renderingCapabilities from '../src/utilities/renderingCapabilities';
import { setLossyDownsampling } from '../src/init';

// These tests need final downsampling, which is off by default, and a GPU
// renderer, because the GPU settings apply to a GPU renderer only. The spy is
// set for each test, because the tests restore all mocks after each test.
beforeAll(() => setLossyDownsampling({ final: true }));
afterAll(() => setLossyDownsampling({ final: false }));
beforeEach(() => {
  jest
    .spyOn(renderingCapabilities, 'getRendererClass')
    .mockReturnValue('desktop');
});

// A volume whose texture the preset reduces. Only the fields that the
// decision and the slice conversion read are present.
function createVolume({ volumeId, dimensions, spacing, imageIds }) {
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
    dataType: 'Int16Array',
    voxelGrid: { dimensions, spacing, direction, origin },
    isDynamicVolume: () => false,
    imageData,
  };
}

describe('PlanarRenderPathDecisionService acquired frames (API)', () => {
  const imageIds = Array.from({ length: 2464 }, (_, i) => `ct:${i}`);
  const dataSet = { imageIds, volumeId: 'ct-volume' };
  let service;
  let getVolumeSpy;

  beforeEach(() => {
    // The example of the issue: 512 x 512 x 2464 under `medium` reduces the
    // texture by [1, 1, 2].
    setGpuSettingsPreset('medium');
    service = new PlanarRenderPathDecisionService();
    getVolumeSpy = jest.spyOn(cache, 'getVolume').mockReturnValue(
      createVolume({
        volumeId: 'ct-volume',
        dimensions: [512, 512, 2464],
        spacing: [0.7, 0.7, 0.5],
        imageIds,
      })
    );
  });

  afterEach(() => {
    getVolumeSpy.mockRestore();
    resetGpuSettingsPreset();
  });

  it('selects the image path for a reduced volume in the acquisition plane', () => {
    const selected = service.select(dataSet, {
      orientation: OrientationAxis.ACQUISITION,
      preferAcquiredFrames: true,
    });

    expect(selected.renderMode).toBe(ActorRenderMode.VTK_IMAGE);
    expect(selected.drawsAcquiredFrames).toBe(true);
    expect(selected.volumeId).toBe('ct-volume');
  });

  it('keeps the volume path off the acquisition plane, for a slab or MIP, and without a reduction', () => {
    const volumePathCases = [
      { orientation: OrientationAxis.SAGITTAL },
      { slabThickness: 5 },
      { blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND },
    ];

    for (const options of volumePathCases) {
      expect(
        service.select(dataSet, {
          orientation: OrientationAxis.ACQUISITION,
          preferAcquiredFrames: true,
          ...options,
        }).renderMode
      ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
    }

    setGpuSettingsPreset('high-texture-4096');
    expect(
      service.select(dataSet, { preferAcquiredFrames: true }).renderMode
    ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
  });
});

describe('PlanarViewport acquired frames (user experience)', () => {
  const dataId = 'ct-display-set';
  const volumeId = 'ct-volume';
  const sliceCount = 12;
  const imageIds = Array.from({ length: sliceCount }, (_, i) => `ct:${i}`);
  const spacing = [1, 1, 2];
  let viewport;
  let renderingEngineId;
  let metadataProvider;
  let getVolumeSpy;
  let volume;

  const flush = async () => {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  };

  function mountBinding(renderMode, currentImageIdIndex) {
    viewport.bindings.set(dataId, {
      applyViewState: jest.fn(),
      data: { id: dataId, type: 'image', imageIds, volumeId },
      getImageData: jest.fn(() => volume.imageData),
      getFrameOfReferenceUID: () => 'planar-test-frame',
      removeData: jest.fn(),
      rendering: { renderMode, currentImageIdIndex, imageVolume: volume },
      role: 'source',
      updateDataPresentation: jest.fn(),
    });
    viewport.mountedData.promoteSourceDataId(dataId);
  }

  beforeEach(() => {
    // `low` reduces a 512 x 512 frame by 2 in the plane of the frame.
    setGpuSettingsPreset('low');
    renderingEngineId = 'acquired-frames-engine';
    const element = document.createElement('div');
    const renderer = {
      getActiveCamera: jest.fn(() => ({ setParallelProjection: jest.fn() })),
    };

    renderingEngineCache.set({
      id: renderingEngineId,
      getRenderer: jest.fn(() => renderer),
      getViewports: jest.fn(() => (viewport ? [viewport] : [])),
      renderViewport: jest.fn(),
    });
    viewport = new PlanarViewport({
      id: 'acquired-frames-viewport',
      element,
      renderingEngineId,
      canvas: document.createElement('canvas'),
      sWidth: 200,
      sHeight: 100,
      defaultOptions: {},
    });

    metadataProvider = (type, imageId) => {
      const index = imageIds.indexOf(imageId);

      if (index < 0 || type !== MetadataModules.IMAGE_PLANE) {
        return;
      }

      return {
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        rowCosines: [1, 0, 0],
        columnCosines: [0, 1, 0],
        imagePositionPatient: [0, 0, index * spacing[2]],
      };
    };
    metaData.addProvider(metadataProvider, 10000);
    genericViewportDisplaySetMetadataProvider.add(dataId, {
      kind: 'planar',
      imageIds,
      volumeId,
    });

    volume = createVolume({
      volumeId,
      dimensions: [512, 512, sliceCount],
      spacing,
      imageIds,
    });

    getVolumeSpy = jest
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
      .spyOn(viewport, 'addLoadedData')
      .mockImplementation(async (id, data, options) => {
        mountBinding(options.renderMode, undefined);
        return true;
      });
  });

  afterEach(() => {
    viewport.destroy();
    renderingEngineCache.delete(renderingEngineId);
    metaData.removeProvider(metadataProvider);
    genericViewportDisplaySetMetadataProvider.clear();
    getVolumeSpy.mockRestore();
    resetGpuSettingsPreset();
    jest.restoreAllMocks();
  });

  it('keeps the image index and the camera through axial, sagittal, and back', async () => {
    mountBinding(ActorRenderMode.VTK_IMAGE, 7);
    viewport.setViewState({
      orientation: OrientationAxis.ACQUISITION,
      slice: { kind: 'stackIndex', imageIdIndex: 7 },
      anchorWorld: [100, 120, 14],
      scale: [2, 2],
    });

    viewport.setOrientation(OrientationAxis.SAGITTAL);
    await flush();

    expect(viewport.bindings.get(dataId).rendering.renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
    expect(viewport.getViewState().slice).toEqual({
      kind: 'volumePoint',
      sliceWorldPoint: [255.5, 255.5, 14],
    });

    viewport.setOrientation(OrientationAxis.ACQUISITION);
    await flush();

    const viewState = viewport.getViewState();

    expect(viewport.bindings.get(dataId).rendering.renderMode).toBe(
      ActorRenderMode.VTK_IMAGE
    );
    expect(viewState.slice).toEqual({ kind: 'stackIndex', imageIdIndex: 7 });
    expect(viewState.anchorWorld).toEqual([100, 120, 14]);
    expect(viewState.scale).toEqual([2, 2]);
  });

  it('a focal-point reference without volumeId moves a frame-path viewport to the closest frame', () => {
    mountBinding(ActorRenderMode.VTK_IMAGE, 3);
    viewport.setViewState({
      orientation: OrientationAxis.ACQUISITION,
      slice: { kind: 'stackIndex', imageIdIndex: 3 },
    });
    const setImageIdIndex = jest.spyOn(viewport, 'setImageIdIndex');

    // The reference that crosshairs send through jumpToFocalPoint.
    viewport.setViewReference({ cameraFocalPoint: [100, 100, 16] });
    expect(setImageIdIndex).toHaveBeenLastCalledWith(8);

    // A plain stack binding, with no volume.
    viewport.bindings.get(dataId).data.volumeId = undefined;
    viewport.setViewReference({ cameraFocalPoint: [100, 100, 6] });
    expect(setImageIdIndex).toHaveBeenLastCalledWith(3);
  });
});

describe('PlanarViewport render path decision (API)', () => {
  const spacing = [1, 1, 2];
  const sliceCount = 12;
  // Both series are above the 256 edge of `low`, so both reduce.
  const series = {
    A: { dataId: 'ds-A', volumeId: 'vol-A', size: 512 },
    B: { dataId: 'ds-B', volumeId: 'vol-B', size: 300 },
    seg: { dataId: 'seg', volumeId: 'seg-volume', size: 512 },
  };
  let viewport;
  let renderingEngineId;
  let metadataProvider;
  let volumes;
  let addLoadedDataGate;

  const imageIdsOf = (key) =>
    Array.from({ length: sliceCount }, (_, i) => `${key}:${i}`);
  const entryOf = (dataId) =>
    Object.values(series).find((entry) => entry.dataId === dataId);
  const sourceMode = (key = 'A') =>
    viewport.bindings.get(series[key].dataId).rendering.renderMode;
  const flush = async () => {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  };

  function mountBinding(id, role, renderMode) {
    const volume = volumes[entryOf(id).volumeId];

    viewport.bindings.set(id, {
      applyViewState: jest.fn(),
      data: { id, type: 'image', imageIds: volume.imageIds },
      getImageData: jest.fn(() => volume.imageData),
      getFrameOfReferenceUID: () => 'planar-test-frame',
      removeData: jest.fn(),
      rendering: { renderMode, imageVolume: volume },
      role,
      updateDataPresentation: jest.fn(),
    });

    if (role === 'source') {
      viewport.mountedData.promoteSourceDataId(id);
    }
  }

  function startAxial() {
    mountBinding(series.A.dataId, 'source', ActorRenderMode.VTK_IMAGE);
    viewport.setViewState({
      orientation: OrientationAxis.ACQUISITION,
      slice: { kind: 'stackIndex', imageIdIndex: 7 },
    });
  }

  // Rotates twice while the first remount waits in addLoadedData.
  async function rotateTwiceDuringRemount(first, second) {
    let release;

    addLoadedDataGate = new Promise((resolve) => (release = resolve));
    viewport.setOrientation(first);
    await flush();
    viewport.setOrientation(second);
    await flush();
    addLoadedDataGate = undefined;
    release();
    await flush();
  }

  beforeEach(() => {
    setGpuSettingsPreset('low');
    renderingEngineId = 'render-path-decision-engine';
    const renderer = {
      getActiveCamera: jest.fn(() => ({ setParallelProjection: jest.fn() })),
    };

    renderingEngineCache.set({
      id: renderingEngineId,
      getRenderer: jest.fn(() => renderer),
      getViewports: jest.fn(() => (viewport ? [viewport] : [])),
      renderViewport: jest.fn(),
    });
    viewport = new PlanarViewport({
      id: 'render-path-decision-viewport',
      element: document.createElement('div'),
      renderingEngineId,
      canvas: document.createElement('canvas'),
      sWidth: 200,
      sHeight: 100,
      defaultOptions: {},
    });
    metadataProvider = (type, imageId) => {
      const [key, i] = String(imageId).split(':');

      if (!series[key] || type !== MetadataModules.IMAGE_PLANE) {
        return;
      }

      return {
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        imagePositionPatient: [0, 0, Number(i) * spacing[2]],
      };
    };
    metaData.addProvider(metadataProvider, 10000);
    volumes = {};

    for (const [key, { dataId, volumeId, size }] of Object.entries(series)) {
      const imageIds = imageIdsOf(key);

      genericViewportDisplaySetMetadataProvider.add(dataId, {
        kind: 'planar',
        imageIds,
        volumeId,
      });
      volumes[volumeId] = createVolume({
        volumeId,
        dimensions: [size, size, sliceCount],
        spacing,
        imageIds,
      });
    }

    jest.spyOn(cache, 'getVolume').mockImplementation((id) => volumes[id]);
    jest
      .spyOn(viewport.dataProvider, 'load')
      .mockImplementation(async (id, options) => {
        const imageVolume = volumes[entryOf(id).volumeId];

        return {
          id,
          type: 'image',
          imageIds: imageVolume.imageIds,
          imageVolume,
          renderMode: options.renderMode,
          volumeId: imageVolume.volumeId,
        };
      });
    addLoadedDataGate = undefined;
    jest
      .spyOn(viewport, 'addLoadedData')
      .mockImplementation(async (id, data, options, shouldIgnore) => {
        await addLoadedDataGate;

        if (shouldIgnore?.()) {
          return false;
        }

        mountBinding(id, options.role, options.renderMode);
        return true;
      });
  });

  afterEach(() => {
    viewport.destroy();
    renderingEngineCache.delete(renderingEngineId);
    metaData.removeProvider(metadataProvider);
    genericViewportDisplaySetMetadataProvider.clear();
    resetGpuSettingsPreset();
    jest.restoreAllMocks();
  });

  it('returns the source to the image path when the last volume overlay goes', async () => {
    startAxial();
    await viewport.addDisplaySet('seg', { role: 'overlay' });
    await flush();
    expect(sourceMode()).toBe(ActorRenderMode.VTK_VOLUME_SLICE);

    viewport.removeData('seg');
    await flush();

    expect(sourceMode()).toBe(ActorRenderMode.VTK_IMAGE);
  });

  it('ends a fast rotate on the path of the last orientation', async () => {
    startAxial();
    await rotateTwiceDuringRemount(
      OrientationAxis.SAGITTAL,
      OrientationAxis.ACQUISITION
    );
    expect(sourceMode()).toBe(ActorRenderMode.VTK_IMAGE);

    viewport.setOrientation(OrientationAxis.SAGITTAL);
    await flush();
    await rotateTwiceDuringRemount(
      OrientationAxis.ACQUISITION,
      OrientationAxis.SAGITTAL
    );
    expect(sourceMode()).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
  });

  it('does not use the in-plane point of the previous volume', async () => {
    startAxial();
    viewport.setOrientation(OrientationAxis.SAGITTAL);
    await flush();
    // Column x = 400 is outside the 300-wide series B.
    const { slice } = viewport.getViewState();
    viewport.setViewState({
      slice: {
        ...slice,
        sliceWorldPoint: [400, ...slice.sliceWorldPoint.slice(1)],
      },
    });
    viewport.setOrientation(OrientationAxis.ACQUISITION);
    await flush();

    await viewport.setDisplaySets({ displaySetId: series.B.dataId });
    await flush();
    expect(sourceMode('B')).toBe(ActorRenderMode.VTK_IMAGE);

    viewport.setOrientation(OrientationAxis.SAGITTAL);
    await flush();

    expect(viewport.getViewState().slice.sliceWorldPoint[0]).toBeLessThan(300);
  });
});
