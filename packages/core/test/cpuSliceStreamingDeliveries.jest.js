import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import {
  Events,
  ImageQualityStatus,
  MetadataModules,
  OrientationAxis,
} from '../src/enums';
import * as metaData from '../src/metaData';
import cache from '../src/cache/cache';
import eventTarget from '../src/eventTarget';
import triggerEvent from '../src/utilities/triggerEvent';
import { setSliceFirst } from '../src/init';
import * as sampleVolumeSliceModule from '../src/utilities/sampleVolumeSlice';
import * as setDefaultVolumeVOIModule from '../src/RenderingEngine/helpers/setDefaultVolumeVOI';
import { CPU_SLICE_LOADING_UPDATE_MS } from '../src/RenderingEngine/Viewports/Planar/VtkCpuSliceRenderPath';
import PlanarViewport from '../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import { displaySetRegistry } from '@cornerstonejs/metadata';

/**
 * Row 290 of `v6-open-issues.md`: while a volume streams, the sampled slice
 * path sampled its slice again after each delivery, also a copy into a frame
 * that its plane does not read, which changes nothing on the screen. It now
 * samples again only when the record of a frame of its plane changes; an
 * axial plane reads one frame, so most deliveries of a load cost no sample.
 */

const displaySetId = 'streaming-display-set';
const volumeId = 'streaming-volume';
const engineId = 'streaming-deliveries-engine';
const dimensions = [8, 6, 10];
const imageIds = Array.from({ length: dimensions[2] }, (_, i) => `pt:${i}`);

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

const waitForUpdate = () =>
  new Promise((resolve) =>
    setTimeout(
      () => requestAnimationFrame(() => resolve()),
      CPU_SLICE_LOADING_UPDATE_MS + 20
    )
  );

/**
 * A volume that loads, whose record of deliveries gives, for a region of one
 * frame, the quality in `quality`.
 */
function createStreamingVolume(quality) {
  const spacing = [1, 1, 2];
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
    dataType: 'Float32Array',
    voxelGrid: { dimensions, spacing, direction, origin },
    isDynamicVolume: () => false,
    imageData,
    metadata: { FrameOfReferenceUID: 'streaming-frame' },
    loadStatus: { loaded: false, loading: true },
    load: jest.fn(),
    getVoxelQuality: jest.fn((options) => {
      const region = options?.region;

      if (!region || region[2][0] !== region[2][1]) {
        return { status: ImageQualityStatus.FAR_REPLICATE, missing: 0 };
      }

      const status = quality[region[2][0]];

      return { status, missing: status ? 0 : 48 };
    }),
    voxelManager: {
      numberOfComponents: 1,
      getConstructor: () => Float32Array,
      getRange: () => [0, 10],
    },
  };
}

describe('The sampled slice path of a streaming volume', () => {
  let viewport;
  let provider;
  let sampleSpy;
  let quality;

  beforeEach(() => {
    const actors = [];
    const camera = vtkCamera.newInstance();
    const renderer = {
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
      id: 'streaming-deliveries-viewport',
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
        frameOfReferenceUID: 'streaming-frame',
      };
    };
    metaData.addProvider(provider, 10000);
    displaySetRegistry.add(displaySetId, { imageIds, volumeId });
    quality = new Array(dimensions[2]).fill(ImageQualityStatus.FAR_REPLICATE);

    const volume = createStreamingVolume(quality);

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
      .mockResolvedValue({ lower: 0, upper: 10 });
    sampleSpy = jest
      .spyOn(sampleVolumeSliceModule, 'sampleVolumeSlice')
      .mockImplementation(({ geometry }) => ({
        pixelData: new Float32Array(geometry.width * geometry.height),
        min: 0,
        max: 1,
      }));
  });

  afterEach(() => {
    viewport.destroy();
    renderingEngineCache.delete(engineId);
    setSliceFirst(false);
    metaData.removeProvider(provider);
    displaySetRegistry.clear();
    jest.restoreAllMocks();
  });

  async function deliver(frame, status) {
    quality[frame] = status;
    triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, { volumeId });
    await waitForUpdate();
  }

  it('samples nothing for a delivery into a frame that its plane does not read, and samples for one into its frame', async () => {
    await viewport.setDisplaySets({
      displaySetId,
      options: {
        orientation: OrientationAxis.AXIAL,
        mode: 'volume',
        sliceFirst: true,
      },
    });
    await flush();
    await waitForUpdate();
    sampleSpy.mockClear();

    const planeFrame = viewport.getViewState().slice.sliceWorldPoint[2] / 2;
    const farFrames = [0, 9].filter(
      (frame) => Math.abs(frame - planeFrame) > 1
    );

    expect(Number.isInteger(planeFrame)).toBe(true);
    expect(farFrames.length).toBe(2);

    await deliver(farFrames[0], ImageQualityStatus.ADJACENT_REPLICATE);
    await deliver(farFrames[1], ImageQualityStatus.FULL_RESOLUTION);

    expect(sampleSpy).not.toHaveBeenCalled();

    await deliver(planeFrame, ImageQualityStatus.FULL_RESOLUTION);

    expect(sampleSpy).toHaveBeenCalled();
  });
});
