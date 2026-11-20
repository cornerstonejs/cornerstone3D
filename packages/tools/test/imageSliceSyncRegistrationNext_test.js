import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  STRAIGHT_PLANE,
  createNextViewport,
  createSeries,
  showStack,
  waitFor,
  worldOfVoxel,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, metaData } = cornerstone3D;
const { synchronizers, SynchronizerManager } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const synchronizerId = 'imageSliceSyncRegistrationNext';

/** The frame of reference of the second series of the tests. */
const OTHER_FRAME = 'imageSliceSyncOtherFrame';

/**
 * The plane of the second series: the plane of the first one, 100 mm higher,
 * so that the same world point is in neither series.
 */
const OTHER_PLANE = {
  ...STRAIGHT_PLANE,
  origin: [-10, 5, 120],
};

/** Resolves after two animation frames. */
function frames() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );
}

/**
 * Gives the images whose image ids hold a `frameOfReferenceUID` the image
 * plane of their plane and size in that frame of reference.
 */
function otherFrameProvider(type, imageId) {
  if (type !== 'imagePlaneModule' || typeof imageId !== 'string') {
    return;
  }

  const info = testUtils.decodeImageIdInfo(imageId);

  if (!info?.frameOfReferenceUID) {
    return;
  }

  const { plane, size, sliceIndex, frameOfReferenceUID } = info;

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
    frameOfReferenceUID,
  };
}

/** Moves a stack to an image and waits until it shows it. */
async function moveTo(viewport, imageIdIndex) {
  await viewport.setImageIdIndex(imageIdIndex);
  await waitFor(() => viewport.getCurrentImageIdIndex() === imageIdIndex);
}

/**
 * Two stacks of two series in different frames of reference: the source at
 * its image 2 and the target at its image 3.
 */
async function showTwoFrames(renderingEngine, id) {
  const series = await createSeries({ id: `${id}Source` });
  const other = await createSeries({
    id: `${id}Target`,
    plane: OTHER_PLANE,
    info: { frameOfReferenceUID: OTHER_FRAME },
  });
  const source = createNextViewport(renderingEngine, `${id}SourceViewport`);
  const target = createNextViewport(renderingEngine, `${id}TargetViewport`);

  await showStack(source, series, 2);
  await showStack(target, other, 3);

  return { series, other, source, target };
}

/** Adds a source and a target to a new image slice synchronizer. */
function synchronize(source, target) {
  const synchronizer =
    synchronizers.createImageSliceSynchronizer(synchronizerId);

  synchronizer.addSource({ renderingEngineId, viewportId: source.id });
  synchronizer.addTarget({ renderingEngineId, viewportId: target.id });

  return synchronizer;
}

describe('The spatial registration of two direct next planar viewports in different frames of reference -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
    metaData.addProvider(otherFrameProvider, 30000);
  });

  afterEach(function () {
    SynchronizerManager.destroySynchronizer(synchronizerId);
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  it('adds the registration of the images on display, and the image slice synchronizer moves the target by it', async function () {
    const { series, other, source, target } = await showTwoFrames(
      renderingEngine,
      'registrationAdded'
    );
    const sourcePosition = metaData.get(
      'imagePlaneModule',
      series.imageIds[2]
    ).imagePositionPatient;
    const targetPosition = metaData.get(
      'imagePlaneModule',
      other.imageIds[3]
    ).imagePositionPatient;

    expect(source.getFrameOfReferenceUID()).not.toBe(
      target.getFrameOfReferenceUID()
    );
    expect(target.getFrameOfReferenceUID()).toBe(OTHER_FRAME);

    utilities.calculateViewportsSpatialRegistration(source, target);

    const registration = utilities.spatialRegistrationMetadataProvider.get(
      'spatialRegistrationModule',
      source.id,
      target.id,
      renderingEngineId,
      renderingEngineId
    );

    expect(registration).toBeDefined();
    expect(Array.from(registration.slice(12, 15))).toEqual(
      sourcePosition.map((value, axis) => value - targetPosition[axis])
    );

    synchronize(source, target);
    await moveTo(source, 5);
    await waitFor(() => target.getCurrentImageIdIndex() === 6).catch(
      () => undefined
    );

    expect(target.getCurrentImageId()).toBe(other.imageIds[6]);
  });

  it('lets the image slice synchronizer add the registration of the images on display at its first move, and follow it from then on', async function () {
    const { other, source, target } = await showTwoFrames(
      renderingEngine,
      'registrationAtSync'
    );

    synchronize(source, target);
    await moveTo(source, 5);
    await frames();

    expect(target.getCurrentImageId()).toBe(other.imageIds[3]);
    expect(
      utilities.spatialRegistrationMetadataProvider.get(
        'spatialRegistrationModule',
        target.id,
        source.id,
        renderingEngineId,
        renderingEngineId
      )
    ).toBeDefined();

    await moveTo(source, 6);
    await waitFor(() => target.getCurrentImageIdIndex() === 4).catch(
      () => undefined
    );

    expect(target.getCurrentImageId()).toBe(other.imageIds[4]);
  });
});
