import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import PlanarViewport from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewport';
import PlanarViewportLegacyAdapter from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewportLegacyAdapter';
import { PlanarSampledSliceCanvas } from '../src/RenderingEngine/GenericViewport/Planar/planarSampledSliceCanvas';
import {
  getDefaultImageInvert,
  getDefaultImageVOIRange,
} from '../src/RenderingEngine/helpers/planarImageRendering';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import getSliceRange from '../src/utilities/getSliceRange';
import snapFocalPointToSlice from '../src/utilities/snapFocalPointToSlice';

const {
  utilities,
  setUseCPURendering,
  Enums,
  imageLoader,
  metaData,
  init,
  cache,
  volumeLoader,
} = cornerstone3D;
const { Events, OrientationAxis } = Enums;

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
 * Makes a CPU stack viewport, the planar legacy adapter that a legacy `STACK`
 * type gives, and records the stack events it fires as `name:index`. The
 * adapter needs WebGL in a rendering engine, so it is made on a stand-in
 * engine, as the planar viewport tests make their viewports.
 */
function createStackViewport() {
  const element = setUpCore();
  const { renderingEngine, viewport } = createAdapter(element, 'stack');

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
async function recordStackEvents() {
  const { element, events, renderingEngine, viewport } = createStackViewport();
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
    const adapter = await recordStackEvents();
    renderingEngines.push(adapter.renderingEngine);

    expect(utilities.isGenericViewport(adapter.viewport)).toBe(true);
    expect(adapter.steps).toEqual({
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
  });

  it('gives the detail fields of the legacy events', async () => {
    const { element, renderingEngine, viewport } = createStackViewport();
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
async function readStackMembers(ids) {
  const { element, renderingEngine, viewport } = createStackViewport();

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

describe('planar legacy adapter and the finer CPU image at rest', () => {
  let renderingEngines = [];

  afterEach(() => {
    renderingEngines.forEach((renderingEngine) => renderingEngine.destroy());
    renderingEngines = [];
    setUseCPURendering(false);
  });

  it('draws the finer image at rest unless the legacy CPU switch is on', () => {
    const { renderingEngine, viewport } = createAdapter(
      document.createElement('div'),
      'finer-at-rest'
    );

    renderingEngines.push(renderingEngine);
    setUseCPURendering(false);

    expect(viewport.prefersFinerImageAtRest()).toBe(true);

    setUseCPURendering(true);

    expect(viewport.prefersFinerImageAtRest()).toBe(false);
  });
});

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
    const adapter = await readStackMembers(imageIds);
    renderingEngines.push(adapter.renderingEngine);

    expect(adapter.members).toEqual({
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
    expect(adapter.viewport.getIntensityFromWorld([1, 1, 1])).toBeUndefined();
    expect(adapter.viewport.getBounds()).toBeUndefined();
    expect(adapter.viewport.isOrientationChangeable()).toBe(false);
  });

  it('gives the image at a slice index from getCurrentImageId, as the legacy stack viewport', async () => {
    const { renderingEngine, viewport } = createStackViewport();
    renderingEngines.push(renderingEngine);
    await viewport.setStack(imageIds, 1);

    expect([
      viewport.getCurrentImageId(),
      viewport.getCurrentImageId(2),
      viewport.getCurrentImageId(0),
    ]).toEqual([imageIds[1], imageIds[2], imageIds[0]]);
  });

  it('takes a point within half a slice spacing of the image shown as viewable with asNearbyProjection, as the legacy stack viewport', async () => {
    const { renderingEngine, viewport } = createStackViewport();
    renderingEngines.push(renderingEngine);
    await viewport.setStack(imageIds, 1);

    const answers = [
      [3, 4, 1.0004],
      [3, 4, 0.9996],
      [3, 4, 1.002],
    ].map((cameraFocalPoint) =>
      viewport.isReferenceViewable(
        { cameraFocalPoint },
        { asNearbyProjection: true }
      )
    );

    expect(answers).toEqual([true, true, false]);
  });

  it('gives the PT scaling of the legacy stack viewport', async () => {
    const ptImageIds = createImageIds(true);
    const adapter = await readStackMembers(ptImageIds);
    renderingEngines.push(adapter.renderingEngine);

    expect(adapter.members.modality).toBe('PT');
    expect(adapter.members.scaling).toEqual({
      PT: { suvbwToSuvlbm: 1, suvbwToSuvbsa: 1 },
    });
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

    it('ignores a slice index in getCurrentImageId, as the legacy volume viewport', () => {
      const planarGetCurrentImageId = jest
        .spyOn(PlanarViewport.prototype, 'getCurrentImageId')
        .mockReturnValue('currentImageId');

      expect(viewport.getCurrentImageId(0)).toBe('currentImageId');
      expect(planarGetCurrentImageId).toHaveBeenCalledWith();

      planarGetCurrentImageId.mockRestore();
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

/**
 * Image ids of the fake image loader for 16 by 16 images with the given
 * photometric interpretations, one per millimetre along z. A MONOCHROME1
 * image is marked `invert` by the loader, as the DICOM image loader marks it.
 */
function createPhotometricImageIds(photometricInterpretations) {
  return photometricInterpretations.map(
    (photometricInterpretation, sliceIndex) =>
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
          photometricInterpretation,
        })
      )}`
  );
}

/**
 * The invert flag that a CPU stack viewport draws with: the presentation
 * that the CPU image path of a next planar viewport draws its slice with.
 * The adapter draws a CPU render in the next animation frame.
 */
async function readDrawnInvert(viewport, drawSpy) {
  drawSpy.mockClear();
  viewport.render();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const calls = drawSpy.mock.calls;

  return calls[calls.length - 1][0].presentation.invert;
}

/**
 * Shows an image of a stack and resolves when the viewport fired
 * STACK_NEW_IMAGE for it.
 */
async function showImage(element, viewport, imageIdIndex) {
  const newImage = waitForNewImage(element, imageIdIndex);
  viewport.setImageIdIndex(imageIdIndex);
  await newImage;
}

describe('planar legacy adapter and a MONOCHROME1 image', () => {
  let renderingEngines = [];
  let drawSpy;

  beforeEach(() => {
    drawSpy = jest.spyOn(PlanarSampledSliceCanvas.prototype, 'draw');
  });

  afterEach(() => {
    drawSpy.mockRestore();
    renderingEngines.forEach((renderingEngine) => renderingEngine.destroy());
    renderingEngines = [];
    cache.purgeCache();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    genericViewportDisplaySetMetadataProvider.clear();
    setUseCPURendering(false);
  });

  /**
   * Shows a MONOCHROME1 stack, a MONOCHROME2 stack and the MONOCHROME1 stack
   * again on a CPU stack viewport and gives the invert flag drawn for each.
   */
  async function readNewStackInverts() {
    const { renderingEngine, viewport } = createStackViewport();
    renderingEngines.push(renderingEngine);
    const inverts = [];

    await viewport.setStack(
      createPhotometricImageIds(['MONOCHROME1', 'MONOCHROME1']),
      0
    );
    inverts.push(await readDrawnInvert(viewport, drawSpy));
    await viewport.setStack(createPhotometricImageIds(['MONOCHROME2']), 0);
    inverts.push(await readDrawnInvert(viewport, drawSpy));
    await viewport.setStack(createPhotometricImageIds(['MONOCHROME1']), 0);
    inverts.push(await readDrawnInvert(viewport, drawSpy));

    return { inverts, viewport };
  }

  it('draws a new MONOCHROME1 stack inverted, as the legacy stack viewport', async () => {
    const adapter = await readNewStackInverts();

    expect(adapter.inverts).toEqual([true, false, true]);
    expect(adapter.viewport.getProperties().invert).toBe(true);
  });

  it('keeps an invert flag that the application set while it scrolls and drops it with a new stack', async () => {
    const { element, renderingEngine, viewport } = createStackViewport();
    renderingEngines.push(renderingEngine);
    const steps = [];

    await viewport.setStack(
      createPhotometricImageIds(['MONOCHROME1', 'MONOCHROME1']),
      0
    );
    viewport.setProperties({ invert: false });
    steps.push(await readDrawnInvert(viewport, drawSpy));
    await showImage(element, viewport, 1);
    steps.push(await readDrawnInvert(viewport, drawSpy));
    await viewport.setStack(createPhotometricImageIds(['MONOCHROME1']), 0);
    steps.push(await readDrawnInvert(viewport, drawSpy));

    expect(steps).toEqual([false, false, true]);
  });

  /**
   * The legacy stack viewport on the CPU reports `invert: false` for a
   * MONOCHROME1 image that it draws inverted and goes back to an image that
   * is not inverted with `resetProperties`. The adapter gives the semantics
   * of the legacy stack viewport on the GPU, its default, which the karma
   * test of `stackViewport_gpu_render_test` checks against it: the property
   * says what is drawn and a reset goes back to the image's own default.
   */
  it('reports the invert flag that it draws and resets to the default of the image', async () => {
    const { element, renderingEngine, viewport } = createStackViewport();
    renderingEngines.push(renderingEngine);

    await viewport.setStack(
      createPhotometricImageIds(['MONOCHROME1', 'MONOCHROME1']),
      0
    );

    expect(viewport.getProperties().invert).toBe(true);

    viewport.setProperties({ invert: false });

    expect(viewport.getProperties().invert).toBe(false);

    await showImage(element, viewport, 1);

    expect(viewport.getProperties().invert).toBe(false);

    viewport.resetProperties();

    expect(viewport.getProperties().invert).toBe(true);
    expect(await readDrawnInvert(viewport, drawSpy)).toBe(true);

    await viewport.setStack(createPhotometricImageIds(['MONOCHROME2']), 0);

    expect(viewport.getProperties().invert).toBe(false);
    expect(await readDrawnInvert(viewport, drawSpy)).toBe(false);
  });

  /**
   * A stack that mixes MONOCHROME1 and MONOCHROME2 images. The legacy stack
   * viewport keeps the flag of the first image on the CPU, and on the GPU
   * turns it on at the first MONOCHROME1 image and keeps it on, so a later
   * MONOCHROME2 image shows inverted. The next viewport draws each image with
   * its own default while the application has not set `invert`.
   */
  it('draws each image of a mixed stack with its own default', async () => {
    const { element, renderingEngine, viewport } = createStackViewport();
    renderingEngines.push(renderingEngine);
    const steps = [];

    await viewport.setStack(
      createPhotometricImageIds(['MONOCHROME2', 'MONOCHROME1', 'MONOCHROME2']),
      0
    );
    steps.push(await readDrawnInvert(viewport, drawSpy));

    for (const imageIdIndex of [1, 2]) {
      await showImage(element, viewport, imageIdIndex);
      steps.push([
        await readDrawnInvert(viewport, drawSpy),
        viewport.getProperties().invert,
      ]);
    }

    expect(steps).toEqual([false, [true, true], [false, false]]);
  });

  it('starts a display set of a direct planar viewport inverted and keeps what the application sets', async () => {
    setUpCore();
    const renderer = {
      getActiveCamera: () => ({ setParallelProjection() {} }),
    };
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
    renderingEngines.push(renderingEngine);
    viewport = new PlanarViewport({
      id: 'direct',
      element: document.getElementById('element'),
      renderingEngineId: renderingEngine.id,
      canvas: document.createElement('canvas'),
      sWidth: 64,
      sHeight: 64,
      defaultOptions: {},
    });
    genericViewportDisplaySetMetadataProvider.add('xray', {
      kind: 'planar',
      imageIds: createPhotometricImageIds(['MONOCHROME1']),
      initialImageIdIndex: 0,
    });

    await viewport.setDisplaySets({ displaySetId: 'xray' });

    expect(viewport.getDisplaySetPresentation('xray').invert).toBeUndefined();
    expect(viewport.getDefaultInvert('xray')).toBe(true);
    expect(await readDrawnInvert(viewport, drawSpy)).toBe(true);

    viewport.setDisplaySetPresentation('xray', { invert: false });

    expect(await readDrawnInvert(viewport, drawSpy)).toBe(false);

    viewport.resetDisplaySetPresentation('xray');

    expect(viewport.getDisplaySetPresentation('xray').invert).toBeUndefined();
    expect(await readDrawnInvert(viewport, drawSpy)).toBe(true);
  });
});

describe('getDefaultImageInvert', () => {
  afterEach(() => {
    metaData.removeAllProviders();
  });

  it('reads the photometric interpretation of the metadata before image.invert', () => {
    metaData.addProvider((type, imageId) => {
      if (type !== 'imagePixelModule') {
        return;
      }

      return { photometricInterpretation: imageId.split(':')[1] };
    });

    expect(getDefaultImageInvert({ imageId: 'pi:MONOCHROME1' })).toBe(true);
    expect(
      getDefaultImageInvert({ imageId: 'pi:MONOCHROME1', invert: false })
    ).toBe(true);
    expect(
      getDefaultImageInvert({ imageId: 'pi:MONOCHROME2', invert: true })
    ).toBe(false);
    expect(getDefaultImageInvert({ imageId: 'pi:', invert: true })).toBe(true);
    expect(getDefaultImageInvert({ imageId: 'pi:' })).toBe(false);
  });
});

describe('getDefaultImageVOIRange', () => {
  it('gives a grayscale image without a window the range of its pixel values, as the legacy stack viewport', () => {
    expect(
      getDefaultImageVOIRange({ minPixelValue: 100, maxPixelValue: 300 })
    ).toEqual({ lower: 100, upper: 300 });
    expect(
      getDefaultImageVOIRange({
        color: true,
        minPixelValue: 0,
        maxPixelValue: 255,
      })
    ).toBeUndefined();
  });
});

describe('planar legacy adapter VOI LUT function', () => {
  let renderingEngines = [];
  let drawSpy;

  beforeEach(() => {
    drawSpy = jest.spyOn(PlanarSampledSliceCanvas.prototype, 'draw');
  });

  afterEach(() => {
    drawSpy.mockRestore();
    renderingEngines.forEach((renderingEngine) => renderingEngine.destroy());
    renderingEngines = [];
    cache.purgeCache();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    setUseCPURendering(false);
  });

  /**
   * The legacy stack viewport reports the VOI LUT function of the image and
   * draws with the one that `setProperties` sets on the GPU; on the CPU it
   * throws for it.
   */
  it('reports the VOI LUT function of the image and draws the one that setProperties sets', async () => {
    const { renderingEngine, viewport } = createStackViewport();
    renderingEngines.push(renderingEngine);

    await viewport.setStack(imageIds, 0);

    expect(viewport.getProperties().VOILUTFunction).toBe(
      Enums.VOILUTFunctionType.LINEAR
    );

    viewport.setProperties({
      VOILUTFunction: Enums.VOILUTFunctionType.SAMPLED_SIGMOID,
    });
    drawSpy.mockClear();
    viewport.render();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const calls = drawSpy.mock.calls;

    expect(viewport.getProperties().VOILUTFunction).toBe(
      Enums.VOILUTFunctionType.SAMPLED_SIGMOID
    );
    expect(calls[calls.length - 1][0].presentation.voiLUTFunction).toBe(
      Enums.VOILUTFunctionType.SAMPLED_SIGMOID
    );
  });
});
