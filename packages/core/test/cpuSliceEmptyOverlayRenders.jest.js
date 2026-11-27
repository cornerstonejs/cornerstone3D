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
import { PLANAR_LOADING_UPDATE_MS } from '../src/RenderingEngine/Viewports/Planar/planarLoadingUpdates';
import PlanarViewport from '../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import { displaySetRegistry } from '@cornerstonejs/metadata';

/**
 * OHIF M94 (lane FX23): the PET over the CT of a fusion pane draws nothing
 * on a plane across its frames until each frame there holds data of its own
 * position. While the PET streamed, each delivery still updated that empty
 * layer and asked for a render of the pane, which drew the same picture
 * again: up to ten frames a second in each fusion pane across the frames. An
 * update that leaves an empty layer empty now asks for no render, on both
 * backends; the layer renders when it has something to draw.
 */

const engineId = 'empty-overlay-engine';
const dimensions = [8, 6, 10];
const ids = {
  ct: Array.from({ length: dimensions[2] }, (_, i) => `ct:${i}`),
  pt: Array.from({ length: dimensions[2] }, (_, i) => `pt:${i}`),
};

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

const waitForUpdate = () =>
  new Promise((resolve) =>
    setTimeout(
      () => requestAnimationFrame(() => resolve()),
      2 * PLANAR_LOADING_UPDATE_MS + 20
    )
  );

function createVolume(name, quality) {
  const spacing = [1, 1, 2];
  const origin = [0, 0, 0];
  const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const imageData = vtkImageData.newInstance({ spacing, origin, direction });

  imageData.setDimensions(dimensions);

  return {
    volumeId: `${name}-volume`,
    imageIds: ids[name],
    dimensions,
    spacing,
    direction,
    origin,
    dataType: 'Float32Array',
    voxelGrid: { dimensions, spacing, direction, origin },
    isDynamicVolume: () => false,
    imageData,
    metadata: { FrameOfReferenceUID: 'shared-frame' },
    loadStatus: { loaded: !quality, loading: !!quality },
    framesLoaded: 1,
    load: jest.fn(),
    getVoxelQuality: quality
      ? jest.fn((options) => {
          const [from, to] = options?.region?.[2] ?? [0, dimensions[2] - 1];
          const frames = quality.slice(from, to + 1);
          const missing = frames.filter((q) => !q).length;

          return {
            status: Math.min(...frames.map((q) => q || 0)),
            missing: missing * 48,
            grid: { dimensions, spacing, direction, origin },
          };
        })
      : undefined,
    voxelManager: {
      numberOfComponents: 1,
      getConstructor: () => Float32Array,
      getRange: () => [0, 10],
    },
  };
}

function drawFirstCpuFrame(viewport) {
  Object.defineProperty(viewport.element, 'clientWidth', { value: 200 });
  Object.defineProperty(viewport.element, 'clientHeight', { value: 100 });
  viewport.resize();
  viewport.render();
}

const backends = [
  ['the GPU backend', {}, () => undefined],
  ['the CPU backend', { renderBackend: 'cpu' }, drawFirstCpuFrame],
];

describe.each(backends)(
  'An overlay that streams over a plane across its frames, on %s',
  (_, backendOptions, drawFirstFrame) => {
    let viewport;
    let engine;
    let provider;
    let quality;

    beforeEach(() => {
      const actors = [];
      const camera = vtkCamera.newInstance();
      const renderer = {
        getActiveCamera: jest.fn(() => camera),
        addActor: jest.fn((actor) => actors.push(actor)),
        removeActor: jest.fn((actor) =>
          actors.splice(actors.indexOf(actor), 1)
        ),
        getActors: jest.fn(() => actors),
        resetCameraClippingRange: jest.fn(),
        computeVisiblePropBounds: () => [1, -1, 1, -1, 1, -1],
        getViewProps: () => actors,
      };

      engine = {
        id: engineId,
        getRenderer: jest.fn(() => renderer),
        getViewports: jest.fn(() => (viewport ? [viewport] : [])),
        renderViewport: jest.fn(),
      };
      renderingEngineCache.set(engine);
      viewport = new PlanarViewport({
        id: 'empty-overlay-viewport',
        element: document.createElement('div'),
        renderingEngineId: engineId,
        canvas: document.createElement('canvas'),
        sWidth: 200,
        sHeight: 100,
        defaultOptions: {},
      });
      provider = (type, imageId) => {
        const name = imageId.split(':')[0];
        const i = ids[name]?.indexOf(imageId) ?? -1;

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
          frameOfReferenceUID: 'shared-frame',
        };
      };
      metaData.addProvider(provider, 10000);
      quality = new Array(dimensions[2]).fill(ImageQualityStatus.FAR_REPLICATE);

      const volumes = {
        ct: createVolume('ct'),
        pt: createVolume('pt', quality),
      };

      displaySetRegistry.add('ct', {
        imageIds: ids.ct,
        volumeId: volumes.ct.volumeId,
      });
      displaySetRegistry.add('pt', {
        imageIds: ids.pt,
        volumeId: volumes.pt.volumeId,
      });
      jest
        .spyOn(cache, 'getVolume')
        .mockImplementation((id) =>
          Object.values(volumes).find((volume) => volume.volumeId === id)
        );
      jest
        .spyOn(viewport.dataProvider, 'load')
        .mockImplementation(async (id, options) => ({
          id,
          type: 'image',
          imageIds: ids[id],
          imageVolume: volumes[id],
          renderMode: options.renderMode,
          volumeId: volumes[id].volumeId,
        }));
      jest
        .spyOn(setDefaultVolumeVOIModule, 'getDefaultVolumeVOIRange')
        .mockResolvedValue({ lower: 0, upper: 10 });
      jest
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

    it('draws no frame for a delivery that leaves the overlay empty, and draws when it has its own data', async () => {
      await viewport.setDisplaySets(
        {
          displaySetId: 'ct',
          options: {
            orientation: OrientationAxis.SAGITTAL,
            mode: 'volume',
            sliceFirst: true,
            ...backendOptions,
          },
        },
        {
          displaySetId: 'pt',
          options: {
            mode: 'volume',
            role: 'overlay',
            sliceFirst: true,
            ...backendOptions,
          },
        }
      );
      await flush();
      drawFirstFrame(viewport);
      await waitForUpdate();
      await waitForUpdate();

      const render = jest.spyOn(viewport, 'render');

      engine.renderViewport.mockClear();
      quality[3] = ImageQualityStatus.ADJACENT_REPLICATE;
      triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, {
        volumeId: 'pt-volume',
      });
      await waitForUpdate();

      expect(engine.renderViewport).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();

      quality.fill(ImageQualityStatus.FULL_RESOLUTION);
      triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, {
        volumeId: 'pt-volume',
      });
      await waitForUpdate();

      expect(
        engine.renderViewport.mock.calls.length + render.mock.calls.length
      ).toBeGreaterThan(0);
    });
  }
);
