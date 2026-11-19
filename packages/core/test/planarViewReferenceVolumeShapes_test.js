import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  sliceNormal,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { utilities } = cornerstone3D;

const renderingEngineId = utilities.uuidv4();

/**
 * Where the legacy volume viewport of commit 58914567b went for a view
 * reference that has only some of its fields: the images of `createSeries` as
 * a volume in its acquisition plane at image 3, a second series of the same
 * geometry in the same frame of reference, and a stack of it at its image 2.
 * The legacy volume used a slice index only with its own volume id and a
 * view plane normal; it went to the plane of a named image of its frame of
 * reference when it showed the acquisition plane, before a focal point; and
 * it threw "Incompatible view refs" for a reference of another frame of
 * reference or of none. `throws` marks those; the volume stayed at image 3.
 */
const LEGACY_LANDING = {
  otherStackReference: 2,
  otherImageOnly: 2,
  otherImageAndSliceIndex: 2,
  sliceIndexAlone: { throws: true, landing: 3 },
  sliceIndexAndFrame: 3,
  sliceIndexAndNormal: 3,
  focalPointOfImage5: 5,
  otherImageAndFocalPointOfImage5: 2,
  ownImageAndFocalPointOfImage5: 1,
  otherFrameSliceIndex: { throws: true, landing: 3 },
  otherFrameImage: { throws: true, landing: 3 },
};

async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Renders after a few frames, so that a move that was asked lands. */
async function settle(viewport) {
  await frames();
  await renderAndWait(viewport);
}

/** The index of the image that a viewport shows, in the images of a series. */
function shownIndex(viewport, series) {
  return series.imageIds.indexOf(viewport.getCurrentImageId());
}

describe('A planar viewport in volume mode given a part of a view reference -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    utilities.genericViewportDisplaySetMetadataProvider.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('goes where the legacy volume viewport went for each shape, and stays where the legacy one threw', async function () {
    const series = await createSeries({ id: 'volumeShapesSame' });
    const other = await createSeries({ id: 'volumeShapesOther' });
    const otherStack = createNextViewport(renderingEngine, 'volumeShapesStack');
    const volume = createNextViewport(renderingEngine, 'volumeShapesVolume');

    await showStack(otherStack, other, 2);
    await showVolume(volume, series, 3);

    const frame = volume.getFrameOfReferenceUID();
    const normal = sliceNormal(series);
    const pointOf = (k) =>
      worldOfVoxel(series, [series.size.columns / 2, series.size.rows / 2, k]);
    const shapes = {
      otherStackReference: otherStack.getViewReference(),
      otherImageOnly: {
        FrameOfReferenceUID: frame,
        referencedImageId: other.imageIds[2],
      },
      otherImageAndSliceIndex: {
        FrameOfReferenceUID: frame,
        referencedImageId: other.imageIds[2],
        sliceIndex: 2,
      },
      sliceIndexAlone: { sliceIndex: 5 },
      sliceIndexAndFrame: { FrameOfReferenceUID: frame, sliceIndex: 5 },
      sliceIndexAndNormal: {
        FrameOfReferenceUID: frame,
        sliceIndex: 5,
        viewPlaneNormal: normal,
      },
      focalPointOfImage5: {
        FrameOfReferenceUID: frame,
        cameraFocalPoint: pointOf(5),
        viewPlaneNormal: normal,
      },
      otherImageAndFocalPointOfImage5: {
        FrameOfReferenceUID: frame,
        referencedImageId: other.imageIds[2],
        cameraFocalPoint: pointOf(5),
        viewPlaneNormal: normal,
      },
      ownImageAndFocalPointOfImage5: {
        FrameOfReferenceUID: frame,
        referencedImageId: series.imageIds[1],
        cameraFocalPoint: pointOf(5),
        viewPlaneNormal: normal,
      },
      otherFrameSliceIndex: { FrameOfReferenceUID: 'elsewhere', sliceIndex: 5 },
      otherFrameImage: {
        FrameOfReferenceUID: 'elsewhere',
        referencedImageId: other.imageIds[2],
      },
    };

    for (const [name, viewRef] of Object.entries(shapes)) {
      volume.setViewReference({
        FrameOfReferenceUID: frame,
        referencedImageId: series.imageIds[3],
      });
      await settle(volume);

      expect(shownIndex(volume, series)).withContext(`${name}, start`).toBe(3);

      const legacy = LEGACY_LANDING[name];

      expect(() => volume.setViewReference({ ...viewRef }))
        .withContext(name)
        .not.toThrow();
      await settle(volume);

      expect(shownIndex(volume, series))
        .withContext(name)
        .toBe(typeof legacy === 'number' ? legacy : legacy.landing);
    }
  });
});
