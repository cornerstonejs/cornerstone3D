import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { utilities, viewportProjection } = cornerstone3D;

const renderingEngineId = utilities.uuidv4();

/** The slice of the test series that the viewport shows. */
const SLICE = 3;

/** The radius of the sphere of the application, in millimetres. */
const RADIUS = 4;

/**
 * The share by which a count of red pixels may differ from the area of the
 * disk of the sphere: the edge of a disk of 30 pixels is drawn in steps.
 */
const AREA_TOLERANCE = 0.15;

const MODES = {
  stack: showStack,
  volume: showVolume,
};

/**
 * A sphere of the application, drawn in pure red without light, so each of
 * its pixels is red wherever it faces.
 */
function createSphereActor(center, radius = RADIUS) {
  const source = vtkSphereSource.newInstance({
    center,
    radius,
    phiResolution: 32,
    thetaResolution: 32,
  });
  const mapper = vtkMapper.newInstance();
  const actor = vtkActor.newInstance();

  mapper.setInputConnection(source.getOutputPort());
  actor.setMapper(mapper);
  actor.getProperty().setColor(1, 0, 0);
  actor.getProperty().setLighting(false);

  return actor;
}

/**
 * The red pixels of the canvas of the viewport: their number, and their
 * centre in CSS pixels of the canvas.
 */
function redPixels(viewport) {
  const canvas = viewport.getCanvas();
  const scale = canvas.width / canvas.clientWidth;
  const { data, width, height } = canvas
    .getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) {
        count += 1;
        sumX += x;
        sumY += y;
      }
    }
  }

  return {
    count,
    scale,
    centre: count
      ? [(sumX / count + 0.5) / scale, (sumY / count + 0.5) / scale]
      : undefined,
  };
}

/** The colour of the canvas of the viewport at a point in CSS pixels. */
function colorAt(viewport, [x, y]) {
  const canvas = viewport.getCanvas();
  const scale = canvas.width / canvas.clientWidth;

  return Array.from(
    canvas
      .getContext('2d')
      .getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1)
      .data.slice(0, 3)
  );
}

/** The CSS pixels of the canvas for one millimetre of the slice. */
function pixelsPerMillimetre(viewport, series) {
  const [x0, y0] = viewport.worldToCanvas(worldOfVoxel(series, [0, 0, SLICE]));
  const [x1, y1] = viewport.worldToCanvas(worldOfVoxel(series, [10, 0, SLICE]));

  return Math.hypot(x1 - x0, y1 - y0) / 10;
}

/** The number of device pixels of the disk of a sphere of `radius`. */
function diskArea(viewport, series, scale, radius = RADIUS) {
  const radiusInPixels = radius * pixelsPerMillimetre(viewport, series) * scale;

  return Math.PI * radiusInPixels * radiusInPixels;
}

function expectArea(count, area) {
  expect(count).toBeGreaterThan(area * (1 - AREA_TOLERANCE));
  expect(count).toBeLessThan(area * (1 + AREA_TOLERANCE));
}

/** The world point at the centre of the slice on display. */
function sliceCentre(series) {
  return worldOfVoxel(series, [
    (series.size.columns - 1) / 2,
    (series.size.rows - 1) / 2,
    SLICE,
  ]);
}

/** A world point moved along the normal of the view, toward the viewer. */
function towardViewer(viewport, point, distance) {
  const { viewPlaneNormal } = viewport.getViewReference();

  return point.map((value, axis) => value + distance * viewPlaneNormal[axis]);
}

describe('A vtk.js prop of the application in a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  Object.entries(MODES).forEach(([mode, show]) => {
    it(`draws a prop added to the renderer with the slice, and the prop goes when the application removes it, in ${mode} mode`, async function () {
      const series = await createSeries();
      const viewport = createNextViewport(renderingEngine, `props${mode}`);

      await show(viewport, series, SLICE);

      const centre = sliceCentre(series);
      const actor = createSphereActor(centre);
      const renderer = viewport.getRenderer();

      renderer.addActor(actor);
      await renderAndWait(viewport);

      const shown = redPixels(viewport);
      const [expectedX, expectedY] = viewport.worldToCanvas(centre);
      const slicePoint = viewport.worldToCanvas(
        worldOfVoxel(series, [3, 3, SLICE])
      );
      const [r, g, b] = colorAt(viewport, slicePoint);

      expect(viewport.getCurrentMode()).toBe(mode);
      expect(renderer.getActors()).toContain(actor);
      expectArea(shown.count, diskArea(viewport, series, shown.scale));
      expect(shown.centre[0]).toBeCloseTo(expectedX, 0);
      expect(shown.centre[1]).toBeCloseTo(expectedY, 0);
      expect(r).toBeGreaterThan(0);
      expect(g).toBe(r);
      expect(b).toBe(r);

      renderer.removeActor(actor);
      await renderAndWait(viewport);

      expect(redPixels(viewport).count).toBe(0);
      expect(colorAt(viewport, slicePoint)).toEqual([r, g, b]);
    });

    it(`keeps the prop in view and in place on a zoom and a pan, in ${mode} mode`, async function () {
      const series = await createSeries();
      const viewport = createNextViewport(renderingEngine, `props${mode}`);

      await show(viewport, series, SLICE);

      const centre = sliceCentre(series);

      viewport.getRenderer().addActor(createSphereActor(centre));
      await renderAndWait(viewport);

      const before = redPixels(viewport);

      viewport.setViewState(
        viewportProjection.withPresentation(viewport, { zoom: 2 })
      );
      await renderAndWait(viewport);

      const zoomed = redPixels(viewport);

      expect(viewportProjection.getPresentation(viewport).zoom).toBeCloseTo(
        2,
        6
      );
      expectArea(zoomed.count, before.count * 4);
      expectArea(zoomed.count, diskArea(viewport, series, zoomed.scale));

      viewport.setViewState(
        viewportProjection.withPresentation(viewport, { pan: [40, -25] })
      );
      await renderAndWait(viewport);

      const panned = redPixels(viewport);
      const [expectedX, expectedY] = viewport.worldToCanvas(centre);

      expect(
        Math.hypot(...zoomed.centre.map((v, i) => v - panned.centre[i]))
      ).toBeGreaterThan(20);
      expectArea(panned.count, zoomed.count);
      expect(panned.centre[0]).toBeCloseTo(expectedX, 0);
      expect(panned.centre[1]).toBeCloseTo(expectedY, 0);
    });

    it(`shows a prop whole that stands far toward the viewer, and hides a prop behind the slice, in ${mode} mode`, async function () {
      const series = await createSeries();
      const viewport = createNextViewport(renderingEngine, `props${mode}`);

      await show(viewport, series, SLICE);

      const front = towardViewer(viewport, sliceCentre(series), 40);
      const frontActor = createSphereActor(front);

      viewport.getRenderer().addActor(frontActor);
      await renderAndWait(viewport);

      const shown = redPixels(viewport);
      const [expectedX, expectedY] = viewport.worldToCanvas(front);

      expectArea(shown.count, diskArea(viewport, series, shown.scale));
      expect(shown.centre[0]).toBeCloseTo(expectedX, 0);
      expect(shown.centre[1]).toBeCloseTo(expectedY, 0);

      viewport.getRenderer().removeActor(frontActor);
      viewport
        .getRenderer()
        .addActor(
          createSphereActor(towardViewer(viewport, sliceCentre(series), -20))
        );
      await renderAndWait(viewport);

      expect(redPixels(viewport).count).toBe(0);
    });

    it(`warns once and does not throw when the slice is drawn on the CPU, in ${mode} mode`, async function () {
      const series = await createSeries();
      const viewport = createNextViewport(renderingEngine, `props${mode}`);
      const log = utilities.logger.coreLog.getLogger(
        'RenderingEngine',
        'PlanarViewport'
      );

      await show(viewport, series, SLICE, { renderBackend: 'cpu' });
      spyOn(log, 'warn');

      viewport.getRenderer().addActor(createSphereActor(sliceCentre(series)));
      await renderAndWait(viewport);
      await renderAndWait(viewport);

      const warnings = log.warn.calls
        .allArgs()
        .map((args) => args.join(' '))
        .filter((message) => message.includes('vtk.js'));

      expect(viewport.getRenderPlan()[0].renderMode).toMatch(/^cpu/);
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('CPU');
      expect(warnings[0]).toContain(viewport.id);
      expect(redPixels(viewport).count).toBe(0);
    });
  });
});
