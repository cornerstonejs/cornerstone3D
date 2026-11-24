import * as cornerstone3D from '../src/index';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createSeries,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, volumeLoader, utilities, cache, viewportProjection } =
  cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const environmentEngineId = utilities.uuidv4();

const ENGINES = [
  {
    name: 'the context pool rendering engine',
    Engine: ContextPoolRenderingEngine,
  },
  { name: 'the tiled rendering engine', Engine: TiledRenderingEngine },
];

const PLANAR_BACKENDS = [
  { name: 'on the GPU', options: {} },
  { name: 'on the CPU', options: { renderBackend: 'cpu' } },
];

/**
 * The two changes of size of the planar cases, from 400 by 300 pixels, with
 * the zoom and the change of the pan in canvas pixels (`getPan()`) that
 * 5.19.4 read after each on its legacy stack and volume viewports at zoom 2:
 * the parallel scale stays, so the zoom against the new fit is 2 * 19.2 / 18
 * after the width change, and the pan in pixels scales with the height.
 */
const PLANAR_RESIZES = [
  {
    name: 'a change of the width',
    apply: (element) => {
      element.style.width = '250px';
    },
    zoom: (2 * 19.2) / 18,
    panFactor: 1,
  },
  {
    name: 'a change of the height',
    apply: (element) => {
      element.style.height = '200px';
    },
    zoom: 2,
    panFactor: 200 / 300,
  },
];

/** The parallel scale and the focal point of a planar viewport. */
function readPlanarCamera(viewport) {
  const { parallelScale, focalPoint } = viewport.getResolvedView().toICamera();

  return { parallelScale, focalPoint: [...focalPoint] };
}

/** Waits for the given number of animation frames. */
async function frames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

function expectPointClose(actual, expected, context) {
  expected.forEach((value, axis) => {
    expect(actual[axis]).withContext(context).toBeCloseTo(value, 3);
  });
}

/**
 * Makes and caches a volume of the fake volume loader: 40 columns, 30 rows
 * and 12 slices 2 mm apart.
 */
async function createVolume(name) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name,
    id: name,
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 2,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

/**
 * Enables a direct next 3D viewport of 478 by 330 pixels with a volume, as
 * the 3D pane of OHIF's four up layout, and zooms it to 2 with a pan.
 */
async function show3DViewport(renderingEngine, name) {
  const volumeId = await createVolume(name);
  const element = document.createElement('div');
  const displaySetId = `resizeKeepCamera3D:${volumeId}`;

  element.style.width = '478px';
  element.style.height = '330px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId: 'resizeKeepCamera3D',
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: { orientation: OrientationAxis.CORONAL },
  });

  const viewport = renderingEngine.getViewport('resizeKeepCamera3D');

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
  });
  viewport.render();
  await frames(3);

  const camera = viewport.getViewState();

  viewport.setViewState({
    parallelScale: camera.parallelScale / 2,
    focalPoint: [
      camera.focalPoint[0] + 5,
      camera.focalPoint[1],
      camera.focalPoint[2] + 3,
    ],
    position: [
      camera.position[0] + 5,
      camera.position[1],
      camera.position[2] + 3,
    ],
  });
  viewport.render();
  await frames(3);

  return viewport;
}

/**
 * Makes a direct next planar viewport of 400 by 300 pixels of one series in
 * a mode, at image 3, and zooms it to 2 with a pan. `options` are those of
 * the display set.
 */
async function showPlanarViewport(renderingEngine, mode, name, options = {}) {
  const series = await createSeries({ id: name });

  testUtils.createViewports(renderingEngine, {
    viewportId: 'resizeKeepCameraPlanar',
    viewportType: ViewportType.PLANAR,
    orientation: OrientationAxis.ACQUISITION,
    width: 400,
    height: 300,
    useEnableElement: true,
  });

  const viewport = renderingEngine.getViewport('resizeKeepCameraPlanar');

  if (mode === 'stack') {
    await showStack(viewport, series, 3, options);
  } else {
    await showVolume(viewport, series, 3, options);
  }
  viewport.setViewState(
    viewportProjection.withFraming(viewport, { zoom: 2, pan: [20, 10] })
  );
  viewport.render();
  await frames(3);

  return { viewport, series };
}

describe('renderingEngine.resize(immediate, keepCamera) -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    testUtils.setupTestEnvironment({
      renderingEngineId: environmentEngineId,
      toolGroupIds: [],
    });
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    renderingEngine?.destroy();
    renderingEngine = undefined;
    testUtils.cleanupTestEnvironment({
      renderingEngineId: environmentEngineId,
    });
  });

  ENGINES.forEach(({ name: engineName, Engine }) => {
    it(`keeps the camera of a 3D viewport with keepCamera true on ${engineName}, as the legacy 3D viewport`, async () => {
      renderingEngine = new Engine(utilities.uuidv4());

      const viewport = await show3DViewport(
        renderingEngine,
        `resizeKeepCamera3DTrue${Engine.name}`
      );
      const before = viewport.getViewState();

      viewport.element.style.width = '317px';
      renderingEngine.resize(true, true);
      await frames(4);

      const after = viewport.getViewState();

      expect(after.parallelScale).toBeCloseTo(before.parallelScale, 6);
      expectPointClose(after.focalPoint, before.focalPoint, 'focal point');
      expectPointClose(
        after.viewPlaneNormal,
        before.viewPlaneNormal,
        'view plane normal'
      );
    });

    it(`fits a 3D viewport to the new canvas with keepCamera false on ${engineName}, as the legacy 3D viewport`, async () => {
      renderingEngine = new Engine(utilities.uuidv4());

      const viewport = await show3DViewport(
        renderingEngine,
        `resizeKeepCamera3DFalse${Engine.name}`
      );
      const before = viewport.getViewState();

      viewport.element.style.width = '317px';
      renderingEngine.resize(true, false);
      await frames(4);

      const after = viewport.getViewState();

      viewport.resetViewState();
      await frames(2);

      const fit = viewport.getViewState();

      expect(after.parallelScale).toBeCloseTo(fit.parallelScale, 6);
      expect(after.parallelScale).not.toBeCloseTo(before.parallelScale, 1);
      expectPointClose(after.focalPoint, fit.focalPoint, 'focal point');
      expectPointClose(
        after.viewPlaneNormal,
        before.viewPlaneNormal,
        'view plane normal'
      );
      expect(viewportProjection.getFraming(viewport).zoom).toBeCloseTo(1, 6);
    });

    it(`gives a 3D viewport the fit of the new canvas for a zoom read before a resize and written back after it on ${engineName}, as the legacy 3D viewport`, async () => {
      renderingEngine = new Engine(utilities.uuidv4());

      const viewport = await show3DViewport(
        renderingEngine,
        `resizeKeepCamera3DRestore${Engine.name}`
      );

      viewport.resetViewState();
      await frames(2);

      const { zoom, pan } = viewportProjection.getFraming(viewport);

      viewport.element.style.width = '317px';
      renderingEngine.resize(false);
      renderingEngine.render();
      viewport.setViewState(
        viewportProjection.withFraming(viewport, { zoom, pan })
      );
      renderingEngine.resize(false);
      renderingEngine.render();
      await frames(4);

      const restored = viewport.getViewState().parallelScale;

      viewport.resetViewState();
      await frames(2);

      expect(restored).toBeCloseTo(viewport.getViewState().parallelScale, 6);
      expect(viewportProjection.getFraming(viewport).zoom).toBeCloseTo(1, 6);
    });

    ['stack', 'volume'].forEach((mode) => {
      PLANAR_BACKENDS.forEach(({ name: backendName, options }) => {
        PLANAR_RESIZES.forEach(
          ({ name: resizeName, apply, zoom, panFactor }) => {
            it(`keeps the parallel scale and the focal point of a planar viewport in ${mode} mode ${backendName} through ${resizeName} with keepCamera true on ${engineName}, as the legacy viewports`, async () => {
              renderingEngine = new Engine(utilities.uuidv4());

              const { viewport, series } = await showPlanarViewport(
                renderingEngine,
                mode,
                `resizeKeepCameraPlanarTrue${mode}${backendName}${resizeName}${Engine.name}`,
                options
              );
              const before = readPlanarCamera(viewport);
              const panBefore = viewport.getPan();
              const cameraEvents = [];
              const onCameraModified = (event) => cameraEvents.push(event);

              viewport.element.addEventListener(
                Events.CAMERA_MODIFIED,
                onCameraModified
              );
              apply(viewport.element);
              renderingEngine.resize(true, true);
              await frames(4);
              viewport.element.removeEventListener(
                Events.CAMERA_MODIFIED,
                onCameraModified
              );

              const after = readPlanarCamera(viewport);
              const panAfter = viewport.getPan();

              expect(after.parallelScale).toBeCloseTo(before.parallelScale, 6);
              expectPointClose(
                after.focalPoint,
                before.focalPoint,
                'focal point'
              );
              expect(viewport.getZoom()).toBeCloseTo(zoom, 3);
              expect(panAfter[0]).toBeCloseTo(panBefore[0] * panFactor, 3);
              expect(panAfter[1]).toBeCloseTo(panBefore[1] * panFactor, 3);
              expect(viewport.getCurrentImageId()).toBe(series.imageIds[3]);
              expect(cameraEvents.length).toBe(1);
              expect(cameraEvents[0].detail.camera.parallelScale).toBeCloseTo(
                before.parallelScale,
                6
              );
            });
          }
        );
      });

      it(`fits a planar viewport in ${mode} mode to the new canvas with keepCamera false on ${engineName}, and keeps its slice`, async () => {
        renderingEngine = new Engine(utilities.uuidv4());

        const { viewport, series } = await showPlanarViewport(
          renderingEngine,
          mode,
          `resizeKeepCameraPlanarFalse${mode}${Engine.name}`
        );

        viewport.element.style.width = '250px';
        renderingEngine.resize(true, false);
        await frames(4);

        const presentation = viewportProjection.getFraming(viewport);

        expect(presentation.zoom).toBeCloseTo(1, 6);
        expect(presentation.pan[0]).toBeCloseTo(0, 6);
        expect(presentation.pan[1]).toBeCloseTo(0, 6);
        expect(viewport.getCurrentImageId()).toBe(series.imageIds[3]);
        expect([viewport.canvas.width, viewport.canvas.height]).toEqual([
          250, 300,
        ]);
      });
    });
  });
});
