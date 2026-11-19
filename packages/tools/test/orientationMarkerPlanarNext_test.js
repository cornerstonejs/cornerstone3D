import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  waitFor,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, Enums } = cornerstone3D;
const { OrientationAxis } = Enums;
const { OrientationMarkerTool, ToolGroupManager } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'orientationMarkerPlanarNext';
const secondToolGroupId = 'orientationMarkerPlanarNextSecond';
const toolName = OrientationMarkerTool.toolName;

/** The slice of the test series that the viewport shows. */
const SLICE = 3;

/**
 * The side of the square in the bottom right corner of the canvas where the
 * marker draws, in CSS pixels: the smallest size of the marker of the tool.
 */
const CORNER = 100;

/**
 * The least number of pixels of the colour of a face of the cube that the
 * corner shows when the face looks at the viewer.
 */
const FACE_PIXELS = 400;

const MODES = {
  stack: showStack,
  volume: showVolume,
};

/**
 * The pixels of the bottom right corner of the canvas of the viewport with
 * the colour of a face of the annotated cube of the tool: blue for the
 * superior and inferior faces, yellow for the left and right faces, cyan for
 * the anterior and posterior faces.
 */
function cornerFaceColors(viewport) {
  const canvas = viewport.getCanvas();
  const scale = canvas.width / canvas.clientWidth;
  const side = Math.round(CORNER * scale);
  const { data } = canvas
    .getContext('2d')
    .getImageData(canvas.width - side, canvas.height - side, side, side);
  const counts = { blue: 0, yellow: 0, cyan: 0 };

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];

    if (b > 150 && r < 80 && g < 80) {
      counts.blue += 1;
    } else if (r > 150 && g > 150 && b < 80) {
      counts.yellow += 1;
    } else if (g > 150 && b > 150 && r < 80) {
      counts.cyan += 1;
    }
  }

  return counts;
}

/**
 * Makes a planar viewport in the tool group and shows the series on it.
 * `options` are those of the display set.
 */
async function createViewport(renderingEngine, mode, options = {}) {
  const series = await createSeries();
  const viewport = createNextViewport(renderingEngine, `marker${mode}`);

  ToolGroupManager.getToolGroup(toolGroupId).addViewport(
    viewport.id,
    renderingEngineId
  );
  await MODES[mode](viewport, series, SLICE, options);

  return viewport;
}

/** Enables the tool and resolves when the viewport has drawn its marker. */
async function showMarker(viewport) {
  ToolGroupManager.getToolGroup(toolGroupId).setToolEnabled(toolName);
  await waitFor(
    () =>
      typeof viewport.getWidgets === 'function' &&
      viewport.getWidgets().length === 1
  );
  await renderAndWait(viewport);
}

/** The direction in which the camera of the marker looks. */
function markerViewDirection(widget) {
  return widget.getRenderer().getActiveCamera().getDirectionOfProjection();
}

function expectVectorsToBeClose(actual, expected) {
  [0, 1, 2].forEach((axis) => {
    expect(actual[axis]).toBeCloseTo(expected[axis], 3);
  });
}

describe('The orientation marker on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [OrientationMarkerTool],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId, secondToolGroupId],
    });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  Object.keys(MODES).forEach((mode) => {
    it(`keeps the marker of the tool as a widget and draws it in the corner, in ${mode} mode`, async function () {
      const viewport = await createViewport(renderingEngine, mode);

      expect(cornerFaceColors(viewport).blue).toBe(0);

      await showMarker(viewport);

      const [widget] = viewport.getWidgets();
      const marker =
        ToolGroupManager.getToolGroup(toolGroupId).getToolInstance(toolName)
          .orientationMarkers[viewport.id];

      expect(viewport.getCurrentMode()).toBe(mode);
      expect(widget).toBe(marker.orientationWidget);
      expect(widget.getEnabled()).toBe(true);
      expect(widget.getParentRenderer()).toBe(viewport.getRenderer());
      expect(cornerFaceColors(viewport).blue).toBeGreaterThan(FACE_PIXELS);

      viewport.removeWidgets();

      expect(widget.getEnabled()).toBe(false);
    });
  });

  it('turns the marker with the orientation of the viewport, in volume mode', async function () {
    const viewport = await createViewport(renderingEngine, 'volume');

    await showMarker(viewport);

    const [widget] = viewport.getWidgets();
    const axial = cornerFaceColors(viewport);

    expectVectorsToBeClose(
      markerViewDirection(widget),
      viewport.getRenderer().getActiveCamera().getDirectionOfProjection()
    );
    expect(axial.blue).toBeGreaterThan(FACE_PIXELS);
    expect(axial.yellow).toBeLessThan(FACE_PIXELS / 10);

    viewport.setOrientation(OrientationAxis.SAGITTAL);
    await renderAndWait(viewport);

    const sagittal = cornerFaceColors(viewport);
    const { viewPlaneNormal } = viewport.getViewReference();

    expectVectorsToBeClose(
      markerViewDirection(widget),
      viewPlaneNormal.map((value) => -value)
    );
    expect(Math.abs(viewPlaneNormal[0])).toBeCloseTo(1, 3);
    expect(sagittal.yellow).toBeGreaterThan(FACE_PIXELS);
    expect(sagittal.blue).toBeLessThan(FACE_PIXELS / 10);
  });

  it('warns once and does not throw when the slice is drawn on the CPU, where the marker does not show', async function () {
    const viewport = await createViewport(renderingEngine, 'stack', {
      renderBackend: 'cpu',
    });
    const log = utilities.logger.coreLog.getLogger(
      'RenderingEngine',
      'PlanarViewport'
    );

    spyOn(log, 'warn');
    await showMarker(viewport);
    await renderAndWait(viewport);

    const warnings = log.warn.calls
      .allArgs()
      .map((args) => args.join(' '))
      .filter((message) => message.includes('vtk.js'));

    expect(viewport.getRenderPlan()[0].renderMode).toMatch(/^cpu/);
    expect(viewport.getWidgets().length).toBe(1);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('CPU');
    expect(warnings[0]).toContain('1 widget(s)');
    expect(cornerFaceColors(viewport).blue).toBe(0);
  });

  it('keeps one marker for each viewport when two tool groups have the tool, each turned as its viewport', async function () {
    const series = await createSeries();
    const axial = createNextViewport(renderingEngine, 'markerAxial');
    const sagittal = createNextViewport(renderingEngine, 'markerSagittal');
    const secondToolGroup = ToolGroupManager.createToolGroup(secondToolGroupId);

    secondToolGroup.addTool(toolName);
    ToolGroupManager.getToolGroup(toolGroupId).addViewport(
      axial.id,
      renderingEngineId
    );
    secondToolGroup.addViewport(sagittal.id, renderingEngineId);
    await showVolume(axial, series, SLICE);
    await showVolume(sagittal, series, SLICE, {
      orientation: OrientationAxis.SAGITTAL,
    });

    ToolGroupManager.getToolGroup(toolGroupId).setToolEnabled(toolName);
    secondToolGroup.setToolEnabled(toolName);
    await waitFor(
      () =>
        typeof axial.getWidgets === 'function' &&
        axial.getWidgets().length === 1 &&
        sagittal.getWidgets().length === 1
    );
    await renderAndWait(axial);
    await renderAndWait(sagittal);

    const renderWindow = axial.getRenderer().getRenderWindow();
    const markerRenderers = renderWindow
      .getRenderers()
      .filter(
        (renderer) =>
          renderer.getLayer() > 0 &&
          renderer.getDraw() !== undefined &&
          renderer.getViewProps().length > 0
      );
    const firstInstance =
      ToolGroupManager.getToolGroup(toolGroupId).getToolInstance(toolName);
    const secondInstance = secondToolGroup.getToolInstance(toolName);

    expect(markerRenderers.length).toBe(2);
    expect(Object.keys(firstInstance.orientationMarkers)).toEqual([axial.id]);
    expect(Object.keys(secondInstance.orientationMarkers)).toEqual([
      sagittal.id,
    ]);
    expect(cornerFaceColors(axial).blue).toBeGreaterThan(FACE_PIXELS);
    expect(cornerFaceColors(axial).yellow).toBeLessThan(FACE_PIXELS / 10);
    expect(cornerFaceColors(sagittal).yellow).toBeGreaterThan(FACE_PIXELS);
    expect(cornerFaceColors(sagittal).blue).toBeLessThan(FACE_PIXELS / 10);
  });

  it('removes the marker when the tool is disabled', async function () {
    const viewport = await createViewport(renderingEngine, 'stack');

    await showMarker(viewport);

    const [widget] = viewport.getWidgets();

    ToolGroupManager.getToolGroup(toolGroupId).setToolDisabled(toolName);
    await renderAndWait(viewport);

    expect(widget.isDeleted()).toBe(true);
    expect(cornerFaceColors(viewport).blue).toBe(0);
  });
});
