import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import * as legacy3D_perspective from './groundTruth/legacy3D_perspective.png';
import * as legacy3D_perspective_dolly from './groundTruth/legacy3D_perspective_dolly.png';
import * as legacy3D_surface_perspective_dolly from './groundTruth/legacy3D_surface_perspective_dolly.png';

const {
  Enums,
  volumeLoader,
  geometryLoader,
  utilities,
  cache,
  viewportProjection,
} = cornerstone3D;
const { ViewportType, OrientationAxis, Events, GeometryType } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * The camera clipping range of the legacy 3D viewport of 400 by 300 pixels,
 * sagittal, with the volume of the tests, read on commit 58914567b with the
 * test volume loader that honours the spacing of the volume id. The legacy
 * viewport fitted the range to the bounds of its visible props after
 * `setVolumes` and after each `setCamera` and `resetCamera`. Each step starts
 * from the camera of the step before: `zoom` halves the parallel scale, `pan`
 * moves the focal point and the position by [0, 6, 3], `rotate` turns the
 * position 40 degrees about the z axis through the focal point, `dolly` puts
 * the position a quarter of the way from the focal point, `reset` is
 * `resetCamera`. In parallel and in perspective (made with
 * `parallelProjection: false`).
 */
const LEGACY_RANGES = {
  parallel: {
    mount: [258.6804075524686, 297.442981648252],
    zoom: [258.6804075524686, 297.442981648252],
    pan: [258.6804075524686, 297.442981648252],
    rotate: [252.19516141718861, 311.6385806784218],
    dolly: [46.293605752837216, 101.47340694223281],
    reset: [247.99781101630663, 307.35431544600647],
  },
  perspective: {
    mount: [243.1142818724493, 313.35898813484044],
    zoom: [243.1142818724493, 313.35898813484044],
    pan: [243.1142818724493, 313.35898813484044],
    rotate: [245.39024010083006, 318.5964566482214],
    dolly: [46.293605752837216, 101.47340694223281],
    reset: [241.65502221883304, 313.8396715146159],
  },
};

/**
 * The same legacy viewport in perspective after `setVolumes` and a dolly of
 * the position to a quarter of the way from the focal point, as the zoom tool
 * moved a camera in perspective: its clipping range, and the number of pixels
 * of its picture that are not the background.
 */
const LEGACY_PERSPECTIVE_DOLLY = {
  clippingRange: [52.77885188811714, 87.27780791206301],
  shownPixels: 7260,
};

/** The number of pixels of the legacy picture in perspective at the mount. */
const LEGACY_PERSPECTIVE_SHOWN_PIXELS = 308;

/**
 * The legacy 3D viewport in perspective with the red box of the tests as its
 * only actor (added with `addActor`, as the surface tools did): after
 * `resetCamera`, and after a dolly of the position to a quarter of the way
 * from the focal point. The clipping ranges, and the red pixels of the
 * picture after the dolly.
 */
const LEGACY_SURFACE = {
  clippingRange: [163.18500788739215, 211.5693752545512],
  dollyClippingRange: [29.95301016132753, 63.979309866688354],
  dollyRedPixels: 4324,
};

/** The pictures that the legacy viewport drew in these cases. */
const LEGACY_PERSPECTIVE_PICTURE = legacy3D_perspective.default;
const LEGACY_PERSPECTIVE_DOLLY_PICTURE = legacy3D_perspective_dolly.default;
const LEGACY_SURFACE_DOLLY_PICTURE = legacy3D_surface_perspective_dolly.default;

/**
 * Gives 0.5 for every call of `Math.random` from the vtk.js volume mapper,
 * which fills the jitter texture of its ray caster with them. Two pictures of
 * the same volume then do not differ by the jitter that each drew.
 */
function drawWithoutJitter() {
  const random = Math.random;

  spyOn(Math, 'random').and.callFake(() =>
    (new Error().stack || '').includes('VolumeMapper') ? 0.5 : random()
  );
}

/**
 * Makes a direct next 3D viewport of 400 by 300 pixels, sagittal, with the
 * magenta background of the tests.
 */
function createNextViewport(renderingEngine, options = {}) {
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId: 'next3D',
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: {
      orientation: OrientationAxis.SAGITTAL,
      background: [1, 0, 1],
      ...options,
    },
  });

  return renderingEngine.getViewport('next3D');
}

/**
 * Makes, caches and shows the volume of the tests: 40 columns, 30 rows and
 * 12 slices 2 mm apart, with stripes along each axis.
 */
async function showVolume(next) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    id: 'volumeURI',
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 2,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  const { voxelManager, dimensions } = cache.getVolume(volumeId);

  for (let k = 0; k < dimensions[2]; k++) {
    for (let j = 0; j < dimensions[1]; j++) {
      for (let i = 0; i < dimensions[0]; i++) {
        voxelManager.setAtIJK(i, j, k, (i * 9 + j * 5 + k * 20) % 256);
      }
    }
  }

  cornerstone3D.displaySetRegistry.add('next3DVolume', {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await next.setDisplaySets({
    displaySetId: 'next3DVolume',
    options: { renderMode: 'vtkVolume3d' },
  });
}

/**
 * Makes and shows a red box from [0, 0, 0] to [30, 20, 10] as a surface
 * display set: its two faces across the x axis, which a sagittal camera
 * sees.
 */
async function showSurface(next) {
  const points = [];

  for (const x of [0, 30]) {
    points.push(x, 0, 0, x, 20, 0, x, 20, 10, x, 0, 10);
  }

  await geometryLoader.createAndCacheGeometry('clippingBox', {
    type: GeometryType.SURFACE,
    geometryData: {
      id: 'clippingBox',
      color: [255, 0, 0],
      frameOfReferenceUID: 'surfaceFrameOfReference',
      segmentIndex: 1,
      points,
      polys: [4, 0, 1, 2, 3, 4, 4, 5, 6, 7],
    },
  });
  await next.setDisplaySets({
    displaySetId: 'clippingBox',
    options: { renderMode: 'vtkGeometry3d' },
  });
}

/** Writes the camera read from the viewport with a change, as a tool does. */
function writeCamera(next, change) {
  next.setViewState({ ...next.getViewState(), ...change });
}

/** Zooms through the projection service, as the zoom tool does. */
function zoomBy(next, zoom) {
  next.setViewState(viewportProjection.withFraming(next, { zoom }));
}

/** A point turned about the z axis through a centre. */
function turnedAboutZ(point, center, degrees) {
  const angle = (degrees * Math.PI) / 180;
  const x = point[0] - center[0];
  const y = point[1] - center[1];

  return [
    center[0] + x * Math.cos(angle) - y * Math.sin(angle),
    center[1] + x * Math.sin(angle) + y * Math.cos(angle),
    point[2],
  ];
}

/** Expects the clipping range of the vtk.js camera and of the view state. */
function expectClippingRange(next, expected) {
  const vtkRange = next.getVtkActiveCamera().getClippingRange();
  const { clippingRange } = next.getViewState();

  [vtkRange, clippingRange].forEach((range) => {
    expect(range[0]).toBeCloseTo(expected[0], 3);
    expect(range[1]).toBeCloseTo(expected[1], 3);
  });
}

/**
 * Moves the camera through the steps of `LEGACY_RANGES`, each as a tool
 * writes it, and expects the legacy clipping range after each.
 */
function expectLegacyRangesOfEachStep(next, legacyRanges) {
  expectClippingRange(next, legacyRanges.mount);

  writeCamera(next, { parallelScale: next.getViewState().parallelScale / 2 });
  expectClippingRange(next, legacyRanges.zoom);

  const zoomed = next.getViewState();
  const shift = [0, 6, 3];

  writeCamera(next, {
    focalPoint: zoomed.focalPoint.map((value, axis) => value + shift[axis]),
    position: zoomed.position.map((value, axis) => value + shift[axis]),
  });
  expectClippingRange(next, legacyRanges.pan);

  const panned = next.getViewState();

  writeCamera(next, {
    position: turnedAboutZ(panned.position, panned.focalPoint, 40),
  });
  expectClippingRange(next, legacyRanges.rotate);

  const turned = next.getViewState();

  writeCamera(next, {
    position: turned.focalPoint.map(
      (value, axis) => value + (turned.position[axis] - value) / 4
    ),
  });
  expectClippingRange(next, legacyRanges.dolly);

  next.resetViewState();
  expectClippingRange(next, legacyRanges.reset);
}

/** Renders a viewport and gives its picture. */
async function pictureOf(viewport) {
  const rendered = new Promise((resolve) =>
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    })
  );

  viewport.render();
  await rendered;

  return viewport.canvas.toDataURL('image/png');
}

/**
 * Counts the pixels of a picture that are not the magenta background, and
 * those that are red.
 */
async function pixelCountsOf(dataUrl) {
  const image = new Image();

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);

  const { data } = context.getImageData(0, 0, image.width, image.height);
  let shown = 0;
  let red = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const [r, g, b] = [data[offset], data[offset + 1], data[offset + 2]];

    shown += r > 240 && g < 15 && b > 240 ? 0 : 1;
    red += r > 100 && g < 60 && b < 60 ? 1 : 0;
  }

  return { shown, red };
}

/** Expects a count within 5 percent of the legacy count. */
function expectNearCount(count, legacyCount) {
  expect(Math.abs(count - legacyCount)).toBeLessThanOrEqual(
    Math.ceil(legacyCount * 0.05)
  );
}

describe('The clipping range of a direct next 3D viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });

    renderingEngine = testEnv.renderingEngine;
    drawWithoutJitter();
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();

    if (cache.getGeometry('clippingBox')) {
      cache.removeGeometryLoadObject('clippingBox');
    }

    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('fits the range at the mount and after each camera write in parallel, as the legacy 3D viewport', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);

    expectLegacyRangesOfEachStep(next, LEGACY_RANGES.parallel);
  });

  it('fits the range at the mount and after each camera write in perspective, as the legacy 3D viewport', async function () {
    const next = createNextViewport(renderingEngine, {
      parallelProjection: false,
    });

    await showVolume(next);

    expectLegacyRangesOfEachStep(next, LEGACY_RANGES.perspective);
  });

  it('fits the range on a change of the projection and draws the legacy picture in perspective', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    writeCamera(next, { parallelProjection: false });

    expectClippingRange(next, LEGACY_RANGES.perspective.mount);

    const picture = await pictureOf(next);

    expectNearCount(
      (await pixelCountsOf(picture)).shown,
      LEGACY_PERSPECTIVE_SHOWN_PIXELS
    );
    await testUtils.compareImagesToImage(
      picture,
      LEGACY_PERSPECTIVE_PICTURE,
      'next3D_clipping_projection_change'
    );

    writeCamera(next, { parallelProjection: true });

    expectClippingRange(next, LEGACY_RANGES.parallel.mount);
  });

  it('keeps a volume in perspective after a zoom of the projection service, as the legacy viewport after a dolly', async function () {
    const next = createNextViewport(renderingEngine, {
      parallelProjection: false,
    });

    await showVolume(next);
    next.resetViewState();
    zoomBy(next, 4);

    expectClippingRange(next, LEGACY_PERSPECTIVE_DOLLY.clippingRange);

    const picture = await pictureOf(next);

    expectNearCount(
      (await pixelCountsOf(picture)).shown,
      LEGACY_PERSPECTIVE_DOLLY.shownPixels
    );
    await testUtils.compareImagesToImage(
      picture,
      LEGACY_PERSPECTIVE_DOLLY_PICTURE,
      'next3D_clipping_perspective_zoom'
    );
  });

  it('keeps a surface shown alone in perspective after a zoom of the projection service, as the legacy viewport kept an added actor', async function () {
    const next = createNextViewport(renderingEngine, {
      parallelProjection: false,
    });

    await showSurface(next);
    next.setViewReference({ viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] });
    next.resetViewState();

    expectClippingRange(next, LEGACY_SURFACE.clippingRange);

    zoomBy(next, 4);

    expectClippingRange(next, LEGACY_SURFACE.dollyClippingRange);

    const picture = await pictureOf(next);

    expectNearCount(
      (await pixelCountsOf(picture)).red,
      LEGACY_SURFACE.dollyRedPixels
    );
    await testUtils.compareImagesToImage(
      picture,
      LEGACY_SURFACE_DOLLY_PICTURE,
      'next3D_clipping_surface_zoom'
    );
  });
});
