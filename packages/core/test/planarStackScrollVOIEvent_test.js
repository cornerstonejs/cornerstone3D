import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  waitFor,
} from './utils/planarSeriesBothModes';

const { Enums, cache, utilities } = cornerstone3D;
const { Events, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The window of the images 4 and 5 of the series, and its VOI range. */
const OTHER_WINDOW = { windowWidth: 737, windowCenter: 343 };
const OTHER_RANGE = { lower: -25.5, upper: 710.5 };

/** The VOI range of the window of the other images (400 and 40). */
const FIRST_RANGE = { lower: -160, upper: 239 };

const CASES = [
  ['on the GPU', {}],
  ['on the CPU', { renderBackend: 'cpu' }],
];

/**
 * Loads a series of 8 images. The images 4 and 5 get another window than
 * the others, as the images of an MR series can have.
 */
async function createSeriesWithTwoWindows(id) {
  const series = await createSeries({ id });

  [4, 5].forEach((index) => {
    Object.assign(cache.getImage(series.imageIds[index]), OTHER_WINDOW);
  });

  return series;
}

/** Shows the image of an index of the stack and waits for its draw. */
async function scrollTo(viewport, series, imageIdIndex) {
  viewport.setViewState({ slice: { kind: 'stackIndex', imageIdIndex } });
  await waitFor(
    () => viewport.getCurrentImageId() === series.imageIds[imageIdIndex]
  );
  await renderAndWait(viewport);
}

/** The ranges of the VOI_MODIFIED events of a viewport from now on. */
function recordVOIRanges(viewport) {
  const ranges = [];

  viewport.element.addEventListener(Events.VOI_MODIFIED, (evt) => {
    ranges.push({ ...evt.detail.range });
  });

  return ranges;
}

describe('A stack on a direct next planar viewport whose images have their own windows -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  for (const [where, options] of CASES) {
    it(`fires no VOI_MODIFIED with a range whose upper end is below its lower end, when a scroll shows an image with a window of width 0, ${where}`, async function () {
      const series = await createSeries({ id: `scrollNoWindow-${where}` });
      const viewport = createNextViewport(renderingEngine, 'scrollNoWindow');

      Object.assign(cache.getImage(series.imageIds[3]), {
        windowWidth: 0,
        windowCenter: 0,
      });
      await showStack(viewport, series, 0, options);

      const ranges = recordVOIRanges(viewport);

      await scrollTo(viewport, series, 3);

      expect(
        viewport.getDefaultVOIRange(viewport.getSourceDisplaySetId())
      ).toEqual({
        lower: 0,
        upper: -1,
      });
      expect(ranges).toEqual([]);
    });

    it(`fires VOI_MODIFIED for the window of the source and none for the window of a stack that is drawn over it, ${where}`, async function () {
      const series = await createSeries({ id: `overlayVOI-${where}` });
      const overlay = await createSeries({ id: `overlayVOIOver-${where}` });
      const viewport = createNextViewport(renderingEngine, 'overlayVOI');

      await showStack(viewport, series, 0, options);

      const sourceId = viewport.getSourceDisplaySetId();
      const overlayId = 'overlayVOI:over';
      const ranges = recordVOIRanges(viewport);

      cornerstone3D.displaySetRegistry.add(overlayId, {
        imageIds: overlay.imageIds,
        initialImageIdIndex: 0,
      });
      await viewport.addDisplaySet(overlayId, {
        orientation: OrientationAxis.ACQUISITION,
        role: 'overlay',
        ...options,
      });
      await renderAndWait(viewport);
      viewport.setDisplaySetPresentation(overlayId, {
        voiRange: { lower: 5, upper: 50 },
      });
      await renderAndWait(viewport);

      expect(viewport.getSourceDisplaySetId()).toBe(sourceId);
      expect(
        viewport.getDisplaySets().map(({ displaySetId }) => displaySetId)
      ).toEqual([sourceId, overlayId]);
      expect(viewport.getDisplaySetPresentation(overlayId).voiRange).toEqual({
        lower: 5,
        upper: 50,
      });
      expect(ranges).toEqual([]);

      viewport.setDisplaySetPresentation(sourceId, {
        voiRange: { lower: 0, upper: 100 },
      });
      await renderAndWait(viewport);

      expect(ranges).toEqual([{ lower: 0, upper: 100 }]);
    });

    it(`fires one VOI_MODIFIED with the window of the new image when a scroll shows an image with another window, and none when the window is the same, ${where}`, async function () {
      const series = await createSeriesWithTwoWindows(`scrollVOI-${where}`);
      const viewport = createNextViewport(renderingEngine, 'scrollVOI');

      await showStack(viewport, series, 0, options);

      const displaySetId = viewport.getSourceDisplaySetId();
      const ranges = recordVOIRanges(viewport);

      await scrollTo(viewport, series, 1);
      expect(ranges).toEqual([]);

      await scrollTo(viewport, series, 4);
      expect(ranges).toEqual([OTHER_RANGE]);
      expect(viewport.getDefaultVOIRange(displaySetId)).toEqual(OTHER_RANGE);
      expect(
        viewport.getDisplaySetPresentation(displaySetId)?.voiRange
      ).toBeUndefined();

      await scrollTo(viewport, series, 5);
      expect(ranges).toEqual([OTHER_RANGE]);

      await scrollTo(viewport, series, 0);
      expect(ranges).toEqual([OTHER_RANGE, FIRST_RANGE]);
    });

    it(`fires no VOI_MODIFIED on a scroll while a window is set, as the window on display stays, ${where}`, async function () {
      const series = await createSeriesWithTwoWindows(`scrollSetVOI-${where}`);
      const viewport = createNextViewport(renderingEngine, 'scrollSetVOI');

      await showStack(viewport, series, 0, options);

      const displaySetId = viewport.getSourceDisplaySetId();

      viewport.setDisplaySetPresentation(displaySetId, {
        voiRange: { lower: 0, upper: 100 },
      });
      await renderAndWait(viewport);

      const ranges = recordVOIRanges(viewport);

      await scrollTo(viewport, series, 4);
      await scrollTo(viewport, series, 0);

      expect(ranges).toEqual([]);
      expect(viewport.getDisplaySetPresentation(displaySetId).voiRange).toEqual(
        { lower: 0, upper: 100 }
      );
    });
  }
});
