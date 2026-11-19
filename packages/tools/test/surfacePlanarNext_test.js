import * as cornerstone3D from '@cornerstonejs/core';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { getConfig, setConfig } from '../src/config';
import { getSurfaceActorEntry } from '../src/stateManagement/segmentation/helpers';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  waitFor,
  worldOfVoxel,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, Enums, geometryLoader, cache } = cornerstone3D;
const { GeometryType } = Enums;
const { segmentation, Enums: csToolsEnums } = csTools3d;
const { Surface } = csToolsEnums.SegmentationRepresentations;

const renderingEngineId = utilities.uuidv4();
const segmentationId = 'surfacePlanarNextSegmentation';
const geometryId = 'surfacePlanarNextSphere';

/** A series of 40 by 40 by 20 voxels of 1 mm, from z = 20 to z = 39. */
const SIZE = {
  rows: 40,
  columns: 40,
  slices: 20,
  columnSpacing: 1,
  rowSpacing: 1,
  sliceSpacing: 1,
};

/** The centre and the radius of the sphere of the segmentation, in mm. */
const CENTER = [10, 25, 30];
const RADIUS = 8;

/** A channel that differs by more than this marks a pixel of the surface. */
const CHANNEL_THRESHOLD = 40;

/**
 * The least number of pixels that the cut of the sphere shows on a slice
 * that cuts it. The cut is the strip of the surface between two clipping
 * planes 0.05 mm on each side of the slice, as on the legacy volume
 * viewport, so it is a thin and broken outline.
 */
const MIN_CUT_PIXELS = 20;

/** The share by which the area of a disk of the stack may differ. */
const AREA_TOLERANCE = 0.2;

/**
 * The colour of the actor of the surface of segment 1 that
 * `getSurfaceActorEntry` gave on the legacy volume viewport and on the legacy
 * stack viewport, read on commit 58914567b: the colour of the segment, 221,
 * 84, 84, over 255. The entry there had a string uid, the representation UID
 * of the segment and the actor that the renderer drew. It stayed, with a
 * hidden actor, while the segment was hidden, and it was undefined for a
 * segment without a surface and after the representation was removed.
 */
const LEGACY_SEGMENT_1_COLOR = [
  0.8666666666666667, 0.32941176470588235, 0.32941176470588235,
];

/** The image indexes that the tests visit, by mode. */
const VISITS = {
  volume: [10, 14, 3, 19, 0, 10],
  stack: [10, 15, 0, 19, 4, 10],
};

/**
 * Adds a segmentation whose Surface representation is a closed sphere of
 * radius `RADIUS` around `CENTER`, in the frame of the test series.
 */
function addSphereSegmentation() {
  const sphere = vtkSphereSource.newInstance({
    center: CENTER,
    radius: RADIUS,
    phiResolution: 24,
    thetaResolution: 24,
  });

  sphere.update();

  const polyData = sphere.getOutputData();

  geometryLoader.createAndCacheGeometry(geometryId, {
    type: GeometryType.SURFACE,
    geometryData: {
      id: geometryId,
      color: [255, 0, 0],
      frameOfReferenceUID: 'bothModesFrame',
      points: Array.from(polyData.getPoints().getData()),
      polys: Array.from(polyData.getPolys().getData()),
      segmentIndex: 1,
    },
  });
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: Surface,
        data: { geometryIds: new Map([[1, geometryId]]) },
      },
    },
  ]);
}

/** The props of the renderer that are not the actors of a display set. */
function surfaceProps(viewport) {
  const ownActors = viewport.getActors().map(({ actor }) => actor);

  return viewport
    .getRenderer()
    .getActors()
    .filter((actor) => !ownActors.includes(actor));
}

/** The pixels of the canvas of the viewport. */
function pictureOf(viewport) {
  const canvas = viewport.getCanvas();

  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    .data;
}

/**
 * The pixels of the canvas that differ from a picture taken before, as
 * points in CSS pixels of the canvas.
 */
function changedPixels(viewport, before) {
  const canvas = viewport.getCanvas();
  const scale = canvas.width / canvas.clientWidth;
  const now = pictureOf(viewport);
  const points = [];

  for (let i = 0; i < now.length; i += 4) {
    if (
      Math.abs(now[i] - before[i]) > CHANNEL_THRESHOLD ||
      Math.abs(now[i + 1] - before[i + 1]) > CHANNEL_THRESHOLD ||
      Math.abs(now[i + 2] - before[i + 2]) > CHANNEL_THRESHOLD
    ) {
      const pixel = i / 4;

      points.push([
        ((pixel % canvas.width) + 0.5) / scale,
        (Math.floor(pixel / canvas.width) + 0.5) / scale,
      ]);
    }
  }

  return { points, scale };
}

/**
 * The height of the centre of the sphere above the slice on display, toward
 * the viewer: the view plane normal points from the slice to the viewer.
 */
function heightOfCenter(viewport) {
  const { cameraFocalPoint, viewPlaneNormal } = viewport.getViewReference();

  return [0, 1, 2].reduce(
    (sum, axis) =>
      sum + (CENTER[axis] - cameraFocalPoint[axis]) * viewPlaneNormal[axis],
    0
  );
}

/** The CSS pixels of the canvas for one millimetre of the slice. */
function pixelsPerMillimetre(viewport, series) {
  const [x0, y0] = viewport.worldToCanvas(worldOfVoxel(series, [0, 0, 0]));
  const [x1, y1] = viewport.worldToCanvas(worldOfVoxel(series, [10, 0, 0]));

  return Math.hypot(x1 - x0, y1 - y0) / 10;
}

/** Shows the image of an index and resolves when it is drawn. */
async function moveTo(viewport, imageIdIndex) {
  await viewport.setImageIdIndex(imageIdIndex);
  await waitFor(() => viewport.getCurrentImageIdIndex() === imageIdIndex);
  await renderAndWait(viewport);
}

/** Takes a picture of each slice that the test visits, before the surface. */
async function picturesBefore(viewport, visits) {
  const pictures = {};

  for (const imageIdIndex of visits) {
    await moveTo(viewport, imageIdIndex);
    pictures[imageIdIndex] = pictureOf(viewport);
  }

  return pictures;
}

/** Shows the Surface representation on the viewport and waits for its prop. */
async function showSurface(viewport) {
  addSphereSegmentation();
  segmentation.addSegmentationRepresentations(viewport.id, [
    { segmentationId, type: Surface },
  ]);
  await waitFor(() => surfaceProps(viewport).length === 1);
  await renderAndWait(viewport);
}

/**
 * A polySeg add-on that converts nothing. The default listener of a Surface
 * representation asks the add-on for an update of the surface data.
 */
function createPolySegStandIn() {
  return {
    init: () => undefined,
    canComputeRequestedRepresentation: () => false,
    updateSurfaceData: () => Promise.resolve(),
  };
}

describe('A Surface representation on a direct next planar viewport -- ', () => {
  let renderingEngine;
  let config;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
    config = getConfig();
    setConfig({ ...config, addons: { polySeg: createPolySegStandIn() } });
  });

  afterEach(function () {
    setConfig(config);
    if (cache.getGeometry(geometryId)) {
      cache.removeGeometryLoadObject(geometryId);
    }
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  it('draws the cut of the surface on a slice that cuts it and nothing on a slice that does not, at each scroll, in volume mode', async function () {
    const series = await createSeries({
      id: 'surfacePlanarVolume',
      size: SIZE,
    });
    const viewport = createNextViewport(renderingEngine, 'surfaceVolume');

    await showVolume(viewport, series, 10);

    const visits = VISITS.volume;
    const before = await picturesBefore(viewport, visits);
    let cuts = 0;
    let misses = 0;

    await showSurface(viewport);

    expect(viewport.getCurrentMode()).toBe('volume');

    for (const imageIdIndex of visits) {
      await moveTo(viewport, imageIdIndex);

      const height = heightOfCenter(viewport);
      const { points } = changedPixels(viewport, before[imageIdIndex]);

      if (Math.abs(height) > RADIUS + 0.5) {
        misses += 1;
        expect(points.length).toBe(0);
        continue;
      }

      if (Math.abs(height) > RADIUS - 0.5) {
        continue;
      }

      cuts += 1;

      const cutRadius = Math.sqrt(RADIUS * RADIUS - height * height);
      const millimetre = pixelsPerMillimetre(viewport, series);
      const [cx, cy] = viewport.worldToCanvas(CENTER);
      const radii = points.map(
        ([x, y]) => Math.hypot(x - cx, y - cy) / millimetre
      );

      expect(points.length).toBeGreaterThan(MIN_CUT_PIXELS);
      expect(Math.min(...radii)).toBeGreaterThan(cutRadius - 1.5);
      expect(Math.max(...radii)).toBeLessThan(cutRadius + 1);
    }

    expect(cuts).toBeGreaterThanOrEqual(3);
    expect(misses).toBeGreaterThanOrEqual(2);
  });

  it('draws the whole surface where it stands toward the viewer and hides it behind the image, at each scroll, in stack mode', async function () {
    const series = await createSeries({ id: 'surfacePlanarStack', size: SIZE });
    const viewport = createNextViewport(renderingEngine, 'surfaceStack');

    await showStack(viewport, series, 10);

    const visits = VISITS.stack;
    const before = await picturesBefore(viewport, visits);
    let shown = 0;
    let hidden = 0;

    await showSurface(viewport);

    expect(viewport.getCurrentMode()).toBe('stack');

    for (const imageIdIndex of visits) {
      await moveTo(viewport, imageIdIndex);

      const height = heightOfCenter(viewport);
      const { points, scale } = changedPixels(viewport, before[imageIdIndex]);
      const diskRadius =
        height >= 0
          ? RADIUS
          : height > -RADIUS
            ? Math.sqrt(RADIUS * RADIUS - height * height)
            : 0;

      if (!diskRadius) {
        hidden += 1;
        expect(points.length).toBe(0);
        continue;
      }

      shown += 1;

      const radiusInPixels =
        diskRadius * pixelsPerMillimetre(viewport, series) * scale;
      const area = Math.PI * radiusInPixels * radiusInPixels;
      const [cx, cy] = viewport.worldToCanvas(CENTER);
      const centre = points
        .reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0])
        .map((sum) => sum / points.length);

      expect(points.length).toBeGreaterThan(area * (1 - AREA_TOLERANCE));
      expect(points.length).toBeLessThan(area * (1 + AREA_TOLERANCE));
      expect(Math.hypot(centre[0] - cx, centre[1] - cy)).toBeLessThan(2);
    }

    expect(shown).toBeGreaterThanOrEqual(3);
    expect(hidden).toBeGreaterThanOrEqual(1);
  });

  it('takes the surface out of the renderer when the representation is removed', async function () {
    const series = await createSeries({
      id: 'surfacePlanarRemove',
      size: SIZE,
    });
    const viewport = createNextViewport(renderingEngine, 'surfaceRemove');

    await showVolume(viewport, series, 10);

    const [before] = Object.values(await picturesBefore(viewport, [10]));

    await showSurface(viewport);

    expect(changedPixels(viewport, before).points.length).toBeGreaterThan(
      MIN_CUT_PIXELS
    );

    segmentation.removeSegmentationRepresentations(viewport.id, {
      segmentationId,
    });
    await waitFor(() => surfaceProps(viewport).length === 0);
    await renderAndWait(viewport);

    expect(changedPixels(viewport, before).points.length).toBe(0);
  });

  for (const [mode, show] of [
    ['volume', showVolume],
    ['stack', showStack],
  ]) {
    it(`finds the surface of a segment with getSurfaceActorEntry in ${mode} mode, as on the legacy ${mode} viewport`, async function () {
      const series = await createSeries({
        id: `surfacePlanarEntry-${mode}`,
        size: SIZE,
      });
      const viewport = createNextViewport(renderingEngine, `entry-${mode}`);

      await show(viewport, series, 10);
      await showSurface(viewport);

      const entry = getSurfaceActorEntry(viewport.id, segmentationId, 1);

      expect(viewport.getCurrentMode()).toBe(mode);
      expect(typeof entry.uid).toBe('string');
      expect(entry.representationUID).toBe(`${segmentationId}-Surface-1`);
      expect(entry.actor).toBe(surfaceProps(viewport)[0]);
      expect(viewport.getRenderer().getActors()).toContain(entry.actor);
      expect(entry.actor.getVisibility()).toBe(true);
      expect(entry.actor.getProperty().getColor()).toEqual(
        LEGACY_SEGMENT_1_COLOR
      );
      expect(
        getSurfaceActorEntry(viewport.id, segmentationId, 2)
      ).toBeUndefined();

      segmentation.config.visibility.setSegmentIndexVisibility(
        viewport.id,
        { segmentationId, type: Surface },
        1,
        false
      );
      await waitFor(() => !entry.actor.getVisibility());

      const hiddenEntry = getSurfaceActorEntry(viewport.id, segmentationId, 1);

      expect(hiddenEntry.actor).toBe(entry.actor);
      expect(hiddenEntry.actor.getVisibility()).toBe(false);

      segmentation.removeSegmentationRepresentations(viewport.id, {
        segmentationId,
      });
      await waitFor(() => surfaceProps(viewport).length === 0);

      expect(
        getSurfaceActorEntry(viewport.id, segmentationId, 1)
      ).toBeUndefined();
    });
  }
});
