import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import {
  BlendModes,
  Events,
  ImageQualityStatus,
  MetadataModules,
  OrientationAxis,
  VOILUTFunctionType,
  VoxelReductions,
} from '../src/enums';
import { ActorRenderMode } from '../src/types';
import * as metaData from '../src/metaData';
import cache from '../src/cache/cache';
import * as utilities from '../src/utilities';
import * as imageLoader from '../src/loaders/imageLoader';
import PlanarViewport from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewport';
import { PlanarRenderPathDecisionService } from '../src/RenderingEngine/GenericViewport/Planar/PlanarRenderPathDecisionService';
import {
  acquiredFrameIndexOfVolumePoint,
  withAcquiredFrames,
} from '../src/RenderingEngine/GenericViewport/Planar/planarAcquiredFrames';
import { getImageSliceOverlayOrder } from '../src/RenderingEngine/GenericViewport/Planar/VtkVolumeSliceRenderPath';
import { triggerPlanarVolumeNewImage } from '../src/RenderingEngine/GenericViewport/Planar/planarImageEvents';
import { resolvePlanarRenderPathProjection } from '../src/RenderingEngine/GenericViewport/Planar/planarRenderPathProjection';
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

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

// A volume whose texture the preset reduces. Only the fields that the
// decision and the frame lookup read are present.
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
    origin,
    dataType: 'Int16Array',
    voxelGrid: { dimensions, spacing, direction, origin },
    isDynamicVolume: () => false,
    imageData,
    metadata: { FrameOfReferenceUID: 'planar-test-frame' },
  };
}

describe('PlanarRenderPathDecisionService acquired frames (API)', () => {
  const imageIds = Array.from({ length: 2464 }, (_, i) => `ct:${i}`);
  const dataSet = { imageIds, volumeId: 'ct-volume' };
  let service;

  beforeEach(() => {
    // The example of the issue: 512 x 512 x 2464 under `medium` reduces the
    // texture by [1, 1, 2].
    setGpuSettingsPreset('medium');
    service = new PlanarRenderPathDecisionService();
    jest.spyOn(cache, 'getVolume').mockReturnValue(
      createVolume({
        volumeId: 'ct-volume',
        dimensions: [512, 512, 2464],
        spacing: [0.7, 0.7, 0.5],
        imageIds,
      })
    );
  });

  afterEach(() => {
    resetGpuSettingsPreset();
    jest.restoreAllMocks();
  });

  it('keeps the volume path for a reduced volume, and allows the frames', () => {
    const options = {
      orientation: OrientationAxis.ACQUISITION,
      preferAcquiredFrames: true,
    };

    expect(service.select(dataSet, options).renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
    expect(service.canDrawAcquiredFrames(dataSet, options)).toBe(true);
  });

  it('isAcquisitionPlaneNormal accepts both scan directions, and refuses a 5 degree tilt', () => {
    const volume = cache.getVolume('ct-volume');
    const angle = (5 * Math.PI) / 180;

    expect(utilities.isAcquisitionPlaneNormal(volume, [0, 0, 1])).toBe(true);
    expect(utilities.isAcquisitionPlaneNormal(volume, [0, 0, -1])).toBe(true);
    expect(
      utilities.isAcquisitionPlaneNormal(volume, [
        0,
        Math.sin(angle),
        Math.cos(angle),
      ])
    ).toBe(false);
  });

  it('does not allow the frames for a slab, a MIP, or no reduction', () => {
    for (const options of [
      { slabThickness: 5 },
      { blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND },
    ]) {
      expect(
        service.canDrawAcquiredFrames(dataSet, {
          preferAcquiredFrames: true,
          ...options,
        })
      ).toBe(false);
    }

    setGpuSettingsPreset('high-texture-4096');
    expect(
      service.canDrawAcquiredFrames(dataSet, { preferAcquiredFrames: true })
    ).toBe(false);
  });
});

describe('PlanarViewport acquired frames in the volume path (user experience)', () => {
  const dataId = 'ct-display-set';
  const segId = 'seg-display-set';
  const volumeId = 'ct-volume';
  const FOR = 'planar-test-frame';
  const sliceCount = 12;
  const imageIds = Array.from({ length: sliceCount }, (_, i) => `ct:${i}`);
  const spacing = [1, 1, 2];
  const volumeVOI = { lower: -100, upper: 300 };
  const fullGrid = {
    dimensions: [512, 512, sliceCount],
    spacing,
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    origin: [0, 0, 0],
  };
  let viewport;
  let renderer;
  let provider;
  let volume;
  let segVolume;
  let releaseFrames;
  const engineId = 'acquired-frames-engine';

  const sourceBinding = () => viewport.bindings.get(dataId);
  const volumeActor = () => sourceBinding().rendering.actor;
  const frameRendering = () => sourceBinding().getRenderings()[1];

  // The volume slice render path, without WebGL: one vtk actor, and the
  // camera that the real path resolves from the view state.
  function createVolumeAttachment(ctx, data) {
    const actor = vtkImageSlice.newInstance();
    const rendering = {
      renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
      actorEntryUID: `${data.id}-volume`,
      actor,
      imageVolume: data.imageVolume,
      imageIds: data.imageIds,
      currentImageIdIndex: 0,
      maxImageIdIndex: data.imageIds.length - 1,
      defaultVOIRange: volumeVOI,
      voxelQuality: {
        grid: { ...fullGrid, spacing: [2, 2, 2] },
        status: ImageQualityStatus.FULL_RESOLUTION,
        lowest: ImageQualityStatus.FULL_RESOLUTION,
        highest: ImageQualityStatus.FULL_RESOLUTION,
        missing: 0,
        voxels: 1,
        exact: true,
        source: 'clientDerived',
        reduction: VoxelReductions.BoxAverage,
        deliveries: 1,
      },
      fullGrid,
      sampleDistanceLod: 1,
      excludeFromFidelity: data.id === segId,
      isSegmentationOverlay: data.id === segId,
    };

    ctx.vtk.renderer.addActor(actor);

    return {
      rendering,
      updateDataPresentation: (props) => {
        rendering.dataPresentation = props;
        actor.setVisibility(props?.visible !== false);
      },
      applyViewState: (viewState) => {
        const projection = resolvePlanarRenderPathProjection({
          ctx,
          dataId: data.id,
          rendering,
          viewState,
        });

        if (
          projection &&
          projection.currentImageIdIndex !== rendering.currentImageIdIndex
        ) {
          rendering.currentImageIdIndex = projection.currentImageIdIndex;
          // As the volume slice path does on a change of slice.
          triggerPlanarVolumeNewImage(ctx, {
            camera: viewState,
            imageIds: rendering.imageIds,
            imageIdIndex: rendering.currentImageIdIndex,
            maxImageIdIndex: rendering.maxImageIdIndex,
          });
        }
      },
      getFrameOfReferenceUID: () => FOR,
      getActorEntry: () => ({
        uid: rendering.actorEntryUID,
        actor,
        referencedId: data.volumeId,
        actorMapper: { actor, renderMode: ActorRenderMode.VTK_VOLUME_SLICE },
      }),
      getImageData: () => volume.imageData,
      removeData: jest.fn(),
    };
  }

  function createImage(imageId) {
    return {
      imageId,
      rows: 4,
      columns: 4,
      rowPixelSpacing: 1,
      columnPixelSpacing: 1,
      windowCenter: 1000,
      windowWidth: 50,
      imageQualityStatus: ImageQualityStatus.FULL_RESOLUTION,
      voxelManager: { getScalarData: () => new Int16Array(16) },
      getPixelData: () => new Int16Array(16),
    };
  }

  async function mount(orientation = OrientationAxis.AXIAL) {
    await viewport.setDisplaySets({
      displaySetId: dataId,
      options: { orientation },
    });
    await flush();
  }

  beforeEach(() => {
    // `low` reduces a 512 x 512 frame by 2 in the plane of the frame.
    setGpuSettingsPreset('low');
    const actors = [];

    renderer = {
      getActiveCamera: jest.fn(() => ({ setParallelProjection: jest.fn() })),
      addActor: jest.fn((actor) => actors.push(actor)),
      removeActor: jest.fn((actor) => actors.splice(actors.indexOf(actor), 1)),
      getActors: jest.fn(() => actors),
      resetCameraClippingRange: jest.fn(),
    };
    renderingEngineCache.set({
      id: engineId,
      getRenderer: jest.fn(() => renderer),
      getViewports: jest.fn(() => (viewport ? [viewport] : [])),
      renderViewport: jest.fn(),
    });
    viewport = new PlanarViewport({
      id: 'acquired-frames-viewport',
      element: document.createElement('div'),
      renderingEngineId: engineId,
      canvas: document.createElement('canvas'),
      sWidth: 200,
      sHeight: 100,
      defaultOptions: {},
    });
    provider = (type, imageId) => {
      const i = imageIds.indexOf(imageId);

      if (i < 0) {
        return;
      }

      if (type === MetadataModules.IMAGE_PIXEL) {
        return {
          pixelRepresentation: 1,
          bitsAllocated: 16,
          bitsStored: 16,
          highBit: 15,
          photometricInterpretation: 'MONOCHROME2',
          samplesPerPixel: 1,
        };
      }

      if (type === MetadataModules.GENERAL_SERIES) {
        return { modality: 'CT' };
      }

      if (type !== MetadataModules.IMAGE_PLANE) {
        return;
      }

      return {
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        rowCosines: [1, 0, 0],
        columnCosines: [0, 1, 0],
        imagePositionPatient: [0, 0, i * spacing[2]],
        rowPixelSpacing: 1,
        columnPixelSpacing: 1,
        rows: 4,
        columns: 4,
        frameOfReferenceUID: FOR,
      };
    };
    metaData.addProvider(provider, 10000);
    genericViewportDisplaySetMetadataProvider.add(dataId, {
      kind: 'planar',
      imageIds,
      volumeId,
    });
    genericViewportDisplaySetMetadataProvider.add(segId, {
      kind: 'planar',
      imageIds,
      volumeId: 'seg-volume',
    });
    volume = createVolume({
      volumeId,
      dimensions: [512, 512, sliceCount],
      spacing,
      imageIds,
    });
    segVolume = createVolume({
      volumeId: 'seg-volume',
      dimensions: [512, 512, sliceCount],
      spacing,
      imageIds,
    });
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) =>
        id === volumeId ? volume : id === 'seg-volume' ? segVolume : undefined
      );
    jest
      .spyOn(viewport.dataProvider, 'load')
      .mockImplementation(async (id, options) => ({
        id,
        type: 'image',
        imageIds,
        imageVolume: id === segId ? segVolume : volume,
        renderMode: options.renderMode,
        volumeId: id === segId ? 'seg-volume' : volumeId,
      }));
    // The frames load when the test releases them.
    let release;
    let gate = new Promise((resolve) => (release = resolve));
    releaseFrames = async () => {
      release();
      gate = Promise.resolve();
      await flush();
    };
    jest
      .spyOn(imageLoader, 'loadAndCacheImage')
      .mockImplementation(async (imageId) => {
        await gate;
        return createImage(imageId);
      });
    jest
      .spyOn(
        require('../src/RenderingEngine/helpers/planarImageRendering'),
        'createVTKImageDataFromImage'
      )
      .mockImplementation(() => {
        const imageData = vtkImageData.newInstance();

        imageData.setDimensions([4, 4, 1]);
        imageData.getPointData().setScalars(
          vtkDataArray.newInstance({
            numberOfComponents: 1,
            values: new Int16Array(16),
          })
        );
        return imageData;
      });
    viewport.renderPathResolver = {
      resolve: () => ({
        createRenderPath: () => ({
          addData: async (ctx, data) =>
            data.id === segId
              ? createVolumeAttachment(ctx, data)
              : withAcquiredFrames(
                  ctx,
                  data,
                  createVolumeAttachment(ctx, data)
                ),
        }),
      }),
    };
  });

  afterEach(() => {
    viewport.destroy();
    renderingEngineCache.delete(engineId);
    metaData.removeProvider(provider);
    genericViewportDisplaySetMetadataProvider.clear();
    resetGpuSettingsPreset();
    jest.restoreAllMocks();
  });

  it('reports volume, shows the reduced slice until the frame loads, then the frame', async () => {
    await mount();

    expect(sourceBinding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
    expect(viewport.getCurrentMode()).toBe('volume');
    expect(volumeActor().getVisibility()).toBe(true);

    await releaseFrames();

    expect(frameRendering().actor.getVisibility()).toBe(true);
    expect(volumeActor().getVisibility()).toBe(false);
    expect(viewport.getCurrentMode()).toBe('volume');

    // A scroll sends one VOLUME_NEW_IMAGE (the OHIF scroll bar of a volume)
    // and one STACK_NEW_IMAGE, also while the frame shows.
    const events = [];
    for (const type of [Events.STACK_NEW_IMAGE, Events.VOLUME_NEW_IMAGE]) {
      viewport.element.addEventListener(type, () => events.push(type));
    }
    await viewport.scroll(1);
    await flush();

    expect(events.sort()).toEqual(
      [Events.STACK_NEW_IMAGE, Events.VOLUME_NEW_IMAGE].sort()
    );
    expect(frameRendering().actor.getVisibility()).toBe(true);
  });

  it('rotates axial, sagittal, axial with no remount, and keeps the camera and the index', async () => {
    await mount();
    await releaseFrames();
    viewport.setViewState({ anchorWorld: [100, 120, 10], scale: [2, 2] });
    const index = viewport.getCurrentImageIdIndex();
    const frameIndex = frameRendering().currentImageIdIndex;

    viewport.setOrientation(OrientationAxis.SAGITTAL);
    await flush();
    expect(volumeActor().getVisibility()).toBe(true);
    expect(frameRendering().actor.getVisibility()).toBe(false);
    expect(viewport.getCurrentMode()).toBe('volume');

    viewport.setOrientation(OrientationAxis.AXIAL);
    await flush();

    expect(viewport.dataProvider.load).toHaveBeenCalledTimes(1);
    expect(frameRendering().actor.getVisibility()).toBe(true);
    expect(volumeActor().getVisibility()).toBe(false);
    expect(viewport.getCurrentImageIdIndex()).toBe(index);
    expect(frameRendering().currentImageIdIndex).toBe(frameIndex);
    expect(viewport.getViewState().scale).toEqual([2, 2]);
    expect(viewport.getViewState().anchorWorld).toEqual([100, 120, 10]);
  });

  it('turns an axial viewport sagittal for a sagittal volume reference (CS-S6)', async () => {
    await mount();
    await releaseFrames();

    viewport.setViewReference({
      FrameOfReferenceUID: FOR,
      volumeId,
      cameraFocalPoint: [300, 255.5, 11],
      viewPlaneNormal: [1, 0, 0],
      viewUp: [0, 0, 1],
      sliceIndex: 300,
    });
    await flush();

    expect(viewport.getViewState().orientation.viewPlaneNormal).toEqual([
      1, 0, 0,
    ]);
    expect(volumeActor().getVisibility()).toBe(true);
    expect(frameRendering().actor.getVisibility()).toBe(false);
  });

  it('draws the frame with the volume VOI and its linear function', async () => {
    await mount();
    await releaseFrames();
    viewport.setDisplaySetPresentation(dataId, {
      voiLUTFunction: VOILUTFunctionType.SAMPLED_SIGMOID,
    });

    const transferFunction = frameRendering()
      .actor.getProperty()
      .getRGBTransferFunction(0);

    // The frame window (center 1000, width 50) does not apply, and a sigmoid
    // does not apply because the volume slice draws a linear VOI.
    expect(transferFunction.getRange()).toEqual([
      volumeVOI.lower,
      volumeVOI.upper,
    ]);
    const nodes = (tf) =>
      Array.from({ length: tf.getSize() }, (_, i) => {
        const node = [];
        tf.getNodeValue(i, node);
        return node;
      });
    expect(nodes(transferFunction)).toEqual(
      nodes(utilities.createLinearRGBTransferFunction(volumeVOI))
    );
  });

  it('moves the frame actor onto the focal plane between two frames (CS-S22)', async () => {
    await mount();
    await releaseFrames();
    // z = 11 is between the frames at z = 10 and z = 12; the frame is k = 6.
    viewport.setViewState({
      slice: { kind: 'volumePoint', sliceWorldPoint: [255.5, 255.5, 11] },
    });
    await flush();

    expect(frameRendering().actor.getVisibility()).toBe(true);
    expect(frameRendering().currentImageIdIndex).toBe(6);
    expect(frameRendering().actor.getPosition()[2]).toBeCloseTo(-1);
  });

  it('moves a stack to the image closest to a focal-point reference', () => {
    viewport.bindings.set(dataId, {
      applyViewState: jest.fn(),
      data: { id: dataId, type: 'image', imageIds },
      getImageData: jest.fn(),
      getFrameOfReferenceUID: () => FOR,
      removeData: jest.fn(),
      rendering: {
        renderMode: ActorRenderMode.VTK_IMAGE,
        currentImageIdIndex: 3,
      },
      role: 'source',
      updateDataPresentation: jest.fn(),
    });
    viewport.mountedData.promoteSourceDataId(dataId);
    const setImageIdIndex = jest.spyOn(viewport, 'setImageIdIndex');

    // The reference that crosshairs send through jumpToFocalPoint.
    viewport.setViewReference({ cameraFocalPoint: [100, 100, 16] });
    expect(setImageIdIndex).toHaveBeenLastCalledWith(8);
  });

  it('shows the frames with a volume labelmap, on one plane, and below the labelmap', async () => {
    await mount();
    await viewport.addDisplaySet(segId, { role: 'overlay' });
    await releaseFrames();

    expect(frameRendering().actor.getVisibility()).toBe(true);
    // The overlay counts only the volume slice of the source below it.
    const actors = viewport.getActors();
    expect(actors.map((entry) => entry.actorMapper.renderMode)).toEqual([
      ActorRenderMode.VTK_VOLUME_SLICE,
      ActorRenderMode.VTK_IMAGE,
      ActorRenderMode.VTK_VOLUME_SLICE,
    ]);
    // The frame entry gives no second measurement target.
    expect(actors[1].referencedId).toBeUndefined();
    expect(viewport.getDefaultActor().uid).toBe(`${dataId}-volume`);
    // Both source actors are below the labelmap in the depth order.
    expect(getImageSliceOverlayOrder(renderer, actors[2].actor)).toBe(1);
    const laterOverlay = vtkImageSlice.newInstance();
    renderer.addActor(laterOverlay);
    expect(getImageSliceOverlayOrder(renderer, laterOverlay)).toBe(2);

    // Slices are 2 mm apart. On a frame (z = 10) and between two frames
    // (z = 11, 13), the frame is the nearest voxel slice, as a labelmap with
    // nearest sampling on the volume grid reads it.
    for (const [z, frame] of [
      [10, 5],
      [11, 6],
      [13, 7],
    ]) {
      expect(
        acquiredFrameIndexOfVolumePoint(volume, imageIds, [100, 100, z])
      ).toBe(frame);
    }
  });
});
