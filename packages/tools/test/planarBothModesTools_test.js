import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { clipAndCacheSurfacesForViewport } from '../../polymorphic-segmentation/src/utilities/clipAndCacheSurfacesForViewport';
import {
  TILTED_PLANE,
  createLegacyViewport,
  createNextViewport,
  createSeries,
  dot,
  expectPointsClose,
  renderAndWait,
  showStack,
  showVolume,
  sliceNormal,
  storedValue,
  waitFor,
  worldOfVoxel,
} from '../../core/test/utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { ViewportType } = Enums;
const { utilities: toolsUtilities } = csTools3d;

const renderingEngineId = utilities.uuidv4();

/** A series thick enough for a line of sight: 30 mm along each axis or more. */
const THICK_SIZE = {
  rows: 40,
  columns: 48,
  slices: 30,
  columnSpacing: 1,
  rowSpacing: 1,
  sliceSpacing: 1,
};

/** The slice index of a world point of a series. */
function sliceOfWorld(series, point) {
  const normal = sliceNormal(series);

  return Math.round(
    (dot(point, normal) - dot(series.plane.origin, normal)) /
      series.size.sliceSpacing
  );
}

/**
 * A closed box surface of 12 triangles inside the default test series, as
 * the polymorphic segmentation takes surfaces: flat points and vtk.js cells.
 * It crosses the slices 2 to 5 of the series.
 */
function createBoxSurfaceInfo() {
  const [x0, x1, y0, y1, z0, z1] = [-4.5, 9.5, 10.5, 28.5, 22.5, 31.5];
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
    id: 'bothModesBoxSurface',
    points,
    polys: triangles.flatMap((triangle) => [3, ...triangle]),
    segmentIndex: 7,
  };
}

/**
 * The contours that the surface clipping cached for one viewport, by slice
 * index: the number of cells and the points rounded to 1e-3.
 */
function getCachedContoursBySlice(polyDataCache, viewportId) {
  const prefix = `${viewportId}-`;
  const contours = new Map();

  Array.from(polyDataCache.get(7) ?? [])
    .filter(([cacheId, result]) => cacheId.startsWith(prefix) && result)
    .forEach(([cacheId, result]) => {
      contours.set(Number(cacheId.slice(cacheId.lastIndexOf('-') + 1)), {
        numberOfCells: result.numberOfCells,
        points: Array.from(
          result.points,
          (value) => Math.round(value * 1000) / 1000
        ),
      });
    });

  return contours;
}

/** A criteria function that keeps the first point of the highest value. */
function createMaxCriteria() {
  let max = -Infinity;

  return (intensity, point) => {
    if (intensity > max) {
      max = intensity;

      return point;
    }
  };
}

describe('Tools on a direct next planar viewport in stack mode and in volume mode -- ', () => {
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

  describe('a point in the line of sight', () => {
    it('finds the brightest point of a volume in the line of sight, as on a legacy volume viewport', async function () {
      const series = await createSeries({ size: THICK_SIZE });
      const next = createNextViewport(renderingEngine, 'next');
      const legacy = createLegacyViewport(
        renderingEngine,
        'legacy',
        ViewportType.ORTHOGRAPHIC
      );

      await showVolume(next, series, 15);
      await legacy.setVolumes([{ volumeId: series.volumeId }]);
      await renderAndWait(legacy);

      const clicked = worldOfVoxel(series, [24, 20, 15]);
      const nextPoint = toolsUtilities.planar.getPointInLineOfSightWithCriteria(
        next,
        clicked,
        series.volumeId,
        createMaxCriteria()
      );
      const legacyPoint =
        toolsUtilities.planar.getPointInLineOfSightWithCriteria(
          legacy,
          clicked,
          series.volumeId,
          createMaxCriteria()
        );

      expect(sliceOfWorld(series, nextPoint)).toBe(19);
      expect(storedValue([24, 20, 19])).toBe(218);
      expectPointsClose(nextPoint.slice(0, 2), clicked.slice(0, 2));
      expectPointsClose(nextPoint, legacyPoint);
    });

    it('finds no point in a stack, whose one image is thinner than the margin of the search, and does not throw', async function () {
      const series = await createSeries({ size: THICK_SIZE });
      const stack = createNextViewport(renderingEngine, 'stack');

      await showStack(stack, series, 15);

      const clicked = worldOfVoxel(series, [24, 20, 15]);

      expect(
        toolsUtilities.planar.getPointsInLineOfSight(stack, clicked, {
          targetVolumeId: undefined,
          stepSize: 0.25,
        })
      ).toEqual([]);
      expect(
        toolsUtilities.planar.getPointInLineOfSightWithCriteria(
          stack,
          clicked,
          undefined,
          createMaxCriteria()
        )
      ).toBeUndefined();
    });
  });

  describe('a surface cut into the contours of each slice', () => {
    it('cuts a surface at each image of a stack, into the contours that a volume of the same series gives for the same slices', async function () {
      const series = await createSeries();
      const stack = createNextViewport(renderingEngine, 'clipStack');
      const volume = createNextViewport(renderingEngine, 'clipVolume');
      const surfacesInfo = [createBoxSurfaceInfo()];

      await showStack(stack, series, 3);
      await showVolume(volume, series, 3);
      await clipAndCacheSurfacesForViewport(surfacesInfo, stack);

      const polyDataCache = await clipAndCacheSurfacesForViewport(
        surfacesInfo,
        volume
      );
      const stackContours = getCachedContoursBySlice(polyDataCache, stack.id);
      const volumeContours = getCachedContoursBySlice(polyDataCache, volume.id);

      expect(Array.from(stackContours.keys()).sort()).toEqual([2, 3, 4, 5]);
      expect(Array.from(volumeContours.keys()).sort()).toEqual([2, 3, 4, 5]);
      [2, 3, 4, 5].forEach((k) => {
        const contour = stackContours.get(k);
        const sliceZ = worldOfVoxel(series, [0, 0, k])[2];

        expect(contour.numberOfCells).toBeGreaterThan(0);
        expect(contour.points.length).toBeGreaterThan(0);
        contour.points.forEach((value, index) => {
          if (index % 3 === 2) {
            expect(Math.abs(value - sliceZ)).toBeLessThanOrEqual(0.051);
          }
        });
        expect(contour).toEqual(volumeContours.get(7 - k));
      });
    });
  });

  describe('a jump to a world point', () => {
    [
      ['along the patient axes', undefined],
      ['on a tilted series', TILTED_PLANE],
    ].forEach(([name, plane]) => {
      it(`brings the slice of a world point on display, for a stack and for a volume ${name}`, async function () {
        const series = await createSeries({ plane });
        const stack = createNextViewport(renderingEngine, 'stack');
        const volume = createNextViewport(renderingEngine, 'volume');

        await showStack(stack, series, 1);
        await showVolume(volume, series, 1);

        const point = worldOfVoxel(series, [10, 8, 5]);

        expect(stack.getCurrentImageId()).toBe(series.imageIds[1]);
        expect(volume.getCurrentImageId()).toBe(series.imageIds[1]);
        expect(toolsUtilities.navigatePlanarViewportToPoint(stack, point)).toBe(
          true
        );
        expect(
          toolsUtilities.navigatePlanarViewportToPoint(volume, point)
        ).toBe(true);
        await waitFor(() => stack.getCurrentImageId() === series.imageIds[5]);
        await renderAndWait(stack);
        await renderAndWait(volume);

        expect(stack.getCurrentImageId()).toBe(series.imageIds[5]);
        expect(volume.getCurrentImageId()).toBe(series.imageIds[5]);
        expect(
          sliceOfWorld(series, volume.getViewReference().cameraFocalPoint)
        ).toBe(5);
      });
    });

    it('goes to the closest slice for a point beside the data, and for a point past the last slice a stack goes to its last image while a volume stays inside its slices, without a throw', async function () {
      const series = await createSeries();
      const stack = createNextViewport(renderingEngine, 'stack');
      const volume = createNextViewport(renderingEngine, 'volume');

      await showStack(stack, series, 1);
      await showVolume(volume, series, 1);

      const beside = worldOfVoxel(series, [500, -300, 5]);
      const past = worldOfVoxel(series, [10, 8, 40]);

      expect(toolsUtilities.navigatePlanarViewportToPoint(stack, beside)).toBe(
        true
      );
      expect(toolsUtilities.navigatePlanarViewportToPoint(volume, beside)).toBe(
        true
      );
      await waitFor(() => stack.getCurrentImageId() === series.imageIds[5]);
      await renderAndWait(stack);
      await renderAndWait(volume);

      expect(stack.getCurrentImageId()).toBe(series.imageIds[5]);
      expect(volume.getCurrentImageId()).toBe(series.imageIds[5]);

      expect(() =>
        toolsUtilities.navigatePlanarViewportToPoint(stack, past)
      ).not.toThrow();
      expect(() =>
        toolsUtilities.navigatePlanarViewportToPoint(volume, past)
      ).not.toThrow();
      await waitFor(() => stack.getCurrentImageId() === series.imageIds[7]);
      await renderAndWait(stack);
      await renderAndWait(volume);

      expect(stack.getCurrentImageId()).toBe(series.imageIds[7]);
      expect(volume.getCurrentImageId()).toBe(series.imageIds[7]);
      expect(
        sliceOfWorld(series, volume.getViewReference().cameraFocalPoint)
      ).toBe(7);
    });

    it('gives false and does not throw for a viewport with nothing mounted and for a legacy viewport', async function () {
      const series = await createSeries();
      const empty = createNextViewport(renderingEngine, 'empty');
      const legacy = createLegacyViewport(
        renderingEngine,
        'legacy',
        ViewportType.STACK
      );

      await legacy.setStack(series.imageIds, 1);
      await renderAndWait(legacy);

      const point = worldOfVoxel(series, [10, 8, 5]);

      expect(toolsUtilities.navigatePlanarViewportToPoint(empty, point)).toBe(
        false
      );
      expect(toolsUtilities.navigatePlanarViewportToPoint(legacy, point)).toBe(
        false
      );
      expect(legacy.getCurrentImageId()).toBe(series.imageIds[1]);
    });
  });
});
