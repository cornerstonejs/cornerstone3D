import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  showStack,
  showVolume,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * Series whose images face another way than the named camera, with the
 * view of the 5.x legacy viewports on a canvas of 400 by 300: the named
 * camera of the legacy volume viewport, and the plane of the images of the
 * legacy stack viewport. `a` and `b` are the canvas points of the voxels
 * (8, 6, 2) and (24, 18, 2).
 */
const OTHER_WAY_SERIES = [
  {
    id: 'rowsReversed',
    description: 'an axial series whose rows run to the right',
    orientation: OrientationAxis.AXIAL,
    rowCosines: [-1, 0, 0],
    columnCosines: [0, 1, 0],
    legacyVolume: {
      normal: [0, 0, -1],
      up: [0, -1, 0],
      a: [262.5, 81.25],
      b: [129.167, 231.25],
    },
    legacyStack: {
      normal: [0, 0, 1],
      up: [0, -1, 0],
      a: [137.5, 81.25],
      b: [270.833, 231.25],
    },
  },
  {
    id: 'columnsReversed',
    description: 'an axial series whose columns run to the head',
    orientation: OrientationAxis.AXIAL,
    rowCosines: [1, 0, 0],
    columnCosines: [0, -1, 0],
    legacyVolume: {
      normal: [0, 0, -1],
      up: [0, -1, 0],
      a: [137.5, 218.75],
      b: [270.833, 68.75],
    },
    legacyStack: {
      normal: [0, 0, 1],
      up: [0, 1, 0],
      a: [137.5, 81.25],
      b: [270.833, 231.25],
    },
  },
  {
    id: 'bothReversed',
    description: 'an axial series turned by half a turn in its plane',
    orientation: OrientationAxis.AXIAL,
    rowCosines: [-1, 0, 0],
    columnCosines: [0, -1, 0],
    legacyVolume: {
      normal: [0, 0, -1],
      up: [0, -1, 0],
      a: [262.5, 218.75],
      b: [129.167, 68.75],
    },
    legacyStack: {
      normal: [0, 0, -1],
      up: [0, 1, 0],
      a: [137.5, 81.25],
      b: [270.833, 231.25],
    },
  },
  {
    id: 'sagittalReversed',
    description: 'a sagittal series whose rows run to the front',
    orientation: OrientationAxis.SAGITTAL,
    rowCosines: [0, -1, 0],
    columnCosines: [0, 0, -1],
    legacyVolume: {
      normal: [1, 0, 0],
      up: [0, 0, 1],
      a: [262.5, 81.25],
      b: [129.167, 231.25],
    },
    legacyStack: {
      normal: [-1, 0, 0],
      up: [0, 0, 1],
      a: [137.5, 81.25],
      b: [270.833, 231.25],
    },
  },
];

/**
 * Series whose acquisition camera is the named camera, with the view of the
 * 5.x legacy volume viewport for that name.
 */
const SAME_WAY_SERIES = [
  {
    id: 'straightAxial',
    orientation: OrientationAxis.AXIAL,
    rowCosines: [1, 0, 0],
    columnCosines: [0, 1, 0],
    legacyVolume: {
      normal: [0, 0, -1],
      up: [0, -1, 0],
      a: [137.5, 81.25],
      b: [270.833, 231.25],
    },
  },
  {
    id: 'straightSagittal',
    orientation: OrientationAxis.SAGITTAL,
    rowCosines: [0, 1, 0],
    columnCosines: [0, 0, -1],
    legacyVolume: {
      normal: [1, 0, 0],
      up: [0, 0, 1],
      a: [137.5, 81.25],
      b: [270.833, 231.25],
    },
  },
];

function createCaseSeries({ id, rowCosines, columnCosines }) {
  return createSeries({
    id,
    plane: { origin: [-10, 5, 20], rowCosines, columnCosines },
  });
}

/** The camera vectors and the canvas points of two voxels of a view. */
function viewOf(viewport, series) {
  const camera = viewport.getResolvedView().toICamera();

  return {
    normal: Array.from(camera.viewPlaneNormal),
    up: Array.from(camera.viewUp),
    a: viewport.worldToCanvas(worldOfVoxel(series, [8, 6, 2])),
    b: viewport.worldToCanvas(worldOfVoxel(series, [24, 18, 2])),
  };
}

function expectView(view, expected) {
  view.normal.forEach((value, axis) =>
    expect(value).toBeCloseTo(expected.normal[axis], 3)
  );
  view.up.forEach((value, axis) =>
    expect(value).toBeCloseTo(expected.up[axis], 3)
  );
  [0, 1].forEach((axis) => {
    expect(view.a[axis]).toBeCloseTo(expected.a[axis], 1);
    expect(view.b[axis]).toBeCloseTo(expected.b[axis], 1);
  });
}

describe('A named orientation at the mount of a direct next planar viewport', () => {
  let renderingEngine;
  let viewport;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    viewport = createNextViewport(renderingEngine, 'namedOrientation');
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  for (const seriesCase of OTHER_WAY_SERIES) {
    it(`shows the named camera on the volume of ${seriesCase.description}, as the legacy volume viewport`, async function () {
      const series = await createCaseSeries(seriesCase);

      await showVolume(viewport, series, 2, {
        orientation: seriesCase.orientation,
      });

      expect(viewport.getCurrentMode()).toBe('volume');
      expect(viewport.getViewState().orientation).toBe(seriesCase.orientation);
      expectView(viewOf(viewport, series), seriesCase.legacyVolume);
    }, 20000);

    it(`shows the stack of ${seriesCase.description} in the plane of its images, as the legacy stack viewport`, async function () {
      const series = await createCaseSeries(seriesCase);

      await showStack(viewport, series, 2, {
        orientation: seriesCase.orientation,
      });

      expect(viewport.getCurrentMode()).toBe('stack');
      expectView(viewOf(viewport, series), seriesCase.legacyStack);
    }, 20000);
  }

  for (const seriesCase of SAME_WAY_SERIES) {
    it(`keeps the acquisition for the name of the acquisition camera, ${seriesCase.id}`, async function () {
      const series = await createCaseSeries(seriesCase);

      await showVolume(viewport, series, 2, {
        orientation: seriesCase.orientation,
      });

      expect(viewport.getViewState().orientation).toBe(
        OrientationAxis.ACQUISITION
      );
      expectView(viewOf(viewport, series), seriesCase.legacyVolume);
    }, 20000);
  }
});
