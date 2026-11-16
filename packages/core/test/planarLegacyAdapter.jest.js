import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import PlanarViewportLegacyAdapter from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewportLegacyAdapter';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import getSliceRange from '../src/utilities/getSliceRange';
import snapFocalPointToSlice from '../src/utilities/snapFocalPointToSlice';

const {
  utilities,
  setUseCPURendering,
  RenderingEngine,
  Enums,
  imageLoader,
  metaData,
  init,
  cache,
  volumeLoader,
} = cornerstone3D;
const { ViewportType, Events, OrientationAxis } = Enums;

const recordedEvents = [
  Events.PRE_STACK_NEW_IMAGE,
  Events.STACK_NEW_IMAGE,
  Events.VIEWPORT_NEW_IMAGE_SET,
  Events.STACK_VIEWPORT_SCROLL,
];

/**
 * Image ids of the fake image loader for a stack of four 16 by 16 images,
 * one per millimetre along z. `PT` makes them PT images with a scaling module.
 */
function createImageIds(PT = false) {
  return [0, 1, 2, 3].map(
    (sliceIndex) =>
      `fakeImageLoader:${encodeURIComponent(
        JSON.stringify({
          loader: 'fakeImageLoader',
          name: 'imageURI',
          rows: 16,
          columns: 16,
          barStart: 2,
          barWidth: 4,
          xSpacing: 1,
          ySpacing: 1,
          sliceIndex,
          PT,
        })
      )}`
  );
}

const imageIds = createImageIds();

function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

/**
 * Turns CPU rendering on, registers the fake image loader and gives a 64 by
 * 64 element for a viewport.
 */
function setUpCore() {
  setUseCPURendering(true);
  window.devicePixelRatio = 1;
  init({});
  imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
  metaData.addProvider(fakeMetaDataProvider, 10000);

  document.body.innerHTML = '<div id="element"></div>';

  const element = document.getElementById('element');
  setSize(element, 64, 64);

  return element;
}

/**
 * Makes a planar legacy adapter on a stand-in rendering engine. A real
 * rendering engine needs WebGL for a planar viewport, which jsdom lacks; the
 * CPU render paths draw without it.
 */
function createAdapter(element, viewportId, defaultOptions = {}) {
  const renderer = { getActiveCamera: () => ({ setParallelProjection() {} }) };
  let viewport;
  const renderingEngine = {
    id: utilities.uuidv4(),
    getRenderer: () => renderer,
    getViewports: () => (viewport ? [viewport] : []),
    renderViewport() {},
    destroy() {
      viewport.destroy();
      renderingEngineCache.delete(renderingEngine.id);
    },
  };

  renderingEngineCache.set(renderingEngine);
  viewport = new PlanarViewportLegacyAdapter({
    id: viewportId,
    element,
    renderingEngineId: renderingEngine.id,
    canvas: document.createElement('canvas'),
    sWidth: 64,
    sHeight: 64,
    defaultOptions,
  });

  return { renderingEngine, viewport };
}

/**
 * Makes a CPU stack viewport and records the stack events it fires as
 * `name:index`. The legacy stack viewport comes from a rendering engine. The
 * planar legacy adapter needs WebGL in a rendering engine, so it is made on a
 * stand-in engine, as the planar viewport tests make their viewports.
 */
function createStackViewport(useAdapter) {
  const element = setUpCore();
  let renderingEngine;
  let viewport;

  if (useAdapter) {
    ({ renderingEngine, viewport } = createAdapter(element, 'stack'));
  } else {
    renderingEngine = new RenderingEngine(utilities.uuidv4());
    renderingEngine.enableElement({
      viewportId: 'stack',
      type: ViewportType.STACK,
      element,
    });
    viewport = renderingEngine.getViewport('stack');
  }

  const events = [];

  recordedEvents.forEach((eventName) => {
    element.addEventListener(eventName, (evt) => {
      const index =
        evt.detail.imageIdIndex ??
        evt.detail.newImageIdIndex ??
        evt.detail.currentImageIdIndex;

      events.push(`${eventName}:${index}`);
    });
  });

  return { element, events, renderingEngine, viewport };
}

/**
 * Resolves when the viewport fires STACK_NEW_IMAGE for an image index.
 */
function waitForNewImage(element, imageIdIndex) {
  return new Promise((resolve) => {
    const listener = (evt) => {
      if (evt.detail.imageIdIndex === imageIdIndex) {
        element.removeEventListener(Events.STACK_NEW_IMAGE, listener);
        resolve();
      }
    };

    element.addEventListener(Events.STACK_NEW_IMAGE, listener);
  });
}

/**
 * Runs setStack, setImageIdIndex and a scroll on a stack viewport and gives
 * the events of each step.
 */
async function recordStackEvents(useGenericViewport) {
  const { element, events, renderingEngine, viewport } =
    createStackViewport(useGenericViewport);
  const steps = {};

  await viewport.setStack(imageIds, 1);
  steps.setStack = events.splice(0);

  const setIndexImage = waitForNewImage(element, 3);
  await viewport.setImageIdIndex(3);
  await setIndexImage;
  steps.setImageIdIndex = events.splice(0);

  await viewport.setImageIdIndex(3);
  steps.sameIndex = events.splice(0);

  const scrollImage = waitForNewImage(element, 2);
  viewport.scroll(-1, false);
  await scrollImage;
  steps.scroll = events.splice(0);

  viewport.scroll(5, false);
  steps.scrollPastEnd = events.splice(0);

  return { renderingEngine, steps, viewport };
}

describe('planar legacy adapter stack events', () => {
  let renderingEngines = [];

  afterEach(() => {
    renderingEngines.forEach((renderingEngine) => renderingEngine.destroy());
    renderingEngines = [];
    cache.purgeCache();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    setUseCPURendering(false);
  });

  it('fires the stack events in the order of the legacy stack viewport', async () => {
    const legacy = await recordStackEvents(false);
    renderingEngines.push(legacy.renderingEngine);
    const adapter = await recordStackEvents(true);
    renderingEngines.push(adapter.renderingEngine);

    expect(utilities.isGenericViewport(legacy.viewport)).toBe(false);
    expect(utilities.isGenericViewport(adapter.viewport)).toBe(true);
    expect(legacy.steps).toEqual({
      setStack: [
        `${Events.PRE_STACK_NEW_IMAGE}:1`,
        `${Events.STACK_NEW_IMAGE}:1`,
        `${Events.VIEWPORT_NEW_IMAGE_SET}:1`,
      ],
      setImageIdIndex: [
        `${Events.PRE_STACK_NEW_IMAGE}:3`,
        `${Events.STACK_NEW_IMAGE}:3`,
      ],
      sameIndex: [],
      scroll: [
        `${Events.PRE_STACK_NEW_IMAGE}:2`,
        `${Events.STACK_VIEWPORT_SCROLL}:2`,
        `${Events.STACK_NEW_IMAGE}:2`,
      ],
      scrollPastEnd: [
        `${Events.PRE_STACK_NEW_IMAGE}:3`,
        `${Events.STACK_VIEWPORT_SCROLL}:3`,
      ],
    });
    expect(adapter.steps).toEqual(legacy.steps);
  });

  it('gives the detail fields of the legacy events', async () => {
    const { element, renderingEngine, viewport } = createStackViewport(true);
    const details = {};
    renderingEngines.push(renderingEngine);

    recordedEvents.forEach((eventName) => {
      element.addEventListener(eventName, (evt) => {
        details[eventName] = evt.detail;
      });
    });

    await viewport.setStack(imageIds, 1);
    viewport.scroll(1, false);

    expect(details[Events.PRE_STACK_NEW_IMAGE]).toEqual({
      imageId: imageIds[2],
      imageIdIndex: 2,
      viewportId: 'stack',
      renderingEngineId: renderingEngine.id,
    });
    expect(details[Events.VIEWPORT_NEW_IMAGE_SET]).toEqual({
      imageIds,
      viewportId: 'stack',
      element,
      currentImageIdIndex: 1,
    });
    expect(details[Events.STACK_VIEWPORT_SCROLL]).toEqual({
      newImageIdIndex: 2,
      imageId: imageIds[2],
      direction: 1,
    });
  });
});

/**
 * Reads the legacy stack members of a stack viewport after setStack, a
 * change of image and a jump to a world point.
 */
async function readStackMembers(useAdapter, ids) {
  const { element, renderingEngine, viewport } =
    createStackViewport(useAdapter);

  await viewport.setStack(ids, 0);

  const indexImage = waitForNewImage(element, 2);
  viewport.setImageIdIndex(2);
  const targetBeforeLoad = viewport.getTargetImageIdIndex();
  await indexImage;

  const jumpImage = waitForNewImage(element, 1);
  const jumped = viewport.jumpToWorld([4, 4, 1.2]);
  const targetAfterJump = viewport.getTargetImageIdIndex();
  await jumpImage;

  let sliceViewInfoError;

  try {
    viewport.getSliceViewInfo();
  } catch (error) {
    sliceViewInfoError = error.message;
  }

  return {
    renderingEngine,
    viewport,
    members: {
      modality: viewport.modality,
      scaling: viewport.scaling,
      isDisabled: viewport.isDisabled,
      useCPURendering: viewport.useCPURendering,
      targetBeforeLoad,
      jumped,
      targetAfterJump,
      currentAfterJump: viewport.getCurrentImageIdIndex(),
      sliceIndexForImageId: viewport.getSliceIndexForImage(ids[3]),
      sliceIndexForURI: viewport.getSliceIndexForImage(
        utilities.imageIdToURI(ids[3])
      ),
      sliceIndexForReference: viewport.getSliceIndexForImage({
        referencedImageId: ids[2],
      }),
      sliceIndexForUnknown: viewport.getSliceIndexForImage('unknown'),
      isInAcquisitionPlane: viewport.isInAcquisitionPlane(),
      sliceViewInfoError,
    },
  };
}

/**
 * A local volume with the identity direction whose voxel values are their
 * flat index.
 */
function createVolume(volumeId, dimensions, spacing) {
  const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];

  return volumeLoader.createLocalVolume(volumeId, {
    dimensions,
    spacing,
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    metadata: { Modality: 'CT', FrameOfReferenceUID: 'volume-frame' },
    scalarData: new Float32Array(voxelCount).map((_, index) => index),
  });
}

/**
 * The vtk.js volume actor that a legacy volume viewport makes for a volume.
 */
function createLegacyVolumeActor(volume) {
  const mapper = vtkVolumeMapper.newInstance();
  const actor = vtkVolume.newInstance();

  mapper.setInputData(volume.imageData);
  actor.setMapper(mapper);

  return actor;
}

/**
 * The focal point after a scroll of a legacy volume viewport, as the legacy
 * `scrollVolume` moves it with the slice range of the volume actor.
 */
function getLegacyScrollFocalPoint(camera, volume, spacing, delta) {
  const sliceRange = getSliceRange(
    createLegacyVolumeActor(volume),
    camera.viewPlaneNormal,
    camera.focalPoint
  );

  return snapFocalPointToSlice(
    camera.focalPoint,
    camera.position,
    sliceRange,
    camera.viewPlaneNormal,
    spacing,
    delta
  ).newFocalPoint;
}

/**
 * The slice index of a legacy volume viewport, as
 * `getImageSliceDataForVolumeViewport` computes it from the volume actor.
 */
function getLegacySliceIndex(camera, volume, spacing) {
  const { min, max, current } = getSliceRange(
    createLegacyVolumeActor(volume),
    camera.viewPlaneNormal,
    camera.focalPoint
  );
  const numberOfSlices = Math.round((max - min) / spacing) + 1;
  const imageIndex = Math.floor(
    ((current - min) / (max - min)) * numberOfSlices
  );

  return Math.min(Math.max(imageIndex, 0), numberOfSlices - 1);
}

/**
 * The position of a point along a view plane normal.
 */
function project(point, normal) {
  return point[0] * normal[0] + point[1] * normal[1] + point[2] * normal[2];
}

describe('planar legacy adapter members', () => {
  let renderingEngines = [];

  afterEach(() => {
    renderingEngines.forEach((renderingEngine) => renderingEngine.destroy());
    renderingEngines = [];
    cache.purgeCache();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    setUseCPURendering(false);
  });

  it('gives the stack members of the legacy stack viewport', async () => {
    const legacy = await readStackMembers(false, imageIds);
    renderingEngines.push(legacy.renderingEngine);
    const adapter = await readStackMembers(true, imageIds);
    renderingEngines.push(adapter.renderingEngine);

    expect(legacy.members).toEqual({
      modality: 'MR',
      scaling: {},
      isDisabled: false,
      useCPURendering: true,
      targetBeforeLoad: 2,
      jumped: true,
      targetAfterJump: 1,
      currentAfterJump: 1,
      sliceIndexForImageId: 3,
      sliceIndexForURI: 3,
      sliceIndexForReference: 2,
      sliceIndexForUnknown: undefined,
      isInAcquisitionPlane: true,
      sliceViewInfoError: 'Method not implemented.',
    });
    expect(adapter.members).toEqual(legacy.members);
    expect(adapter.viewport.getIntensityFromWorld([1, 1, 1])).toBeUndefined();
    expect(adapter.viewport.getBounds()).toBeUndefined();
    expect(adapter.viewport.isOrientationChangeable()).toBe(false);
  });

  it('gives the PT scaling of the legacy stack viewport', async () => {
    const ptImageIds = createImageIds(true);
    const legacy = await readStackMembers(false, ptImageIds);
    renderingEngines.push(legacy.renderingEngine);
    const adapter = await readStackMembers(true, ptImageIds);
    renderingEngines.push(adapter.renderingEngine);

    expect(legacy.members.modality).toBe('PT');
    expect(legacy.members.scaling).toEqual({
      PT: { suvbwToSuvlbm: 1, suvbwToSuvbsa: 1 },
    });
    expect(adapter.members.modality).toBe(legacy.members.modality);
    expect(adapter.members.scaling).toEqual(legacy.members.scaling);
  });

  describe('in volume mode', () => {
    let viewport;
    let volume;

    beforeEach(async () => {
      const element = setUpCore();
      let renderingEngine;

      ({ renderingEngine, viewport } = createAdapter(element, 'volume', {
        orientation: OrientationAxis.AXIAL,
      }));
      renderingEngines.push(renderingEngine);
      volume = createVolume('volume-a', [8, 8, 10], [1, 1, 1]);
      await viewport.setVolumes([{ volumeId: 'volume-a' }]);
    });

    it('gives the slice view info of the legacy volume viewport', () => {
      const camera = viewport.getCamera();
      const sliceViewInfo = viewport.getSliceViewInfo();
      const focalIndex = utilities.transformWorldToIndex(
        volume.imageData,
        camera.focalPoint
      );

      expect(viewport.getCurrentMode()).toBe('volume');
      expect(sliceViewInfo.sliceIndex).toBe(
        getLegacySliceIndex(camera, volume, 1)
      );
      expect(sliceViewInfo.slicePlane).toBe(2);
      expect(sliceViewInfo.width).toBe(8);
      expect(sliceViewInfo.height).toBe(8);
      expect(sliceViewInfo.sliceToIndexMatrix[14]).toBe(focalIndex[2]);
      expect(
        utilities.getCurrentVolumeViewportSlice(viewport).scalarData.length
      ).toBe(64);

      viewport.setOrientation(OrientationAxis.SAGITTAL);

      const sagittalInfo = viewport.getSliceViewInfo();

      expect(sagittalInfo.slicePlane).toBe(0);
      expect(sagittalInfo.width * sagittalInfo.height).toBe(80);
    });

    it('jumps to the slice of a world point as the legacy volume viewport', () => {
      const { focalPoint } = viewport.getCamera();

      expect(viewport.jumpToWorld([3, 3, 7])).toBe(true);
      expect(viewport.getCamera().focalPoint).toEqual([
        focalPoint[0],
        focalPoint[1],
        7,
      ]);

      viewport.jumpToWorld([3, 3, 100]);

      const camera = viewport.getCamera();
      const legacyCamera = {
        ...camera,
        focalPoint: [3, 3, volume.imageData.getBounds()[5]],
      };

      expect(viewport.getSliceIndex()).toBe(
        getLegacySliceIndex(legacyCamera, volume, 1)
      );
      expect(camera.focalPoint[2]).toBe(9);
    });

    it('reads intensities, bounds and the acquisition plane as the legacy volume viewport', () => {
      const legacyIndex = utilities.transformWorldToIndex(
        volume.imageData,
        [1.2, 2, 3]
      );

      expect(viewport.getIntensityFromWorld([1.2, 2, 3])).toBe(
        volume.voxelManager.getAtIJKPoint(legacyIndex)
      );
      expect(viewport.getBounds()).toEqual(
        createLegacyVolumeActor(volume).getBounds()
      );
      expect(viewport.isInAcquisitionPlane()).toBe(true);
      expect(viewport.useCPURendering).toBe(true);

      viewport.setOrientation(OrientationAxis.SAGITTAL);

      expect(viewport.isInAcquisitionPlane()).toBe(false);
    });

    it('scrolls with the step of the volume of volumeId as the legacy scrollVolume', async () => {
      const coarseVolume = createVolume('volume-b', [8, 8, 4], [1, 1, 3]);

      await viewport.setVolumes([
        { volumeId: 'volume-a' },
        { volumeId: 'volume-b' },
      ]);

      expect(viewport.getVolumeId()).toBe('volume-a');

      const camera = viewport.getCamera();
      const expected = getLegacyScrollFocalPoint(camera, coarseVolume, 3, 1);

      await viewport.scroll(1, true, false, { volumeId: 'volume-b' });

      expect(
        project(viewport.getCamera().focalPoint, camera.viewPlaneNormal)
      ).toBeCloseTo(project(expected, camera.viewPlaneNormal), 6);
      expect(
        project(viewport.getCamera().focalPoint, camera.viewPlaneNormal) -
          project(camera.focalPoint, camera.viewPlaneNormal)
      ).not.toBeCloseTo(1, 6);
    });

    it('scrolls by the slab thickness with scrollSlabs as the legacy scrollVolume', async () => {
      viewport.setProperties({ slabThickness: 4 });

      const camera = viewport.getCamera();
      const expected = getLegacyScrollFocalPoint(camera, volume, 4, -1);

      await viewport.scroll(-1, true, false, {
        volumeId: 'volume-a',
        scrollSlabs: true,
      });

      expect(
        project(viewport.getCamera().focalPoint, camera.viewPlaneNormal)
      ).toBeCloseTo(project(expected, camera.viewPlaneNormal), 6);
    });

    it('removes a volume by its volume id as the legacy volume viewport', async () => {
      createVolume('volume-b', [8, 8, 4], [1, 1, 3]);
      await viewport.setVolumes([
        { volumeId: 'volume-a' },
        { volumeId: 'volume-b' },
      ]);

      expect(viewport.hasVolumeId('volume-a')).toBe(true);
      expect(viewport.hasVolumeId('volume-b')).toBe(true);

      viewport.removeVolumeActors(['volume-b'], true);

      expect(viewport.hasVolumeId('volume-b')).toBe(false);
      expect(viewport.hasVolumeId('volume-a')).toBe(true);
    });

    it('scrolls by one slice of the shown volume without options', async () => {
      const camera = viewport.getCamera();
      const expected = getLegacyScrollFocalPoint(camera, volume, 1, 2);

      await viewport.scroll(2);

      expect(
        project(viewport.getCamera().focalPoint, camera.viewPlaneNormal)
      ).toBeCloseTo(project(expected, camera.viewPlaneNormal), 6);
    });
  });
});
