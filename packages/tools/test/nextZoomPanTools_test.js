import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  showStack,
  showVolume,
} from '../../core/test/utils/planarSeriesBothModes';

const { Enums, utilities, viewportProjection } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const {
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
    viewportType: ViewportType.VOLUME_3D_NEXT,
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

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { renderMode: 'vtkVolume3d' },
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

/** The zoom and the pan of a next viewport from the projection service. */
function zoomPanOf(viewport) {
  return viewportProjection.getPresentation(viewport, {
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
      viewportProjection.withPresentation(planar, { zoom: 2, pan: [15, -10] })
    );
    await frames(3);

    const shift = shiftOf(next, fitCamera.focalPoint);

    expect(zoomPanOf(planar).zoom).toBeCloseTo(2, 4);
    expect(zoomAgainstFit(next, fitCamera)).toBeCloseTo(2, 4);
    expect(shift[0]).toBeCloseTo(30, 1);
    expect(shift[1]).toBeCloseTo(-20, 1);
  }, 15000);

  it('gives the window of a planar source to the 3D target of a VOI synchronizer', async function () {
    const synchronizer = synchronizers.createVOISynchronizer('voiNext', {
      syncInvertState: false,
      syncColormap: false,
    });
    const voiRange = { lower: 12, upper: 345 };

    synchronizer.add({ renderingEngineId, viewportId: planar.id });
    synchronizer.add({ renderingEngineId, viewportId: next.id });

    planar.setDisplaySetPresentation({ voiRange });
    await frames(3);

    expect(
      planar.getDisplaySetPresentation(`volume:${planar.id}`).voiRange
    ).toEqual(voiRange);
    expect(next.getDisplaySetPresentation(displaySetId)?.voiRange).toEqual(
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

    it(`moves the picture with the mouse of the pan tool in ${mode} mode, also after a zoom and a rotation`, async function () {
      await show(next, series, 2);
      activatePan(toolGroup);

      for (const presentation of [{}, { zoom: 1.7 }, { rotation: 90 }]) {
        next.setViewState(
          viewportProjection.withPresentation(next, presentation)
        );
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
