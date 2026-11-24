/**
 * One series of images for tests of a direct next planar viewport in stack
 * mode and in volume mode: the same images are shown as a stack and as a
 * volume, so an answer can be compared between the two modes.
 */
import * as cornerstone3D from '../../src/index';
import * as testUtils from '../../../../utils/test/testUtils';

const { Enums, volumeLoader, imageLoader, metaData } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

/** The default size of a test series: 32 columns, 24 rows and 8 slices. */
export const SERIES_SIZE = {
  rows: 24,
  columns: 32,
  slices: 8,
  columnSpacing: 1,
  rowSpacing: 1.5,
  sliceSpacing: 2,
};

/** A series along the patient axes, with its first voxel away from zero. */
export const STRAIGHT_PLANE = {
  origin: [-10, 5, 20],
  rowCosines: [1, 0, 0],
  columnCosines: [0, 1, 0],
};

/** A series whose rows, columns and slices all leave the patient axes. */
export const TILTED_PLANE = {
  origin: [-10, 5, 20],
  rowCosines: [0.8, 0.6, 0],
  columnCosines: [-0.36, 0.48, 0.8],
};

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** The value that a test series stores at a voxel. */
export function storedValue([i, j, k]) {
  return 1 + ((i + 3 * j + 7 * k) % 250);
}

/** The direction of the slices of a test series. */
export function sliceNormal({ plane }) {
  return cross(plane.rowCosines, plane.columnCosines);
}

/** The world point of a voxel of a test series. */
export function worldOfVoxel({ plane, size }, [i, j, k]) {
  const normal = cross(plane.rowCosines, plane.columnCosines);

  return plane.origin.map(
    (value, axis) =>
      value +
      i * size.columnSpacing * plane.rowCosines[axis] +
      j * size.rowSpacing * plane.columnCosines[axis] +
      k * size.sliceSpacing * normal[axis]
  );
}

/**
 * The image plane of the images of a test series, by the plane and the size
 * that their image ids hold. Any other image id is left to the other
 * providers.
 */
function seriesMetaDataProvider(type, imageId) {
  if (type !== 'imagePlaneModule' || typeof imageId !== 'string') {
    return;
  }

  const info = testUtils.decodeImageIdInfo(imageId);

  if (!info?.plane) {
    return;
  }

  const { plane, size, sliceIndex } = info;

  return {
    rows: size.rows,
    columns: size.columns,
    imageOrientationPatient: [...plane.rowCosines, ...plane.columnCosines],
    rowCosines: plane.rowCosines,
    columnCosines: plane.columnCosines,
    imagePositionPatient: worldOfVoxel({ plane, size }, [0, 0, sliceIndex]),
    pixelSpacing: [size.rowSpacing, size.columnSpacing],
    rowPixelSpacing: size.rowSpacing,
    columnPixelSpacing: size.columnSpacing,
    frameOfReferenceUID: 'bothModesFrame',
  };
}

/**
 * Loads one series of images whose voxel values differ along each axis, and
 * makes a volume of the same images. Call it after the test environment is
 * set up. Gives the image ids in the order of the slices of the volume, the
 * volume id, the plane and the size. `info` adds fields to the image ids of
 * the fake image loader, `PT: true` for a PT series.
 */
export async function createSeries({
  plane = STRAIGHT_PLANE,
  id = 'bothModes',
  size = SERIES_SIZE,
  info = {},
} = {}) {
  metaData.addProvider(seriesMetaDataProvider, 20000);

  const imageIds = Array.from({ length: size.slices }, (_, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: id,
      id,
      rows: size.rows,
      columns: size.columns,
      barStart: 0,
      barWidth: 1,
      xSpacing: size.columnSpacing,
      ySpacing: size.rowSpacing,
      sliceIndex,
      plane,
      size,
      ...info,
    })
  );
  const images = await Promise.all(
    imageIds.map((imageId) => imageLoader.loadAndCacheImage(imageId))
  );

  images.forEach((image, k) => {
    for (let j = 0; j < size.rows; j++) {
      for (let i = 0; i < size.columns; i++) {
        image.voxelManager.setAtIJK(i, j, 0, storedValue([i, j, k]));
      }
    }
  });

  const volumeId = `bothModesVolume:${id}`;
  const volume = volumeLoader.createAndCacheVolumeFromImagesSync(
    volumeId,
    imageIds
  );

  return { imageIds: volume.imageIds, volumeId, plane, size };
}

/** Makes a direct next planar viewport of 400 by 300 pixels. */
export function createNextViewport(renderingEngine, viewportId) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.PLANAR,
    orientation: OrientationAxis.ACQUISITION,
    width: 400,
    height: 300,
    useEnableElement: true,
  });

  return renderingEngine.getViewport(viewportId);
}

/** Resolves when `check` gives true, checked once per animation frame. */
export function waitFor(check, timeout = 4000) {
  const start = performance.now();

  return new Promise((resolve, reject) => {
    const step = () => {
      if (check()) {
        resolve();
      } else if (performance.now() - start > timeout) {
        reject(new Error('waitFor timed out'));
      } else {
        requestAnimationFrame(step);
      }
    };

    step();
  });
}

/** Renders the viewport and resolves at its next IMAGE_RENDERED event. */
export function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

/**
 * Shows the images of a series as a stack on a direct next viewport, at the
 * image `sliceIndex`. `options` are those of the display set.
 */
export async function showStack(
  viewport,
  series,
  sliceIndex = 0,
  options = {}
) {
  const displaySetId = `stack:${viewport.id}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.ACQUISITION, ...options },
  });
  await renderAndWait(viewport);
  viewport.setViewState({
    slice: { kind: 'stackIndex', imageIdIndex: sliceIndex },
  });
  await waitFor(
    () => viewport.getCurrentImageId() === series.imageIds[sliceIndex]
  );
  await renderAndWait(viewport);
}

/**
 * Shows the volume of a series on a direct next viewport, at the slice
 * `sliceIndex` of the acquisition orientation. `options` are those of the
 * display set, where another orientation can be given.
 */
export async function showVolume(
  viewport,
  series,
  sliceIndex = 0,
  options = {}
) {
  const displaySetId = `volume:${viewport.id}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.ACQUISITION, ...options },
  });
  await renderAndWait(viewport);
  viewport.setViewState({
    slice: {
      kind: 'volumePoint',
      sliceWorldPoint: worldOfVoxel(series, [
        series.size.columns / 2,
        series.size.rows / 2,
        sliceIndex,
      ]),
    },
  });
  await renderAndWait(viewport);
}

export function expectPointsClose(actual, expected, precision = 4) {
  expect(actual.length).toBe(expected.length);
  Array.from(actual).forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], precision);
  });
}
