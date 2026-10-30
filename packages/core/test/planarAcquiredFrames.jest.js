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
import { setLossyDownsampling } from '../src/init';

// These tests need final downsampling, which is off by default.
beforeAll(() => setLossyDownsampling({ final: true }));
afterAll(() => setLossyDownsampling({ final: false }));

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
