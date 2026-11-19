import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';

const { Enums, utilities, geometryLoader, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, GeometryType } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * The camera of the legacy 3D viewport of 400 by 300 pixels right after it
 * was made, with no volume and no actor, read on commit 58914567b: it turned
 * to the orientation of its options and fitted the empty scene, so it stood
 * ten bounding radii of the box from -1 to 1 away, with a parallel scale of 1
 * (1.05 for the tilted vectors on that canvas) and a view angle of 90. In
 * perspective it was the same camera.
 */
const LEGACY_CONSTRUCTED_CAMERAS = {
  sagittal: {
    orientation: OrientationAxis.SAGITTAL,
    parallelScale: 1,
    viewAngle: 90,
    focalPoint: [0, 0, 0],
    position: [17.32050807568877, 0, 0],
    viewPlaneNormal: [1, 0, 0],
    viewUp: [0, 0, 1],
  },
  coronal: {
    orientation: OrientationAxis.CORONAL,
    parallelScale: 1,
    viewAngle: 90,
    focalPoint: [0, 0, 0],
    position: [0, -17.32050807568877, 0],
    viewPlaneNormal: [0, -1, 0],
    viewUp: [0, 0, 1],
  },
  axial: {
    orientation: OrientationAxis.AXIAL,
    parallelScale: 1,
    viewAngle: 90,
    focalPoint: [0, 0, 0],
    position: [0, 0, -17.32050807568877],
    viewPlaneNormal: [0, 0, -1],
    viewUp: [0, -1, 0],
  },
  vectors: {
    orientation: { viewPlaneNormal: [0.6, 0, 0.8], viewUp: [0, 1, 0] },
    parallelScale: 1.0500000017881392,
    viewAngle: 90,
    focalPoint: [0, 0, 0],
    position: [10.392304845413262, 0, 13.856406460551018],
    viewPlaneNormal: [0.6, 0, 0.8],
    viewUp: [0, 1, 0],
  },
};

/**
 * The camera of the same legacy viewport made with the acquisition
 * orientation, or with none: the camera of vtk.js, which it did not turn.
 */
const LEGACY_UNTURNED_CAMERA = {
  parallelScale: 1,
  viewAngle: 30,
  focalPoint: [0, 0, 0],
  position: [0, 0, 1],
  viewPlaneNormal: [0, 0, 1],
  viewUp: [0, 1, 0],
};

/**
 * What `resetCamera` of the legacy viewport, made sagittal, fitted for a box
 * from [-50, 10, 0] to [150, 60, 300] added with `addActor` as its only
 * content.
 */
const LEGACY_SAGITTAL_BOX_FIT = {
  parallelScale: 150,
  viewAngle: 90,
  focalPoint: [50, 35, 150],
  position: [1870.0274723201296, 35, 150],
  viewPlaneNormal: [1, 0, 0],
  viewUp: [0, 0, 1],
};

const BOX_MIN = [-50, 10, 0];
const BOX_MAX = [150, 60, 300];

/** Makes a direct next 3D viewport of 400 by 300 pixels. */
function createNextViewport(renderingEngine, options) {
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId: 'next3D',
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: {
      background: [1, 0, 1],
      ...options,
    },
  });

  return renderingEngine.getViewport('next3D');
}

/** The points of the two faces across z of the box of the tests. */
function boxPoints() {
  const points = [];

  for (const z of [BOX_MIN[2], BOX_MAX[2]]) {
    points.push(BOX_MIN[0], BOX_MIN[1], z, BOX_MAX[0], BOX_MIN[1], z);
    points.push(BOX_MAX[0], BOX_MAX[1], z, BOX_MIN[0], BOX_MAX[1], z);
  }

  return points;
}

/** A vtk.js actor of the box, as a tool adds a prop to the renderer. */
function createBoxActor() {
  const polyData = vtkPolyData.newInstance();

  polyData.getPoints().setData(Float32Array.from(boxPoints()), 3);
  polyData.setPolys(
    vtkCellArray.newInstance({
      values: Uint32Array.from([4, 0, 1, 2, 3, 4, 4, 5, 6, 7]),
    })
  );

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polyData);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  return actor;
}

/** Mounts the box as a surface display set, alone. */
async function showSurface(next) {
  await geometryLoader.createAndCacheGeometry('orientationBox', {
    type: GeometryType.SURFACE,
    geometryData: {
      id: 'orientationBox',
      color: [255, 0, 0],
      frameOfReferenceUID: 'surfaceFrameOfReference',
      segmentIndex: 1,
      points: boxPoints(),
      polys: [4, 0, 1, 2, 3, 4, 4, 5, 6, 7],
    },
  });
  await next.addDisplaySet('orientationBox', { renderMode: 'vtkGeometry3d' });
}

function expectPointsClose(actual, expected, precision = 4) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], precision);
  });
}

/** Expects the camera of the next viewport to be a legacy camera. */
function expectCamera(next, legacyCamera) {
  const camera = next.getViewState();

  expectPointsClose(camera.viewPlaneNormal, legacyCamera.viewPlaneNormal);
  expectPointsClose(camera.viewUp, legacyCamera.viewUp);
  expectPointsClose(camera.focalPoint, legacyCamera.focalPoint);
  expectPointsClose(camera.position, legacyCamera.position, 3);
  expect(camera.parallelScale).toBeCloseTo(legacyCamera.parallelScale, 4);
  expect(camera.viewAngle).toBeCloseTo(legacyCamera.viewAngle, 4);
}

describe('A direct next 3D viewport that shows no volume, and its orientation option -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });

    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    if (cache.getGeometry('orientationBox')) {
      cache.removeGeometryLoadObject('orientationBox');
    }

    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  for (const [name, legacyCamera] of Object.entries(
    LEGACY_CONSTRUCTED_CAMERAS
  )) {
    it(`turns to the ${name} orientation when it is made, in parallel and in perspective, as the legacy 3D viewport`, function () {
      const { orientation, ...camera } = legacyCamera;

      for (const parallelProjection of [true, false]) {
        const next = createNextViewport(renderingEngine, {
          orientation,
          parallelProjection,
        });

        expectCamera(next, camera);
        expect(next.getViewState().parallelProjection).toBe(parallelProjection);
      }
    });
  }

  it('keeps the camera of vtk.js for the acquisition orientation and for none, as the legacy 3D viewport', function () {
    for (const orientation of [OrientationAxis.ACQUISITION, undefined]) {
      const next = createNextViewport(renderingEngine, { orientation });

      expectCamera(next, LEGACY_UNTURNED_CAMERA);
    }
  });

  it('shows a surface alone from the side of its orientation, and fits it there on resetViewState as the legacy viewport fitted an added actor', async function () {
    const next = createNextViewport(renderingEngine, {
      orientation: OrientationAxis.SAGITTAL,
    });

    await showSurface(next);

    const mounted = next.getViewState();

    expectPointsClose(
      mounted.viewPlaneNormal,
      LEGACY_SAGITTAL_BOX_FIT.viewPlaneNormal
    );
    expectPointsClose(mounted.viewUp, LEGACY_SAGITTAL_BOX_FIT.viewUp);

    next.resetViewState();

    expectCamera(next, LEGACY_SAGITTAL_BOX_FIT);
  });

  it('fits a prop of a tool from the side of its orientation on resetViewState, as the legacy viewport', function () {
    const next = createNextViewport(renderingEngine, {
      orientation: OrientationAxis.SAGITTAL,
    });

    next.getRenderer().addActor(createBoxActor());
    next.resetViewState();

    expectCamera(next, LEGACY_SAGITTAL_BOX_FIT);
  });
});
