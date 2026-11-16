import * as cornerstone3D from '../src/index';
import * as csTools3d from '../../tools/src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { clipAndCacheSurfacesForViewport } from '../../polymorphic-segmentation/src/utilities/clipAndCacheSurfacesForViewport';

const { Enums, volumeLoader, utilities, getConfiguration, cache, metaData } =
  cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

const OBLIQUE = {
  viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
  viewUp: [0, -1, 0],
};

/**
 * Makes a legacy viewport of `legacyType` with the id `legacy` and a direct
 * next planar viewport with the id `next`, of one size and orientation, in
 * one rendering engine. The switch of the generic viewports is off for the
 * legacy one, so it is the legacy class with or without
 * FORCE_GENERIC_VIEWPORT.
 */
function createPair(
  renderingEngine,
  { legacyType, orientation, legacyId = 'legacy', nextId = 'next' }
) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;
  const viewportOptions = {
    orientation,
    width: 400,
    height: 300,
    useEnableElement: true,
  };

  rendering.useGenericViewport = false;
  testUtils.createViewports(renderingEngine, {
    ...viewportOptions,
    viewportId: legacyId,
    viewportType: legacyType,
  });
  rendering.useGenericViewport = useGenericViewport;
  testUtils.createViewports(renderingEngine, {
    ...viewportOptions,
    viewportId: nextId,
    viewportType: ViewportType.PLANAR_NEXT,
  });

  return [
    renderingEngine.getViewport(legacyId),
    renderingEngine.getViewport(nextId),
  ];
}

/** The image ids of a stack of 10 images 1 mm apart along z. */
function createStackImageIds(options = {}) {
  return Array.from({ length: 10 }, (_, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      id: 'stackImages',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
      ...options,
    })
  );
}

/**
 * Makes and caches a volume of the fake volume loader: 40 columns, 30 rows
 * and 12 slices, so the extent differs along each axis.
 */
async function createVolume(name = 'volumeURI') {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name,
    id: name,
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

/** Resolves when `check` gives true, checked once per animation frame. */
function waitFor(check, timeout = 4000) {
  const start = performance.now();

  return new Promise((resolve, reject) => {
    const step = () => {
      if (check()) {
        resolve();
      } else if (performance.now() - start > timeout) {
        reject(new Error('waitFor timed out'));
      } else {
        requestAnimationFrame(step);
      }
    };

    step();
  });
}

/** Renders the viewport and resolves at its next IMAGE_RENDERED event. */
function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

/** Shows a stack on the direct next viewport through a display set. */
async function showNextStack(viewport, imageIds) {
  const displaySetId = `stack:${viewport.id}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.ACQUISITION },
  });
  await renderAndWait(viewport);
}

/**
 * Shows volumes on the direct next viewport through display sets: the first
 * is the source, the others are overlays.
 */
async function showNextVolumes(viewport, volumeIds, orientation) {
  const entries = volumeIds.map((volumeId, index) => {
    const displaySetId = `volume:${viewport.id}:${index}`;

    utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
      imageIds: cache.getVolume(volumeId).imageIds,
      volumeId,
    });

    return {
      displaySetId,
      options: index ? { role: 'overlay', orientation } : { orientation },
    };
  });

  await viewport.setDisplaySets(...entries);
  await renderAndWait(viewport);
}

/** Shows volumes on the legacy volume viewport in an orientation. */
async function showLegacyVolumes(viewport, volumeIds, orientation) {
  await viewport.setVolumes(volumeIds.map((volumeId) => ({ volumeId })));

  if (typeof orientation === 'object') {
    viewport.setOrientation(orientation);
  }

  await renderAndWait(viewport);
}

/** Shows one volume on both viewports of a pair in an orientation. */
async function showVolumePair(renderingEngine, orientation, volumeIds) {
  const axis =
    typeof orientation === 'object' ? OrientationAxis.AXIAL : orientation;
  const [legacy, next] = createPair(renderingEngine, {
    legacyType: ViewportType.ORTHOGRAPHIC,
    orientation: axis,
  });

  await showLegacyVolumes(legacy, volumeIds, orientation);
  await showNextVolumes(next, volumeIds, axis);

  if (typeof orientation === 'object') {
    next.setOrientation(orientation);
    await renderAndWait(next);
  }

  return [legacy, next];
}

/** Shows one stack on both viewports of a pair. */
async function showStackPair(renderingEngine, imageIds) {
  const [legacy, next] = createPair(renderingEngine, {
    legacyType: ViewportType.STACK,
    orientation: OrientationAxis.ACQUISITION,
  });

  await legacy.setStack(imageIds, 0);
  await renderAndWait(legacy);
  await showNextStack(next, imageIds);

  return [legacy, next];
}

/**
 * Makes a legacy adapter of a stack viewport, with the id `adapter`, and
 * shows the stack on it.
 */
async function showAdapterStack(renderingEngine, imageIds) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;

  rendering.useGenericViewport = true;
  testUtils.createViewports(renderingEngine, {
    viewportId: 'adapter',
    viewportType: ViewportType.STACK,
    orientation: OrientationAxis.ACQUISITION,
    width: 400,
    height: 300,
    useEnableElement: true,
  });
  rendering.useGenericViewport = useGenericViewport;

  const adapter = renderingEngine.getViewport('adapter');

  await adapter.setStack(imageIds, 0);
  await renderAndWait(adapter);

  return adapter;
}

/** Scrolls a stack viewport to an image and waits until it shows it. */
async function showImage(viewport, imageIdIndex) {
  const imageId = viewport.getImageIds()[imageIdIndex];

  await viewport.setImageIdIndex(imageIdIndex);
  viewport.render();
  await waitFor(() => viewport.getCurrentImageId() === imageId);
  await renderAndWait(viewport);
}

function nextCamera(viewport) {
  return viewport.getResolvedView().toICamera();
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function expectPointsClose(actual, expected, precision = 4) {
  expect(actual.length).toBe(expected.length);
  Array.from(actual).forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], precision);
  });
}

/**
 * A closed box surface of 12 triangles inside the fake volume, as the
 * polymorphic segmentation takes surfaces: flat points and vtk.js cells.
 */
function createBoxSurfaceInfo() {
  const [x0, x1, y0, y1, z0, z1] = [5.5, 15.5, 4.5, 20.5, 2.5, 8.5];
  const points = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ].flat();
  const triangles = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ];

  return {
    id: 'boxSurface',
    points,
    polys: triangles.flatMap((triangle) => [3, ...triangle]),
    segmentIndex: 1,
  };
}

/**
 * The contours that the surface clipping cached for one viewport, by cache
 * id without the viewport id, with the points rounded to 1e-3.
 */
function getCachedContours(polyDataCache, viewportId) {
  const prefix = `${viewportId}-`;

  return Array.from(polyDataCache.get(1) ?? [])
    .filter(([cacheId, result]) => cacheId.startsWith(prefix) && result)
    .map(([cacheId, result]) => [
      cacheId.slice(prefix.length),
      result.numberOfCells,
      Array.from(result.points, (value) => Math.round(value * 1000) / 1000),
    ])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

const VOLUME_ORIENTATIONS = [
  ['axial', OrientationAxis.AXIAL],
  ['sagittal', OrientationAxis.SAGITTAL],
  ['oblique', OBLIQUE],
];

describe('Direct next planar viewport members against the legacy viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  describe('jumpToWorld', () => {
    it('goes to the image closest to a point on a stack, as the legacy stack viewport', async function () {
      const imageIds = createStackImageIds();
      const [legacy, next] = await showStackPair(renderingEngine, imageIds);
      const point = [20, 20, 6.2];

      expect(next.jumpToWorld(point)).toBe(legacy.jumpToWorld(point));
      await waitFor(
        () => next.getCurrentImageIdIndex() === legacy.getCurrentImageIdIndex()
      );
      expect(legacy.getCurrentImageIdIndex()).toBe(6);
      expect(next.getCurrentImageIdIndex()).toBe(6);
    });

    VOLUME_ORIENTATIONS.forEach(([name, orientation]) => {
      it(`moves the slice to a point of a volume in the ${name} view, as the legacy volume viewport`, async function () {
        const volumeId = await createVolume();
        const [legacy, next] = await showVolumePair(
          renderingEngine,
          orientation,
          [volumeId]
        );
        const point = [12.3, 17.6, 8.4];

        expect(next.jumpToWorld(point)).toBe(legacy.jumpToWorld(point));

        const legacyCamera = legacy.getCamera();
        const camera = nextCamera(next);

        expectPointsClose(camera.viewPlaneNormal, legacyCamera.viewPlaneNormal);
        expect(dot(camera.focalPoint, camera.viewPlaneNormal)).toBeCloseTo(
          dot(legacyCamera.focalPoint, legacyCamera.viewPlaneNormal),
          3
        );

        if (typeof orientation !== 'object') {
          legacy.jumpToWorld([12, 17, 8]);
          next.jumpToWorld([12, 17, 8]);
          expect(next.getSliceIndex()).toBe(legacy.getSliceIndex());
        }
      });
    });
  });

  describe('isInAcquisitionPlane', () => {
    it('is true on a stack, as on the legacy stack viewport', async function () {
      const [legacy, next] = await showStackPair(
        renderingEngine,
        createStackImageIds()
      );

      expect(legacy.isInAcquisitionPlane()).toBe(true);
      expect(next.isInAcquisitionPlane()).toBe(true);
    });

    VOLUME_ORIENTATIONS.forEach(([name, orientation]) => {
      it(`answers as the legacy volume viewport in the ${name} view`, async function () {
        const volumeId = await createVolume();
        const [legacy, next] = await showVolumePair(
          renderingEngine,
          orientation,
          [volumeId]
        );

        expect(next.isInAcquisitionPlane()).toBe(legacy.isInAcquisitionPlane());
      });
    });
  });

  describe('getBounds and getIntensityFromWorld', () => {
    VOLUME_ORIENTATIONS.forEach(([name, orientation]) => {
      it(`give the legacy bounds and values in the ${name} view`, async function () {
        const volumeId = await createVolume();
        const [legacy, next] = await showVolumePair(
          renderingEngine,
          orientation,
          [volumeId]
        );

        expectPointsClose(next.getBounds(), legacy.getBounds());
        [
          [0, 0, 0],
          [3, 7, 2],
          [10.4, 20.2, 5.6],
          [29, 39, 11],
        ].forEach((point) => {
          expect(next.getIntensityFromWorld(point)).toBe(
            legacy.getIntensityFromWorld(point)
          );
        });
      });
    });

    it('give the bounds of every volume of a fusion, as the legacy volume viewport', async function () {
      const volumeId = await createVolume();
      const otherVolumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'largerVolume',
        id: 'largerVolume',
        rows: 50,
        columns: 20,
        slices: 16,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });

      await volumeLoader.createAndCacheVolume(otherVolumeId, { imageIds: [] });

      const [legacy, next] = await showVolumePair(
        renderingEngine,
        OrientationAxis.AXIAL,
        [volumeId, otherVolumeId]
      );

      expectPointsClose(next.getBounds(), legacy.getBounds());
    });

    it('let MIPJumpToClickTool move a direct next viewport as a legacy one', async function () {
      const volumeId = await createVolume();
      const [legacy, next] = await showVolumePair(
        renderingEngine,
        OrientationAxis.SAGITTAL,
        [volumeId]
      );
      const [legacyTarget, nextTarget] = createPair(renderingEngine, {
        legacyType: ViewportType.ORTHOGRAPHIC,
        orientation: OrientationAxis.AXIAL,
        legacyId: 'legacyTarget',
        nextId: 'nextTarget',
      });

      await showLegacyVolumes(legacyTarget, [volumeId]);
      await showNextVolumes(nextTarget, [volumeId], OrientationAxis.AXIAL);

      const click = (viewport, targetViewportId) => {
        const tool = new csTools3d.MIPJumpToClickTool({
          configuration: { targetViewportIds: [targetViewportId] },
        });

        tool.mouseClickCallback({
          detail: {
            element: viewport.element,
            currentPoints: { world: [14, 9.5, 6] },
          },
        });
      };

      click(legacy, 'legacyTarget');
      click(next, 'nextTarget');

      expect(nextTarget.getSliceIndex()).toBe(legacyTarget.getSliceIndex());
      expect(dot(nextCamera(nextTarget).focalPoint, [0, 0, 1])).toBeCloseTo(
        dot(legacyTarget.getCamera().focalPoint, [0, 0, 1]),
        3
      );
    });
  });

  describe('getSliceViewInfo and getCurrentSlicePixelData', () => {
    [
      ['axial', OrientationAxis.AXIAL],
      ['sagittal', OrientationAxis.SAGITTAL],
      ['coronal', OrientationAxis.CORONAL],
    ].forEach(([name, orientation]) => {
      it(`give the legacy slice in the ${name} view`, async function () {
        const volumeId = await createVolume();
        const [legacy, next] = await showVolumePair(
          renderingEngine,
          orientation,
          [volumeId]
        );

        await legacy.scroll(2);
        await next.scroll(2);
        await renderAndWait(legacy);
        await renderAndWait(next);

        const legacyInfo = legacy.getSliceViewInfo();
        const nextInfo = next.getSliceViewInfo();

        expect(nextInfo.sliceIndex).toBe(legacyInfo.sliceIndex);
        expect(nextInfo.slicePlane).toBe(legacyInfo.slicePlane);
        expect(nextInfo.width).toBeCloseTo(legacyInfo.width, 4);
        expect(nextInfo.height).toBeCloseTo(legacyInfo.height, 4);
        expectPointsClose(
          nextInfo.sliceToIndexMatrix,
          legacyInfo.sliceToIndexMatrix
        );
        expectPointsClose(
          nextInfo.indexToSliceMatrix,
          legacyInfo.indexToSliceMatrix
        );
        expect(Array.from(next.getCurrentSlicePixelData())).toEqual(
          Array.from(legacy.getCurrentSlicePixelData())
        );

        const legacySlice = utilities.getCurrentVolumeViewportSlice(legacy);
        const nextSlice = utilities.getCurrentVolumeViewportSlice(next);

        expect(nextSlice.width).toBe(legacySlice.width);
        expect(nextSlice.height).toBe(legacySlice.height);
        expect(Array.from(nextSlice.scalarData)).toEqual(
          Array.from(legacySlice.scalarData)
        );
      });
    });

    it('throw on a stack, as the legacy stack viewport', async function () {
      const [legacy, next] = await showStackPair(
        renderingEngine,
        createStackImageIds()
      );

      expect(() => legacy.getSliceViewInfo()).toThrowError(
        'Method not implemented.'
      );
      expect(() => next.getSliceViewInfo()).toThrowError(
        'Method not implemented.'
      );
    });
  });

  describe('getSlicesClippingPlanes and getSlicePlaneCoordinates', () => {
    VOLUME_ORIENTATIONS.forEach(([name, orientation]) => {
      it(`give the legacy plane of each slice in the ${name} view, within 1e-3 mm, 5e-3 mm when oblique`, async function () {
        const volumeId = await createVolume();
        const [legacy, next] = await showVolumePair(
          renderingEngine,
          orientation,
          [volumeId]
        );
        const legacyPoints = legacy.getSlicePlaneCoordinates();
        const nextPoints = next.getSlicePlaneCoordinates();
        const precision = typeof orientation === 'object' ? 2 : 3;

        expect(legacyPoints.length).toBeGreaterThan(0);
        expect(nextPoints.length).toBe(legacyPoints.length);
        nextPoints.forEach(({ sliceIndex, point }, index) => {
          expect(sliceIndex).toBe(legacyPoints[index].sliceIndex);
          expectPointsClose(point, legacyPoints[index].point, precision);
        });

        const legacyPlanes = legacy.getSlicesClippingPlanes();
        const nextPlanes = next.getSlicesClippingPlanes();

        expect(nextPlanes.length).toBe(legacyPlanes.length);
        nextPlanes.forEach(({ sliceIndex, planes }, index) => {
          expect(sliceIndex).toBe(legacyPlanes[index].sliceIndex);
          expect(planes.length).toBe(2);
          planes.forEach((plane, planeIndex) => {
            const legacyPlane = legacyPlanes[index].planes[planeIndex];

            expectPointsClose(plane.normal, legacyPlane.normal);
            expectPointsClose(plane.origin, legacyPlane.origin, precision);
          });
        });
      });
    });

    it('let a surface be cut into the contours of each slice as on a legacy viewport', async function () {
      const volumeId = await createVolume();
      const [legacy, next] = await showVolumePair(
        renderingEngine,
        OrientationAxis.SAGITTAL,
        [volumeId]
      );
      const surfacesInfo = [createBoxSurfaceInfo()];

      await clipAndCacheSurfacesForViewport(surfacesInfo, legacy);

      const polyDataCache = await clipAndCacheSurfacesForViewport(
        surfacesInfo,
        next
      );
      const legacyContours = getCachedContours(polyDataCache, legacy.id);

      expect(legacyContours.length).toBeGreaterThan(0);
      expect(getCachedContours(polyDataCache, next.id)).toEqual(legacyContours);
    });
  });

  describe('getCornerstoneImage', () => {
    it('gives the image on display after a scroll on the adapter, as the legacy stack viewport', async function () {
      const imageIds = createStackImageIds();
      const [legacy] = await showStackPair(renderingEngine, imageIds);
      const adapter = await showAdapterStack(renderingEngine, imageIds);

      await showImage(legacy, 3);
      await showImage(adapter, 3);

      expect(legacy.getCornerstoneImage().imageId).toBe(imageIds[3]);
      expect(adapter.getCornerstoneImage().imageId).toBe(imageIds[3]);
    });

    it('gives the image on display on a direct next viewport, as the legacy stack viewport', async function () {
      const imageIds = createStackImageIds();
      const [legacy, next] = await showStackPair(renderingEngine, imageIds);

      expect(next.getCornerstoneImage().imageId).toBe(
        legacy.getCornerstoneImage().imageId
      );

      await showImage(legacy, 4);
      await showImage(next, 4);

      expect(next.getCornerstoneImage().imageId).toBe(imageIds[4]);
      expect(utilities.getImageLegacy(next.element).imageId).toBe(
        utilities.getImageLegacy(legacy.element).imageId
      );
    });

    it('gives no image on a volume, where the legacy volume viewport has none', async function () {
      const volumeId = await createVolume();
      const [legacy, next] = await showVolumePair(
        renderingEngine,
        OrientationAxis.AXIAL,
        [volumeId]
      );

      expect(legacy.getCornerstoneImage).toBeUndefined();
      expect(next.getCornerstoneImage()).toBeUndefined();
    });
  });

  describe('scaling', () => {
    const ptScaling = { suvbw: 2, suvlbm: 3, suvbsa: 5 };
    const scalingProvider = (type, imageId) =>
      type === 'scalingModule' && imageId.includes('ptImages')
        ? ptScaling
        : undefined;

    beforeEach(function () {
      metaData.addProvider(scalingProvider, 100000);
    });

    afterEach(function () {
      metaData.removeProvider(scalingProvider);
    });

    it('gives the PT ratios of a PT stack, as the legacy stack viewport', async function () {
      const imageIds = createStackImageIds({ id: 'ptImages', PT: true });
      const [legacy, next] = await showStackPair(renderingEngine, imageIds);

      expect(legacy.scaling.PT.suvbwToSuvlbm).toBeCloseTo(1.5, 6);
      expect(next.scaling).toEqual(legacy.scaling);
    });

    it('gives no PT ratios for a stack of another modality, as the legacy stack viewport', async function () {
      const imageIds = createStackImageIds();
      const [legacy, next] = await showStackPair(renderingEngine, imageIds);

      expect(legacy.scaling).toEqual({});
      expect(next.scaling).toEqual({});
    });
  });

  describe('stackActorReInitialized', () => {
    it('tells when an image needed new image data, as the legacy stack viewport', async function () {
      const imageIds = [
        ...createStackImageIds().slice(0, 3),
        ...createStackImageIds({ rows: 32, columns: 48 }).slice(3, 6),
      ];
      const [legacy, next] = await showStackPair(renderingEngine, imageIds);
      const states = [];

      for (const imageIdIndex of [1, 3, 4, 0]) {
        await showImage(legacy, imageIdIndex);
        await showImage(next, imageIdIndex);
        states.push([
          legacy.stackActorReInitialized,
          next.stackActorReInitialized,
        ]);
      }

      expect(states.map(([legacyState]) => legacyState)).toEqual([
        false,
        true,
        false,
        true,
      ]);
      states.forEach(([legacyState, nextState]) => {
        expect(nextState).toBe(legacyState);
      });
    });

    it('is false on a volume, where the legacy volume viewport does not set it', async function () {
      const volumeId = await createVolume();
      const [legacy, next] = await showVolumePair(
        renderingEngine,
        OrientationAxis.AXIAL,
        [volumeId]
      );

      expect(Boolean(legacy.stackActorReInitialized)).toBe(false);
      expect(next.stackActorReInitialized).toBe(false);
    });
  });

  describe('isDisabled', () => {
    it('is false while enabled and true once the engine disables the viewport, as on the legacy viewport', async function () {
      const [legacy, next] = await showStackPair(
        renderingEngine,
        createStackImageIds()
      );

      expect(legacy.isDisabled).toBe(false);
      expect(next.isDisabled).toBe(false);

      renderingEngine.disableElement('legacy');
      renderingEngine.disableElement('next');

      expect(legacy.isDisabled).toBe(true);
      expect(next.isDisabled).toBe(true);
    });
  });

  describe('isOrientationChangeable', () => {
    it('is false on a stack, as on the legacy stack viewport', async function () {
      const [legacy, next] = await showStackPair(
        renderingEngine,
        createStackImageIds()
      );

      expect(legacy.isOrientationChangeable()).toBe(false);
      expect(next.isOrientationChangeable()).toBe(false);
    });

    it('is true on a volume, as on the legacy volume viewport', async function () {
      const volumeId = await createVolume();
      const [legacy, next] = await showVolumePair(
        renderingEngine,
        OrientationAxis.SAGITTAL,
        [volumeId]
      );

      expect(legacy.isOrientationChangeable()).toBe(true);
      expect(next.isOrientationChangeable()).toBe(true);
    });

    it('lets OrientationControllerTool add and remove its marker on a direct next viewport', async function () {
      const volumeId = await createVolume();
      const [, next] = await showVolumePair(
        renderingEngine,
        OrientationAxis.SAGITTAL,
        [volumeId]
      );
      const tool = new csTools3d.OrientationControllerTool();

      expect(() =>
        tool.addMarkerToViewport(next.id, renderingEngine.id)
      ).not.toThrow();
      expect(tool.widget.getActors(next.id)).toBeDefined();
      expect(() =>
        tool.onViewportRemoved({
          detail: {
            viewportId: next.id,
            renderingEngineId: renderingEngine.id,
            toolGroupId: tool.toolGroupId,
          },
        })
      ).not.toThrow();
    });
  });

  describe('volumes of a fusion', () => {
    async function showFusionPair() {
      const volumeId = await createVolume('sourceVolume');
      const overlayVolumeId = await createVolume('overlayVolume');
      const hiddenVolumeId = await createVolume('hiddenVolume');
      const [legacy, next] = await showVolumePair(
        renderingEngine,
        OrientationAxis.AXIAL,
        [volumeId, overlayVolumeId]
      );

      return { legacy, next, volumeId, overlayVolumeId, hiddenVolumeId };
    }

    it('give no volume on a stack, as a legacy stack viewport has none', async function () {
      const [, next] = await showStackPair(
        renderingEngine,
        createStackImageIds()
      );

      expect(next.getAllVolumeIds()).toEqual([]);
      expect(next.getBounds()).toBeUndefined();
      expect(next.hasVolumeURI('stackImages')).toBe(false);
    });

    it('give no volume id for a volume that is not shown, as the legacy volume viewport', async function () {
      const { legacy, next, overlayVolumeId, hiddenVolumeId } =
        await showFusionPair();

      expect(legacy.getVolumeId({ volumeId: hiddenVolumeId })).toBeUndefined();
      expect(next.getVolumeId({ volumeId: hiddenVolumeId })).toBeUndefined();
      expect(next.getVolumeId({ volumeId: overlayVolumeId })).toBe(
        legacy.getVolumeId({ volumeId: overlayVolumeId })
      );
      expect(next.getVolumeId()).toBe(legacy.getVolumeId());
    });

    it('answer for every volume shown, as the legacy volume viewport', async function () {
      const { legacy, next, volumeId, overlayVolumeId, hiddenVolumeId } =
        await showFusionPair();
      const overlayImageId = cache.getVolume(overlayVolumeId).imageIds[2];
      const hiddenImageId = cache.getVolume(hiddenVolumeId).imageIds[2];

      [volumeId, overlayVolumeId, hiddenVolumeId].forEach((id) => {
        expect(next.hasVolumeId(id)).toBe(legacy.hasVolumeId(id));
      });
      ['overlayVolume', 'hiddenVolume'].forEach((uri) => {
        expect(next.hasVolumeURI(uri)).toBe(legacy.hasVolumeURI(uri));
      });
      [overlayImageId, hiddenImageId].forEach((imageId) => {
        const imageURI = utilities.imageIdToURI(imageId);

        expect(next.hasImageURI(imageURI)).toBe(legacy.hasImageURI(imageURI));
      });
      expect(legacy.hasVolumeURI('overlayVolume')).toBe(true);
      expect(next.getImageIds(overlayVolumeId)).toEqual(
        legacy.getImageIds(overlayVolumeId)
      );
      expect(next.getImageIds()).toEqual(legacy.getImageIds());
      expect(() => legacy.getImageIds(hiddenVolumeId)).toThrow();
      expect(() => next.getImageIds(hiddenVolumeId)).toThrow();
      expect(next.getAllVolumeIds().sort()).toEqual(
        legacy.getAllVolumeIds().sort()
      );
    });
  });
});
