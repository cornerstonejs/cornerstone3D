import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();
const displaySetId = 'roundTripVolume';

/**
 * What two legacy volume viewports of commit 58914567b did with the series of
 * `createSeries` (8 images of 32 columns and 24 rows), both in the same
 * orientation: a sagittal view has 32 slices and opens on slice 16, a coronal
 * one has 24 and opens on slice 11. After each wheel of the first, its view
 * reference was viewable on the second with navigation (and not without it,
 * on another slice), and `setViewReference` put the second on the same slice;
 * the same the other way. A next coronal view opens on slice 12, the middle
 * in view order (its normal points against j), one slice after the legacy
 * middle in volume order.
 */
const LEGACY = {
  [OrientationAxis.SAGITTAL]: { slices: 32, firstSlice: 16 },
  [OrientationAxis.CORONAL]: { slices: 24, firstSlice: 12 },
};

async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Renders after a few frames, so that a scroll that was asked lands. */
async function settle(viewport) {
  await frames();
  await renderAndWait(viewport);
}

/** Shows the volume display set of the tests in an orientation. */
async function showVolumeIn(viewport, orientation) {
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation, mode: 'volume' },
  });
  await settle(viewport);
}

/** The depth of the focal point of a viewport along its view plane normal. */
function depthOf(viewport) {
  const { focalPoint, viewPlaneNormal } = viewport
    .getResolvedView()
    .toICamera();

  return focalPoint.reduce(
    (sum, value, axis) => sum + value * viewPlaneNormal[axis],
    0
  );
}

/**
 * Scrolls `from` by `delta`, gives its view reference to `to`, and expects
 * `to` to take it as the legacy viewport did.
 */
async function expectCopyAfterWheel(from, to, delta) {
  utilities.scroll(from, { delta });
  await settle(from);

  const viewRef = from.getViewReference();

  expect(to.isReferenceViewable(viewRef)).toBe(
    to.getSliceIndex() === from.getSliceIndex()
  );
  expect(to.isReferenceViewable(viewRef, { withNavigation: true })).toBe(true);

  to.setViewReference(viewRef);
  await settle(to);

  expect(to.getSliceIndex()).toBe(from.getSliceIndex());
  expect(depthOf(to)).toBeCloseTo(depthOf(from), 6);
}

describe('A copy of a planar volume view through its view reference -- ', () => {
  let renderingEngine;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;

    const series = await createSeries({ id: 'roundTrip' });

    cornerstone3D.displaySetRegistry.add(displaySetId, {
      imageIds: series.imageIds,
      volumeId: series.volumeId,
    });
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  for (const orientation of [
    OrientationAxis.SAGITTAL,
    OrientationAxis.CORONAL,
  ]) {
    it(`lands on the slice of the source after each wheel, there and back, in ${orientation}, as the legacy volume viewport`, async function () {
      const source = createNextViewport(renderingEngine, 'roundTripSource');
      const copy = createNextViewport(renderingEngine, 'roundTripCopy');

      await showVolumeIn(source, orientation);
      await showVolumeIn(copy, orientation);

      expect(source.getNumberOfSlices()).toBe(LEGACY[orientation].slices);
      expect(source.getSliceIndex()).toBe(LEGACY[orientation].firstSlice);

      for (const delta of [1, 3, -2, -9]) {
        await expectCopyAfterWheel(source, copy, delta);
      }

      for (const delta of [5, -1]) {
        await expectCopyAfterWheel(copy, source, delta);
      }
    });
  }
});
