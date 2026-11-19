import { setFlagsFromString } from 'v8';
import { runInNewContext } from 'vm';
import { clipAndCacheSurfacesForViewport } from './clipAndCacheSurfacesForViewport';
import { extractContourData } from '../Contour/utils/extractContourData';

setFlagsFromString('--expose_gc');

/** The garbage collector of the engine, which a test may run. */
const collectGarbage = runInNewContext('gc') as () => void;

/**
 * A stand-in for the polySeg worker. `getSurfacesAABBs` gives each surface
 * the box of its points, and `cutSurfacesIntoPlanes` cuts every surface at
 * every plane into one contour whose first point names the surface, its slice
 * and the box that it was given.
 */
const mockWorker = {
  aabbRequests: [] as string[][],
  executeTask: jest.fn(async (_name, task, args, options) => {
    if (task === 'getSurfacesAABBs') {
      mockWorker.aabbRequests.push(args.surfacesInfo.map(({ id }) => id));

      return new Map(
        args.surfacesInfo.map(({ id, points }) => [id, [points[0], points[1]]])
      );
    }

    const [, update] = options.callbacks;

    for (const { sliceIndex } of args.planesInfo) {
      update({
        sliceIndex,
        polyDataResults: new Map(
          args.surfacesInfo.map(({ id, segmentIndex }) => [
            segmentIndex,
            {
              points: [`${id}@${sliceIndex}`, args.surfacesAABB.get(id)[0]],
              lines: [],
              numberOfCells: 1,
            },
          ])
        ),
      });
    }
  }),
};

jest.mock('@cornerstonejs/core', () => ({
  Enums: { Events: { WEB_WORKER_PROGRESS: 'WEB_WORKER_PROGRESS' } },
  eventTarget: {},
  triggerEvent: jest.fn(),
  getWebWorkerManager: () => ({
    executeTask: (...args) => mockWorker.executeTask(...args),
  }),
  utilities: {
    getSlicesClippingPlanes: (viewport) => viewport.planes,
    logger: {
      polySegLog: { getLogger: () => ({ error: jest.fn() }) },
    },
  },
}));

jest.mock('@cornerstonejs/tools', () => ({
  Enums: { WorkerTypes: { SURFACE_CLIPPING: 'SURFACE_CLIPPING' } },
  utilities: { pointToString: (point) => point.join(',') },
}));

jest.mock('../registerPolySegWorker', () => ({
  registerPolySegWorker: jest.fn(),
}));

/** A viewport stand-in that shows two slices of one orientation. */
function viewportOf(id: string) {
  return {
    id,
    planes: [{ sliceIndex: 0 }, { sliceIndex: 1 }],
    getSliceIndex: () => 0,
    getViewReference: () => ({ viewPlaneNormal: [0, 0, 1] }),
  };
}

/** A surface of one segment of one segmentation. */
function surfaceOf(id: string, segmentIndex: number, firstPoint = 0) {
  return {
    id,
    segmentIndex,
    points: [firstPoint, 1, 2],
    polys: [3, 0, 0, 0],
  };
}

/** The names that the contours of a segment carry, in order. */
function contoursOf(polyDataCache, segmentIndex: number) {
  return (extractContourData(polyDataCache).get(segmentIndex) ?? [])
    .map(({ points }) => points[0])
    .sort();
}

/** The box that the cut of each contour of a segment was given. */
function boxesOf(polyDataCache, segmentIndex: number) {
  return (extractContourData(polyDataCache).get(segmentIndex) ?? []).map(
    ({ points }) => points[1]
  );
}

describe('clipAndCacheSurfacesForViewport', () => {
  beforeEach(() => {
    mockWorker.aabbRequests = [];
  });

  it('gives a viewport its own contours when another viewport of the same series and orientation was cut before', async () => {
    const surfaces = [surfaceOf('sameSeriesSurface', 1)];

    await clipAndCacheSurfacesForViewport(
      surfaces,
      viewportOf('sameSeriesA') as never
    );

    const second = await clipAndCacheSurfacesForViewport(
      surfaces,
      viewportOf('sameSeriesB') as never
    );

    expect(contoursOf(second, 1)).toEqual([
      'sameSeriesSurface@0',
      'sameSeriesSurface@1',
    ]);
  });

  it('gives a segmentation its own contours when another segmentation with the same segment index was cut before', async () => {
    await clipAndCacheSurfacesForViewport(
      [surfaceOf('firstSegmentation-1', 1)],
      viewportOf('twoSegmentationsA') as never
    );

    const second = await clipAndCacheSurfacesForViewport(
      [surfaceOf('secondSegmentation-1', 1)],
      viewportOf('twoSegmentationsB') as never
    );

    expect(contoursOf(second, 1)).toEqual([
      'secondSegmentation-1@0',
      'secondSegmentation-1@1',
    ]);
  });

  it('keeps the bounding box of each surface by its id, so two surfaces of the same segment index each get their own box', async () => {
    const viewport = viewportOf('twoBoxes') as never;
    const first = await clipAndCacheSurfacesForViewport(
      [surfaceOf('firstBox-1', 1, 10)],
      viewport
    );
    const second = await clipAndCacheSurfacesForViewport(
      [surfaceOf('secondBox-1', 1, 20)],
      viewport
    );

    expect(boxesOf(first, 1)).toEqual([10, 10]);
    expect(boxesOf(second, 1)).toEqual([20, 20]);
  });

  it('keeps the bounding box of a surface that stays, and computes it again when the surface changes', async () => {
    const viewport = viewportOf('changedSurface') as never;
    const surface = surfaceOf('changingSurface', 1, 10);

    await clipAndCacheSurfacesForViewport([surface], viewport);

    const unchanged = await clipAndCacheSurfacesForViewport(
      [surface],
      viewport
    );
    const changed = await clipAndCacheSurfacesForViewport(
      [{ ...surface, points: [30, 1, 2] }],
      viewport
    );

    expect(boxesOf(unchanged, 1)).toEqual([10, 10]);
    expect(boxesOf(changed, 1)).toEqual([30, 30]);
    expect(mockWorker.aabbRequests).toEqual([
      ['changingSurface'],
      ['changingSurface'],
    ]);
  });

  it('keeps no array of a surface reachable once the surface is gone', async () => {
    const viewport = viewportOf('goneSurface') as never;
    let surface = surfaceOf('goneSurface-1', 1, 40);
    const points = new WeakRef(surface.points);
    const polys = new WeakRef(surface.polys);

    await clipAndCacheSurfacesForViewport([surface], viewport);
    surface = undefined;
    mockWorker.executeTask.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 0));
    collectGarbage();

    expect(points.deref()).toBeUndefined();
    expect(polys.deref()).toBeUndefined();
  });
});
