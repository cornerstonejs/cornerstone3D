import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  renderAndWait,
  waitFor,
} from './utils/planarSeriesBothModes';

const {
  Enums,
  utilities,
  metaData,
  volumeLoader,
  cache,
  cornerstoneStreamingDynamicImageVolumeLoader,
} = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();
const dynamicScheme = 'cornerstoneStreamingDynamicImageVolume';
const TIME_POINTS = 3;
const SLICES = 4;
const FRAME_OF_REFERENCE = 'dynamicTimePointFrame';
const dynamicVolumeId = `${dynamicScheme}:timePointDynamic`;
const staticVolumeId = 'cornerstoneStreamingImageVolume:timePointStatic';

/**
 * The image ids of a series of fake images. A dynamic one has `TIME_POINTS`
 * images at each of its `SLICES` positions, one for each time point.
 */
function seriesImageIds(name, timePoints) {
  return Array.from({ length: timePoints }, (_, timePoint) =>
    Array.from({ length: SLICES }, (_, sliceIndex) =>
      testUtils.encodeImageIdInfo({
        loader: 'fakeImageLoader',
        name,
        id: `${name}-${timePoint}`,
        rows: 16,
        columns: 16,
        barStart: 0,
        barWidth: 4,
        xSpacing: 1,
        ySpacing: 1,
        sliceIndex,
        timePoint: timePoint + 1,
        dynamicTimePointTest: true,
      })
    )
  ).flat();
}

/**
 * The image plane of the images of these tests, in one frame of reference,
 * and the time point of each, which splits a dynamic series into its time
 * points.
 */
function timePointMetaDataProvider(type, imageId) {
  const info =
    typeof imageId === 'string' ? testUtils.decodeImageIdInfo(imageId) : null;

  if (!info?.dynamicTimePointTest) {
    return;
  }

  if (type === 'TemporalPositionIdentifier') {
    return info.timePoint;
  }

  if (type === 'imagePlaneModule') {
    return {
      rows: info.rows,
      columns: info.columns,
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imagePositionPatient: [0, 0, info.sliceIndex],
      pixelSpacing: [info.ySpacing, info.xSpacing],
      rowPixelSpacing: info.ySpacing,
      columnPixelSpacing: info.xSpacing,
      frameOfReferenceUID: FRAME_OF_REFERENCE,
    };
  }
}

/** Waits for a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Shows display sets on a viewport, the first as the source. */
async function show(viewport, ...displaySetIds) {
  await viewport.setDisplaySets(
    ...displaySetIds.map((displaySetId, index) => ({
      displaySetId,
      options: {
        orientation: OrientationAxis.AXIAL,
        mode: 'volume',
        ...(index ? { role: 'overlay' } : {}),
      },
    }))
  );
  await frames();
  await renderAndWait(viewport);
}

/**
 * A reference of a time point that names no data: the frame of reference,
 * the view plane normal and the focal point of the view on a viewport.
 */
function planeOnlyReference(viewport, dimensionGroupNumber) {
  const { FrameOfReferenceUID, viewPlaneNormal, cameraFocalPoint } =
    viewport.getViewReference();

  return {
    FrameOfReferenceUID,
    viewPlaneNormal,
    cameraFocalPoint,
    dimensionGroupNumber,
  };
}

describe('A planar viewport in volume mode on a dynamic volume -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    volumeLoader.registerVolumeLoader(
      dynamicScheme,
      cornerstoneStreamingDynamicImageVolumeLoader
    );
    metaData.addProvider(timePointMetaDataProvider, 30000);
    cornerstone3D.displaySetRegistry.add('dynamic', {
      imageIds: seriesImageIds('dynamic', TIME_POINTS),
      volumeId: dynamicVolumeId,
    });
    cornerstone3D.displaySetRegistry.add('static', {
      imageIds: seriesImageIds('static', 1),
      volumeId: staticVolumeId,
    });
  });

  afterEach(function () {
    metaData.removeProvider(timePointMetaDataProvider);
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('keeps the time point on display in its view reference', async function () {
    const viewport = createNextViewport(renderingEngine, 'timePointRef');

    await show(viewport, 'dynamic');

    const volume = cache.getVolume(dynamicVolumeId);

    expect(volume.isDynamicVolume()).toBe(true);
    expect(volume.numDimensionGroups).toBe(TIME_POINTS);
    expect(viewport.getCurrentMode()).toBe('volume');
    expect(viewport.getViewReference().dimensionGroupNumber).toBe(1);

    volume.dimensionGroupNumber = 3;
    await waitFor(() => viewport.getViewReference().dimensionGroupNumber === 3);

    expect(viewport.getViewReference().dimensionGroupNumber).toBe(3);
  });

  it('takes a reference of another time point only with navigation', async function () {
    const viewport = createNextViewport(renderingEngine, 'timePointViewable');

    await show(viewport, 'dynamic');

    const volume = cache.getVolume(dynamicVolumeId);
    const firstTimePoint = viewport.getViewReference();

    volume.dimensionGroupNumber = 2;
    await waitFor(() => viewport.getViewReference().dimensionGroupNumber === 2);

    expect(viewport.isReferenceViewable(firstTimePoint)).toBe(false);
    expect(
      viewport.isReferenceViewable(firstTimePoint, { withNavigation: true })
    ).toBe(true);
    expect(viewport.isReferenceViewable(viewport.getViewReference())).toBe(
      true
    );
  });

  it('selects the time point of a reference on setViewReference', async function () {
    const viewport = createNextViewport(renderingEngine, 'timePointSet');

    await show(viewport, 'dynamic');

    const volume = cache.getVolume(dynamicVolumeId);
    const viewRef = viewport.getViewReference();

    expect(volume.dimensionGroupNumber).toBe(1);

    viewport.setViewReference({ ...viewRef, dimensionGroupNumber: 3 });

    expect(volume.dimensionGroupNumber).toBe(3);
    await waitFor(() => viewport.getViewReference().dimensionGroupNumber === 3);

    viewport.setViewReference({ ...viewRef, dimensionGroupNumber: 2 });

    expect(volume.dimensionGroupNumber).toBe(2);
    expect(viewport.isReferenceViewable(viewport.getViewReference())).toBe(
      true
    );
  });

  it('keeps the time point when the reference names one the volume does not have, or another frame of reference', async function () {
    const viewport = createNextViewport(renderingEngine, 'timePointKept');

    await show(viewport, 'dynamic');

    const volume = cache.getVolume(dynamicVolumeId);
    const viewRef = viewport.getViewReference();

    viewport.setViewReference({
      ...viewRef,
      dimensionGroupNumber: TIME_POINTS + 1,
    });

    expect(volume.dimensionGroupNumber).toBe(1);

    viewport.setViewReference({
      ...viewRef,
      FrameOfReferenceUID: 'anotherFrame',
      dimensionGroupNumber: 2,
    });

    expect(volume.dimensionGroupNumber).toBe(1);
  });

  it('selects the time point of the dynamic overlay that a reference names, as the PET of a fusion', async function () {
    const viewport = createNextViewport(renderingEngine, 'timePointFusion');

    await show(viewport, 'static', 'dynamic');

    const volume = cache.getVolume(dynamicVolumeId);
    const viewRef = viewport.getViewReference({ volumeId: dynamicVolumeId });

    expect(viewport.getViewReference().volumeId).toBe(staticVolumeId);
    expect(viewport.getViewReference().dimensionGroupNumber).toBeUndefined();
    expect(viewRef.volumeId).toBe(dynamicVolumeId);
    expect(viewRef.dimensionGroupNumber).toBe(1);

    viewport.setViewReference({ ...viewRef, dimensionGroupNumber: 2 });

    expect(volume.dimensionGroupNumber).toBe(2);
  });

  it('takes a reference of a time point that names only a frame of reference, a plane and a focal point on a static volume', async function () {
    const viewport = createNextViewport(renderingEngine, 'timePointStatic');

    await show(viewport, 'static');

    const viewRef = planeOnlyReference(viewport, 2);

    expect(viewport.getCurrentMode()).toBe('volume');
    expect(viewRef.FrameOfReferenceUID).toBe(FRAME_OF_REFERENCE);
    expect(viewport.isReferenceViewable(viewRef)).toBe(true);
    expect(
      viewport.isReferenceViewable(viewRef, { withNavigation: true })
    ).toBe(true);
  });

  it('takes a reference of a time point that names only a frame of reference, a plane and a focal point on a stack', async function () {
    const viewport = createNextViewport(renderingEngine, 'timePointStack');

    cornerstone3D.displaySetRegistry.add('staticStack', {
      imageIds: seriesImageIds('static', 1),
      initialImageIdIndex: 0,
    });
    await viewport.setDisplaySets({
      displaySetId: 'staticStack',
      options: { orientation: OrientationAxis.ACQUISITION },
    });
    await frames();
    await renderAndWait(viewport);

    const viewRef = planeOnlyReference(viewport, 2);

    expect(viewport.getCurrentMode()).toBe('stack');
    expect(viewRef.FrameOfReferenceUID).toBe(FRAME_OF_REFERENCE);
    expect(viewport.isReferenceViewable(viewRef)).toBe(true);
    expect(
      viewport.isReferenceViewable(viewRef, { withNavigation: true })
    ).toBe(true);
  });

  it('takes such a reference of another time point on the dynamic volume only with navigation', async function () {
    const viewport = createNextViewport(renderingEngine, 'timePointPlane');

    await show(viewport, 'dynamic');

    expect(cache.getVolume(dynamicVolumeId).dimensionGroupNumber).toBe(1);
    expect(viewport.isReferenceViewable(planeOnlyReference(viewport, 1))).toBe(
      true
    );
    expect(viewport.isReferenceViewable(planeOnlyReference(viewport, 2))).toBe(
      false
    );
    expect(
      viewport.isReferenceViewable(planeOnlyReference(viewport, 2), {
        withNavigation: true,
      })
    ).toBe(true);
    expect(
      viewport.isReferenceViewable(
        planeOnlyReference(viewport, TIME_POINTS + 1),
        {
          withNavigation: true,
        }
      )
    ).toBe(false);
  });
});
