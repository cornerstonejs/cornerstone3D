import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  showStack,
  showVolume,
  worldOfVoxel,
} from '../../core/test/utils/planarSeriesBothModes';

const { Enums, utilities, viewportProjection } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;
const {
  BaseTool,
  PanTool,
  ZoomTool,
  ToolGroupManager,
  SynchronizerManager,
  synchronizers,
  Enums: csToolsEnums,
} = csTools3d;
const { MouseBindings } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'nextZoomPan';
const WIDTH = 400;
const HEIGHT = 300;
const CENTRE = [WIDTH / 2, HEIGHT / 2];

/** Two animation frames, for a render that a tool asked for. */
async function frames(count = 2) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** The mouse event of a type at a canvas point of the element. */
function mouseEventAt(element, type, canvasPoint) {
  const rect = element.getBoundingClientRect();
  const clientX = Math.round(rect.left + canvasPoint[0]);
  const clientY = Math.round(rect.top + canvasPoint[1]);

  return new MouseEvent(type, {
    clientX,
    clientY,
    pageX: clientX + window.pageXOffset,
    pageY: clientY + window.pageYOffset,
    buttons: 1,
    bubbles: true,
  });
}

/** Drags the primary button over the element between two canvas points. */
async function drag(element, from, to) {
  element.dispatchEvent(mouseEventAt(element, 'mousedown', from));
  document.dispatchEvent(mouseEventAt(element, 'mousemove', to));
  document.dispatchEvent(mouseEventAt(element, 'mouseup', to));
  await frames();
}

/** Turns the wheel over a canvas point of the element, down to zoom in. */
async function wheel(element, canvasPoint, steps, zoomIn = true) {
  const rect = element.getBoundingClientRect();

  for (let step = 0; step < steps; step++) {
    element.dispatchEvent(
      new WheelEvent('wheel', {
        clientX: Math.round(rect.left + canvasPoint[0]),
        clientY: Math.round(rect.top + canvasPoint[1]),
        deltaY: zoomIn ? 100 : -100,
        bubbles: true,
        cancelable: true,
      })
    );
  }

  await frames();
}

/** Makes a direct next 3D viewport of the size of the planar ones. */
function createNext3DViewport(renderingEngine, viewportId, options = {}) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.VOLUME_3D,
    orientation: OrientationAxis.AXIAL,
    width: WIDTH,
    height: HEIGHT,
    useEnableElement: true,
    ...options,
  });

  return renderingEngine.getViewport(viewportId);
}

/** Shows the volume of a series on a direct next 3D viewport. */
async function show3D(viewport, series) {
  const displaySetId = `volume3d:${viewport.id}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
  });
  viewport.resetViewState();
  await frames();

  return displaySetId;
}

/**
 * The size of the picture of a 3D viewport against its fit, read from the
 * camera and not from the projection service: the parallel scale of the fit
 * over the parallel scale now.
 */
function zoomAgainstFit(viewport, fitCamera) {
  return fitCamera.parallelScale / viewport.getViewState().parallelScale;
}

/** Where a world point shows, less the centre of the canvas. */
function shiftOf(viewport, worldPoint) {
  const canvasPoint = viewport.worldToCanvas(worldPoint);

  return [canvasPoint[0] - CENTRE[0], canvasPoint[1] - CENTRE[1]];
}

/**
 * A display area that fits a part of the image and puts an image point that
 * is not its centre at the centre of the canvas: a zoom of 1.25 and a pan.
 */
const DISPLAY_AREA = {
  imageArea: [0.8, 0.8],
  imageCanvasPoint: { imagePoint: [0.4, 0.6], canvasPoint: [0.5, 0.5] },
};

/**
 * Where the picture of slice 2 is on the canvas: the canvas point of one of
 * its voxels, and the distance in canvas pixels between two of them, which
 * is the size of the picture.
 */
function pictureOf(viewport, series) {
  const a = viewport.worldToCanvas(worldOfVoxel(series, [8, 6, 2]));
  const b = viewport.worldToCanvas(worldOfVoxel(series, [24, 18, 2]));

  return { a, size: Math.hypot(b[0] - a[0], b[1] - a[1]) };
}

/**
 * Checks that the zoom and the pan of the projection service are the ones on
 * the screen: the picture is `zoom` times its fitted size, and `pan * scale`
 * canvas pixels from its fitted place.
 */
function expectPresentationOnScreen(viewport, series, fit) {
  const { zoom, pan, scale } = viewportProjection.getFraming(viewport, {
    selector: { zoom: true, pan: true, scale: true },
  });
  const { a, size } = pictureOf(viewport, series);

  expect(size / fit.size).toBeCloseTo(zoom, 3);
  expect(a[0]).toBeCloseTo(
    CENTRE[0] + (fit.a[0] - CENTRE[0]) * scale[0] + pan[0] * scale[0],
    2
  );
  expect(a[1]).toBeCloseTo(
    CENTRE[1] + (fit.a[1] - CENTRE[1]) * scale[1] + pan[1] * scale[1],
    2
  );
}

/** The zoom and the pan of a next viewport from the projection service. */
function zoomPanOf(viewport) {
  return viewportProjection.getFraming(viewport, {
    selector: { zoom: true, pan: true },
  });
}

/** Sets up the tool group with the zoom and the pan tool. */
function setupTools(zoomConfiguration = {}) {
  const setup = testUtils.setupTestEnvironment({
    renderingEngineId,
    toolGroupIds: [toolGroupId],
    tools: [ZoomTool, PanTool],
  });
  const toolGroup = setup.toolGroups[toolGroupId];

  toolGroup.setToolConfiguration(ZoomTool.toolName, zoomConfiguration);

  return { renderingEngine: setup.renderingEngine, toolGroup };
}

/** Binds the zoom tool to the wheel and to the primary button. */
function activateZoom(toolGroup) {
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Wheel },
      { mouseButton: MouseBindings.Primary },
    ],
  });
}

/** Binds the pan tool to the primary button. */
function activatePan(toolGroup) {
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
}

function cleanup() {
  testUtils.cleanupTestEnvironment({
    renderingEngineId,
    toolGroupIds: [toolGroupId],
  });
}

describe('Zoom and pan tools on a direct next 3D viewport -- ', () => {
  let renderingEngine;
  let toolGroup;
  let next;
  let fitCamera;

  beforeEach(async function () {
    ({ renderingEngine, toolGroup } = setupTools({
      minZoomScale: 0.5,
      maxZoomScale: 2,
    }));
    next = createNext3DViewport(renderingEngine, 'next3D');
    toolGroup.addViewport(next.id, renderingEngineId);
    await show3D(next, await createSeries());
    fitCamera = next.getViewState();
  }, 15000);

  afterEach(cleanup);

  it('keeps the zoom of the wheel inside the limits of the zoom tool', async function () {
    activateZoom(toolGroup);

    await wheel(next.element, CENTRE, 20);

    expect(zoomAgainstFit(next, fitCamera)).toBeCloseTo(2, 4);

    await wheel(next.element, CENTRE, 40, false);

    expect(zoomAgainstFit(next, fitCamera)).toBeCloseTo(0.5, 4);
  }, 15000);

  it('keeps the zoom of a drag inside the limits of the zoom tool', async function () {
    activateZoom(toolGroup);

    for (let step = 0; step < 12; step++) {
      await drag(next.element, [200, 150], [200, 200]);
    }

    expect(zoomAgainstFit(next, fitCamera)).toBeCloseTo(2, 4);
  }, 15000);

  it('zooms about the mouse, and about the centre with zoomToCenter', async function () {
    activateZoom(toolGroup);

    const mouse = [300, 100];
    const underMouse = next.canvasToWorld(mouse);

    await wheel(next.element, mouse, 3);

    const zoom = zoomAgainstFit(next, fitCamera);
    const shown = next.worldToCanvas(underMouse);

    expect(zoom).toBeGreaterThan(1.1);
    expect(shown[0]).toBeCloseTo(mouse[0], 0);
    expect(shown[1]).toBeCloseTo(mouse[1], 0);

    next.resetViewState();
    toolGroup.setToolConfiguration(ZoomTool.toolName, { zoomToCenter: true });
    await wheel(next.element, mouse, 3);

    const centred = shiftOf(next, fitCamera.focalPoint);

    expect(zoomAgainstFit(next, fitCamera)).toBeCloseTo(zoom, 4);
    expect(centred[0]).toBeCloseTo(0, 1);
    expect(centred[1]).toBeCloseTo(0, 1);
  }, 15000);

  it('moves the picture with the mouse of the pan tool, also after a zoom and a turn of the camera', async function () {
    activatePan(toolGroup);

    for (const prepare of [
      () => undefined,
      () => next.setViewState({ parallelScale: fitCamera.parallelScale / 1.6 }),
      () => {
        next.setViewReference({
          viewPlaneNormal: [0.6, 0, 0.8],
          viewUp: [0, 1, 0],
        });
      },
    ]) {
      prepare();
      await frames();

      const from = [150, 120];
      const to = [185, 95];
      const world = next.canvasToWorld(from);

      await drag(next.element, from, to);

      const moved = next.worldToCanvas(world);

      expect(moved[0]).toBeCloseTo(to[0], 0);
      expect(moved[1]).toBeCloseTo(to[1], 0);
    }
  }, 15000);
});

describe('Synchronizers with a direct next 3D target -- ', () => {
  let renderingEngine;
  let planar;
  let next;
  let series;
  let displaySetId;
  let fitCamera;

  beforeEach(async function () {
    ({ renderingEngine } = setupTools());
    series = await createSeries();
    planar = createNextViewport(renderingEngine, 'planarSource');
    next = createNext3DViewport(renderingEngine, 'next3DTarget');
    await showVolume(planar, series, 2);
    displaySetId = await show3D(next, series);
    fitCamera = next.getViewState();
  }, 15000);

  afterEach(function () {
    SynchronizerManager.destroy();
    cleanup();
  });

  it('gives the zoom and the pan of a planar source to the 3D target of a zoom and pan synchronizer', async function () {
    const synchronizer = synchronizers.createZoomPanSynchronizer('zoomPanNext');

    synchronizer.add({ renderingEngineId, viewportId: planar.id });
    synchronizer.add({ renderingEngineId, viewportId: next.id });

    planar.setViewState(
      viewportProjection.withFraming(planar, { zoom: 2, pan: [15, -10] })
    );
    await frames(3);

    const shift = shiftOf(next, fitCamera.focalPoint);

    expect(zoomPanOf(planar).zoom).toBeCloseTo(2, 4);
    expect(zoomAgainstFit(next, fitCamera)).toBeCloseTo(2, 4);
    expect(shift[0]).toBeCloseTo(30, 1);
    expect(shift[1]).toBeCloseTo(-20, 1);
  }, 15000);

  it('keeps the zoom and the pan of a planar viewport that a zoom and pan synchronizer joins with a 3D viewport that shows nothing', async function () {
    const empty = createNext3DViewport(renderingEngine, 'next3DEmpty');
    const synchronizer = synchronizers.createZoomPanSynchronizer('zoomPanNext');

    synchronizer.add({ renderingEngineId, viewportId: planar.id });
    synchronizer.add({ renderingEngineId, viewportId: empty.id });

    expect(zoomPanOf(empty).zoom).toBeUndefined();

    planar.setViewState(
      viewportProjection.withFraming(planar, { zoom: 2, pan: [15, -10] })
    );
    await frames(3);

    expect(zoomPanOf(planar).zoom).toBeCloseTo(2, 4);
    expect(zoomPanOf(planar).pan[0]).toBeCloseTo(15, 3);
    expect(zoomPanOf(planar).pan[1]).toBeCloseTo(-10, 3);

    empty.setViewState({
      parallelScale: empty.getViewState().parallelScale * 2,
    });
    await frames(3);

    expect(zoomPanOf(planar).zoom).toBeCloseTo(2, 4);
    expect(zoomPanOf(planar).pan[0]).toBeCloseTo(15, 3);
    expect(zoomPanOf(planar).pan[1]).toBeCloseTo(-10, 3);
  }, 15000);

  it('makes a zoom and pan memo for a 3D viewport that shows a volume, and none for one that shows nothing', function () {
    const empty = createNext3DViewport(renderingEngine, 'next3DEmpty');

    expect(BaseTool.createZoomPanMemo(empty)).toBeUndefined();

    const memo = BaseTool.createZoomPanMemo(next);

    next.setZoom(2);
    next.setPan([30, -20]);
    memo.restoreMemo();

    expect(next.getZoom()).toBeCloseTo(1, 4);
    expect(next.getPan()[0]).toBeCloseTo(0, 3);
    expect(next.getPan()[1]).toBeCloseTo(0, 3);

    memo.restoreMemo();

    expect(next.getZoom()).toBeCloseTo(2, 4);
    expect(next.getPan()[0]).toBeCloseTo(30, 3);
    expect(next.getPan()[1]).toBeCloseTo(-20, 3);
  });

  it('gives the window of a planar source to the 3D target of a VOI synchronizer', async function () {
    const synchronizer = synchronizers.createVOISynchronizer('voiNext', {
      syncInvertState: false,
      syncColormap: false,
    });
    const voiRange = { lower: 12, upper: 345 };

    synchronizer.add({ renderingEngineId, viewportId: planar.id });
    synchronizer.add({ renderingEngineId, viewportId: next.id });

    planar.setDisplaySetAppearance({ voiRange });
    await frames(3);

    expect(
      planar.getDisplaySetAppearance(`volume:${planar.id}`).voiRange
    ).toEqual(voiRange);
    expect(next.getDisplaySetAppearance(displaySetId)?.voiRange).toEqual(
      voiRange
    );
  }, 15000);
});

describe('Zoom and pan tools on a direct next planar viewport -- ', () => {
  let renderingEngine;
  let toolGroup;
  let next;
  let series;

  beforeEach(async function () {
    ({ renderingEngine, toolGroup } = setupTools({
      minZoomScale: 0.5,
      maxZoomScale: 2,
    }));
    series = await createSeries();
    next = createNextViewport(renderingEngine, 'nextPlanar');
    toolGroup.addViewport(next.id, renderingEngineId);
  }, 15000);

  afterEach(cleanup);

  for (const [mode, show] of [
    ['stack', showStack],
    ['volume', showVolume],
  ]) {
    it(`keeps the zoom of the wheel and of a drag inside the limits of the zoom tool in ${mode} mode`, async function () {
      await show(next, series, 2);
      activateZoom(toolGroup);

      await wheel(next.element, CENTRE, 20);

      expect(next.getCurrentMode()).toBe(mode);
      expect(zoomPanOf(next).zoom).toBeCloseTo(2, 4);

      await wheel(next.element, CENTRE, 40, false);

      expect(zoomPanOf(next).zoom).toBeCloseTo(0.5, 4);

      for (let step = 0; step < 16; step++) {
        await drag(next.element, [200, 150], [200, 200]);
      }

      expect(zoomPanOf(next).zoom).toBeCloseTo(2, 4);
    }, 15000);

    it(`zooms about the mouse in ${mode} mode`, async function () {
      await show(next, series, 2);
      activateZoom(toolGroup);

      const mouse = [260, 110];
      const underMouse = next.canvasToWorld(mouse);

      await wheel(next.element, mouse, 3);

      const shown = next.worldToCanvas(underMouse);

      expect(zoomPanOf(next).zoom).toBeGreaterThan(1.1);
      expect(shown[0]).toBeCloseTo(mouse[0], 0);
      expect(shown[1]).toBeCloseTo(mouse[1], 0);
    }, 15000);

    for (const [backend, options, draw] of [
      ['GPU', {}, 'gpu'],
      ['CPU', { renderBackend: 'cpu' }, 'cpu'],
    ]) {
      it(`changes the view once for one wheel step at the mouse in ${mode} mode on the ${backend}, and the point under the mouse stays`, async function () {
        await show(next, series, 2, options);
        activateZoom(toolGroup);

        const mouse = [260, 110];
        const underMouse = next.canvasToWorld(mouse);
        let cameraEvents = 0;

        next.element.addEventListener(Events.CAMERA_MODIFIED, () => {
          cameraEvents++;
        });

        await wheel(next.element, mouse, 1);

        const shown = next.worldToCanvas(underMouse);

        expect(next.getCurrentMode()).toBe(mode);
        expect(next.getRenderPlan()[0].draw).toBe(draw);
        expect(cameraEvents).toBe(1);
        expect(zoomPanOf(next).zoom).toBeGreaterThan(1.01);
        expect(shown[0]).toBeCloseTo(mouse[0], 3);
        expect(shown[1]).toBeCloseTo(mouse[1], 3);
      }, 15000);
    }

    for (const [backend, options, draw] of [
      ['GPU', {}, 'gpu'],
      ['CPU', { renderBackend: 'cpu' }, 'cpu'],
    ]) {
      it(`moves the picture of a view with a display area with the mouse of the pan tool, at the size that the display area gave, in ${mode} mode on the ${backend}`, async function () {
        await show(next, series, 2, options);

        const fit = pictureOf(next, series);

        next.setViewState({ displayArea: DISPLAY_AREA });
        await frames();
        activatePan(toolGroup);

        const area = pictureOf(next, series);
        const from = [150, 120];
        const to = [185, 95];
        const world = next.canvasToWorld(from);

        expect(next.getCurrentMode()).toBe(mode);
        expect(next.getRenderPlan()[0].draw).toBe(draw);
        expect(zoomPanOf(next).zoom).toBeCloseTo(1.25, 4);
        expect(area.size / fit.size).toBeCloseTo(1.25, 3);
        expectPresentationOnScreen(next, series, fit);

        await drag(next.element, from, to);

        const moved = next.worldToCanvas(world);
        const dragged = pictureOf(next, series);

        expect(moved[0]).toBeCloseTo(to[0], 0);
        expect(moved[1]).toBeCloseTo(to[1], 0);
        expect(dragged.a[0] - area.a[0]).toBeCloseTo(to[0] - from[0], 0);
        expect(dragged.a[1] - area.a[1]).toBeCloseTo(to[1] - from[1], 0);
        expect(dragged.size).toBeCloseTo(area.size, 3);
        expect(next.getViewState().displayArea).toBeUndefined();
        expect(zoomPanOf(next).zoom).toBeCloseTo(1.25, 4);
        expectPresentationOnScreen(next, series, fit);
      }, 15000);

      it(`grows the picture of a view with a display area by one wheel step of the zoom tool, and the point under the mouse stays, in ${mode} mode on the ${backend}`, async function () {
        await show(next, series, 2, options);

        const fit = pictureOf(next, series);

        next.setViewState({ displayArea: DISPLAY_AREA });
        await frames();
        activateZoom(toolGroup);

        const area = pictureOf(next, series);
        const mouse = [260, 110];
        const underMouse = next.canvasToWorld(mouse);
        const step = 12 / 11;

        expect(next.getCurrentMode()).toBe(mode);
        expect(next.getRenderPlan()[0].draw).toBe(draw);
        expect(area.size / fit.size).toBeCloseTo(1.25, 3);

        await wheel(next.element, mouse, 1);

        const shown = next.worldToCanvas(underMouse);
        const grown = pictureOf(next, series);

        expect(grown.size / area.size).toBeCloseTo(step, 3);
        expect(shown[0]).toBeCloseTo(mouse[0], 2);
        expect(shown[1]).toBeCloseTo(mouse[1], 2);
        expect(next.getViewState().displayArea).toBeUndefined();
        expect(zoomPanOf(next).zoom).toBeCloseTo(1.25 * step, 4);
        expectPresentationOnScreen(next, series, fit);
      }, 15000);
    }

    it(`moves the picture with the mouse of the pan tool after a zoom at the mouse of the zoom tool in ${mode} mode`, async function () {
      await show(next, series, 2);
      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: [{ mouseButton: MouseBindings.Wheel }],
      });
      activatePan(toolGroup);

      await wheel(next.element, [260, 110], 3);

      const from = [150, 120];
      const to = [185, 95];
      const world = next.canvasToWorld(from);

      await drag(next.element, from, to);

      const moved = next.worldToCanvas(world);

      expect(zoomPanOf(next).zoom).toBeGreaterThan(1.1);
      expect(moved[0]).toBeCloseTo(to[0], 0);
      expect(moved[1]).toBeCloseTo(to[1], 0);
    }, 15000);

    it(`keeps a stretch of the view through the wheel, a drag and the limits of the zoom tool in ${mode} mode`, async function () {
      await show(next, series, 2);
      next.setViewState({ scale: [1.5, 1] });
      activateZoom(toolGroup);

      const mouse = [260, 110];
      const underMouse = next.canvasToWorld(mouse);
      const scaleOf = () => viewportProjection.getFraming(next).scale;

      await wheel(next.element, mouse, 2);

      const shown = next.worldToCanvas(underMouse);

      expect(next.getCurrentMode()).toBe(mode);
      expect(scaleOf()[1]).toBeGreaterThan(1.01);
      expect(scaleOf()[0] / scaleOf()[1]).toBeCloseTo(1.5, 6);
      expect(shown[0]).toBeCloseTo(mouse[0], 3);
      expect(shown[1]).toBeCloseTo(mouse[1], 3);

      await drag(next.element, [200, 150], [200, 160]);

      expect(scaleOf()[0] / scaleOf()[1]).toBeCloseTo(1.5, 6);

      await wheel(next.element, CENTRE, 20);

      expect(scaleOf()[0]).toBeCloseTo(3, 4);
      expect(scaleOf()[1]).toBeCloseTo(2, 4);

      await wheel(next.element, CENTRE, 40, false);

      expect(scaleOf()[0]).toBeCloseTo(0.75, 4);
      expect(scaleOf()[1]).toBeCloseTo(0.5, 4);
    }, 15000);

    it(`moves the picture with the mouse of the pan tool in ${mode} mode, also after a zoom and a rotation`, async function () {
      await show(next, series, 2);
      activatePan(toolGroup);

      for (const presentation of [{}, { zoom: 1.7 }, { rotation: 90 }]) {
        next.setViewState(viewportProjection.withFraming(next, presentation));
        await frames();

        const from = [150, 120];
        const to = [185, 95];
        const world = next.canvasToWorld(from);

        await drag(next.element, from, to);

        const moved = next.worldToCanvas(world);

        expect(moved[0]).toBeCloseTo(to[0], 0);
        expect(moved[1]).toBeCloseTo(to[1], 0);
      }
    }, 15000);
  }
});
