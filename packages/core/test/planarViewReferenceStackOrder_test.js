import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showVolume,
  waitFor,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Waits until what the viewport was asked for is drawn. */
async function settle(viewport) {
  await frames();
  await renderAndWait(viewport);
}

/** The index of the image that a viewport shows, in the images of a series. */
function shownIndex(viewport, series) {
  return series.imageIds.indexOf(viewport.getCurrentImageId());
}

/**
 * Shows the images of a series as a stack, in the order given, on the image
 * of the series `seriesIndex`, and gives the view reference of the stack
 * without its display set id, as the legacy stack viewport made it and as
 * the annotations of 5.x keep it.
 */
async function stackReferenceOf(viewport, series, imageIds, seriesIndex) {
  const displaySetId = `stack:${viewport.id}`;
  const imageIdIndex = imageIds.indexOf(series.imageIds[seriesIndex]);

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: {
      orientation: OrientationAxis.ACQUISITION,
      initialImageIdIndex: imageIdIndex,
    },
  });
  await waitFor(() => shownIndex(viewport, series) === seriesIndex);
  await settle(viewport);

  const { displaySetId: _displaySetId, ...reference } =
    viewport.getViewReference();

  return reference;
}

/**
 * A stack counts its slices in the order of its image ids, and a volume of
 * the same images in the order of its view, sorted by position. A stack in
 * the order of the series and a stack in the reverse order both show the
 * image of index 2 of the series; the volume gives that image one slice
 * index, so one of the two stacks gives it another. The slice index of a
 * stack is not read on a volume: the image and the plane of the reference
 * decide.
 */
describe('A view reference of a stack on a volume of the same images in another order -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    cornerstone3D.displaySetRegistry.clear();
  });

  for (const orientation of [
    OrientationAxis.ACQUISITION,
    OrientationAxis.AXIAL,
  ]) {
    it(`a volume in ${orientation} takes the reference of the image on display from a stack in either order, and not that of another image`, async function () {
      const series = await createSeries({ id: `stackOrder-${orientation}` });
      const volume = createNextViewport(renderingEngine, 'stackOrderVolume');
      const stack = createNextViewport(renderingEngine, 'stackOrderStack');
      const orders = {
        'in the order of the series': series.imageIds,
        'in the reverse order': [...series.imageIds].reverse(),
      };

      await showVolume(volume, series, 2, { orientation });

      expect(shownIndex(volume, series)).toBe(2);

      for (const [name, imageIds] of Object.entries(orders)) {
        const onDisplay = await stackReferenceOf(stack, series, imageIds, 2);
        const other = await stackReferenceOf(stack, series, imageIds, 6);

        expect(onDisplay.sliceIndex)
          .withContext(name)
          .toBe(imageIds.indexOf(series.imageIds[2]));
        expect(volume.isReferenceViewable(onDisplay))
          .withContext(name)
          .toBe(true);
        expect(volume.isReferenceViewable(other)).withContext(name).toBe(false);
        expect(volume.isReferenceViewable(other, { withNavigation: true }))
          .withContext(name)
          .toBe(true);
      }

      const other = await stackReferenceOf(
        stack,
        series,
        orders['in the reverse order'],
        6
      );

      volume.setViewReference(other);
      await settle(volume);

      expect(shownIndex(volume, series)).toBe(6);
      expect(volume.isReferenceViewable(other)).toBe(true);
    });
  }
});
