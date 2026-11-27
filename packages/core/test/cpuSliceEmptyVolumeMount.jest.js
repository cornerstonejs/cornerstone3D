import { describe, it, expect, afterEach, jest } from '@jest/globals';
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
import VoxelManager from '../src/utilities/VoxelManager';
import { setSliceFirst } from '../src/init';
import * as setDefaultVolumeVOIModule from '../src/RenderingEngine/helpers/setDefaultVolumeVOI';
import PlanarViewport from '../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import { displaySetRegistry } from '@cornerstonejs/metadata';

/**
 * OHIF M99 (lane FX25): the mount of a planar pane of a streaming volume on
 * the sampled slice path of the GPU backend, before any frame of the volume
 * has arrived, read, allocated and uploaded a slice of zeros. It now samples
 * nothing and its layer shows nothing, and the mount is otherwise the mount
 * of today: the same events in the same order (`NEW_IMAGE`,
 * `DISPLAY_SETS_CHANGED`, the camera), the same camera and the same viewport
 * status as the mount of the loaded volume. The first frame of its plane
 * that arrives is drawn at the next animation frame.
 */

const dimensions = [8, 6, 10];
const frameSize = dimensions[0] * dimensions[1];
const cachedImageIds = [];
const engines = [];
const providers = [];

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

const nextFrames = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );

afterEach(() => {
  engines.splice(0).forEach(({ viewport, id }) => {
    viewport.destroy();
    renderingEngineCache.delete(id);
  });
  providers.splice(0).forEach((provider) => metaData.removeProvider(provider));
  cachedImageIds.splice(0).forEach((imageId) => {
    if (cache.getImage(imageId)) {
      cache.removeImageLoadObject(imageId);
    }
  });
  setSliceFirst(false);
  displaySetRegistry.clear();
  jest.restoreAllMocks();
});

function putFrame(imageId, k) {
  const scalarData = new Float32Array(frameSize).map(
    (_, index) => 10 + ((index * 7 + k * 31) % 50)
  );

  cache.putImageSync(imageId, {
    imageId,
    width: dimensions[0],
    height: dimensions[1],
    voxelManager: VoxelManager.createImageVoxelManager({
      width: dimensions[0],
      height: dimensions[1],
      scalarData,
      numberOfComponents: 1,
    }),
    getPixelData: () => scalarData,
    minPixelValue: 10,
    maxPixelValue: 59,
    sizeInBytes: scalarData.byteLength,
  });
  cachedImageIds.push(imageId);
}

/**
 * A streaming volume of one cached image per frame, acquired axially, whose
 * frames in `arrived` are in the cache, with its record of deliveries.
 */
function createStreamingVolume(name, arrived) {
  const imageIds = Array.from(
    { length: dimensions[2] },
    (_, k) => `${name}:${k}`
  );
  const spacing = [1, 1, 2];
  const origin = [0, 0, 0];
  const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const imageData = vtkImageData.newInstance({ spacing, origin, direction });
  const delivered = new Set(arrived);

  imageData.setDimensions(dimensions);
  arrived.forEach((k) => putFrame(imageIds[k], k));

  const voxelManager = VoxelManager.createImageVolumeVoxelManager({
    dimensions,
    imageIds,
    numberOfComponents: 1,
    dataType: 'Float32Array',
  });
  const volume = {
    volumeId: `${name}-volume`,
    imageIds,
    dimensions,
    spacing,
    direction,
    origin,
    dataType: 'Float32Array',
    voxelGrid: { dimensions, spacing, direction, origin },
    isDynamicVolume: () => false,
    imageData,
    metadata: { FrameOfReferenceUID: 'empty-mount-frame' },
    loadStatus: {
      loaded: delivered.size === dimensions[2],
      loading: delivered.size < dimensions[2],
    },
    load: jest.fn(),
    getVoxelQuality: jest.fn((options) => {
      const [from, to] = options?.region?.[2] ?? [0, dimensions[2] - 1];
      let missing = 0;

      for (let k = from; k <= to; k++) {
        missing += delivered.has(k) ? 0 : frameSize;
      }

      return {
        status: missing
          ? ImageQualityStatus.FAR_REPLICATE
          : ImageQualityStatus.FULL_RESOLUTION,
        missing,
        grid: { dimensions, spacing, direction, origin },
      };
    }),
    voxelManager,
  };

  return {
    volume,
    deliver(k) {
      putFrame(imageIds[k], k);
      voxelManager.invalidateSlice(k);
      delivered.add(k);
      triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, {
        volumeId: volume.volumeId,
      });
    },
  };
}

/**
 * A planar viewport on an engine of its own that shows one streaming volume,
 * recording the events of its element in their order.
 */
function createViewport(name, volume) {
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
  const id = `${name}-engine`;
  let viewport;
  const engine = {
    id,
    getRenderer: jest.fn(() => renderer),
    getViewports: jest.fn(() => (viewport ? [viewport] : [])),
    renderViewport: jest.fn(),
  };

  renderingEngineCache.set(engine);
  viewport = new PlanarViewport({
    id: `${name}-viewport`,
    element: document.createElement('div'),
    renderingEngineId: id,
    canvas: document.createElement('canvas'),
    sWidth: 200,
    sHeight: 100,
    defaultOptions: {},
  });
  engines.push({ viewport, id });

  const events = [];

  Object.values(Events)
    .filter((type) => typeof type === 'string')
    .forEach((type) =>
      viewport.element.addEventListener(type, (evt) =>
        events.push(
          type === Events.NEW_IMAGE
            ? `${type}:${evt.detail.sliceIndex}:${evt.detail.imageIdIndex}`
            : type
        )
      )
    );

  const provider = (type, imageId) => {
    const i = volume.imageIds.indexOf(imageId);

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
      rows: dimensions[1],
      columns: dimensions[0],
      frameOfReferenceUID: 'empty-mount-frame',
    };
  };

  metaData.addProvider(provider, 10000);
  providers.push(provider);
  displaySetRegistry.add(name, {
    imageIds: volume.imageIds,
    volumeId: volume.volumeId,
  });
  jest
    .spyOn(viewport.dataProvider, 'load')
    .mockImplementation(async (displaySetId, options) => ({
      id: displaySetId,
      type: 'image',
      imageIds: volume.imageIds,
      imageVolume: volume,
      renderMode: options.renderMode,
      volumeId: volume.volumeId,
    }));

  return { viewport, engine, renderer, events };
}

function getRendering(viewport, displaySetId) {
  return viewport.bindings.get(displaySetId).rendering;
}

describe('The mount of a volume with no frame on the sampled slice path of the GPU backend', () => {
  function mockCache(volumes) {
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) =>
        volumes.find((volume) => volume.volumeId === id)
      );
    jest
      .spyOn(setDefaultVolumeVOIModule, 'getDefaultVolumeVOIRange')
      .mockResolvedValue({ lower: 0, upper: 60 });
  }

  async function mount(viewport, displaySetId, orientation) {
    await viewport.setDisplaySets({
      displaySetId,
      options: { orientation, mode: 'volume', sliceFirst: true },
    });
    await flush();
  }

  it.each([
    ['axial', OrientationAxis.AXIAL],
    ['sagittal', OrientationAxis.SAGITTAL],
    ['coronal', OrientationAxis.CORONAL],
  ])(
    'of a %s pane samples, allocates and uploads nothing, shows nothing of the layer, and fires the events of the mount of the loaded volume',
    async (_, orientation) => {
      const empty = createStreamingVolume(`empty-${orientation}`, []);
      const loaded = createStreamingVolume(
        `loaded-${orientation}`,
        Array.from({ length: dimensions[2] }, (__, k) => k)
      );

      mockCache([empty.volume, loaded.volume]);

      const emptyPane = createViewport(`empty-${orientation}`, empty.volume);
      const loadedPane = createViewport(`loaded-${orientation}`, loaded.volume);

      await mount(emptyPane.viewport, `empty-${orientation}`, orientation);
      await mount(loadedPane.viewport, `loaded-${orientation}`, orientation);
      emptyPane.viewport.render();
      loadedPane.viewport.render();

      const rendering = getRendering(
        emptyPane.viewport,
        `empty-${orientation}`
      );
      const statistics = rendering.getSliceCacheStatistics();
      const loadedRendering = getRendering(
        loadedPane.viewport,
        `loaded-${orientation}`
      );

      expect(statistics.emptySlices).toBeGreaterThan(0);
      expect(statistics.copiedBytes).toBe(0);
      expect(statistics.allocatedBytes).toBe(0);
      expect(statistics.frameSlices).toBe(0);
      expect(statistics.gatheredSlices).toBe(0);
      expect(statistics.generalSamples).toBe(0);
      expect(rendering.actor.getVisibility()).toBe(false);
      expect(loadedRendering.actor.getVisibility()).toBe(true);
      expect(emptyPane.events).toEqual(loadedPane.events);
      expect(emptyPane.events).toEqual(
        expect.arrayContaining([Events.DISPLAY_SETS_CHANGED])
      );
      expect(
        emptyPane.events.some((type) => type.startsWith(`${Events.NEW_IMAGE}:`))
      ).toBe(true);
      expect(emptyPane.viewport.viewportStatus).toBe(
        loadedPane.viewport.viewportStatus
      );

      const viewState = (pane) =>
        JSON.parse(
          JSON.stringify(pane.viewport.getViewState()).replaceAll(
            /(empty|loaded)-/g,
            ''
          )
        );

      expect(viewState(emptyPane)).toEqual(viewState(loadedPane));
      expect(emptyPane.viewport.getSliceIndex()).toBe(
        loadedPane.viewport.getSliceIndex()
      );
    }
  );

  it('draws a plane across the frames at the next animation frame after its first frame arrives, with that row alone', async () => {
    const empty = createStreamingVolume('first-row', []);

    mockCache([empty.volume]);

    const pane = createViewport('first-row', empty.volume);

    await mount(pane.viewport, 'first-row', OrientationAxis.SAGITTAL);

    const rendering = getRendering(pane.viewport, 'first-row');
    const render = jest.spyOn(pane.viewport, 'render');

    pane.engine.renderViewport.mockClear();
    empty.deliver(3);
    await nextFrames();

    const statistics = rendering.getSliceCacheStatistics();

    expect(rendering.actor.getVisibility()).toBe(true);
    expect(statistics.gatheredSlices).toBe(1);
    expect(statistics.copiedBytes).toBe(
      dimensions[1] * Float32Array.BYTES_PER_ELEMENT
    );
    expect(
      pane.engine.renderViewport.mock.calls.length + render.mock.calls.length
    ).toBeGreaterThan(0);
  });

  it('fits the clipping range of the camera to the first slice that the layer draws, as the mount of a loaded volume fits it', async () => {
    const empty = createStreamingVolume('clipping', []);

    mockCache([empty.volume]);

    const pane = createViewport('clipping', empty.volume);

    await mount(pane.viewport, 'clipping', OrientationAxis.CORONAL);

    const rendering = getRendering(pane.viewport, 'clipping');

    pane.renderer.resetCameraClippingRange.mockClear();
    empty.deliver(1);
    await nextFrames();
    empty.deliver(2);
    await nextFrames();

    const fits = pane.renderer.resetCameraClippingRange.mock.calls;

    expect(rendering.actor.getVisibility()).toBe(true);
    expect(fits).toHaveLength(1);
    expect(fits[0][0]).toEqual(rendering.actor.getBounds());
  });
});
