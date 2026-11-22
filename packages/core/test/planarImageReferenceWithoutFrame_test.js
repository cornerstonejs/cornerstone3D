import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { utilities } = cornerstone3D;

const renderingEngineId = utilities.uuidv4();

/** The option sets of `isReferenceViewable` that each case asks. */
const OPTION_SETS = {
  none: {},
  withNavigation: { withNavigation: true },
  withOrientation: { withOrientation: true },
  withNavigationAndOrientation: {
    withNavigation: true,
    withOrientation: true,
  },
  asVolume: { asVolume: true },
  asVolumeWithNavigation: { asVolume: true, withNavigation: true },
};

const BACKENDS = [
  { name: 'GPU', options: {} },
  { name: 'CPU', options: { renderBackend: 'cpu' } },
];

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

/** The answers of `isReferenceViewable` for each of `OPTION_SETS`. */
function answers(viewport, viewRef) {
  return Object.fromEntries(
    Object.entries(OPTION_SETS).map(([name, options]) => [
      name,
      viewport.isReferenceViewable({ ...viewRef }, options),
    ])
  );
}

/** Each of `OPTION_SETS` with the same answer. */
function allAnswers(value) {
  return Object.fromEntries(
    Object.keys(OPTION_SETS).map((name) => [name, value])
  );
}

/**
 * The references that name an image and no frame of reference, against a
 * series shown at its image 3 and a second series of the same geometry.
 */
function referencesWithoutFrame(series, other) {
  return {
    'the image on display': { referencedImageId: series.imageIds[3] },
    'an image of another slice': { referencedImageId: series.imageIds[5] },
    'an image of another slice by its URI': {
      referencedImageURI: utilities.imageIdToURI(series.imageIds[5]),
    },
    'an image of another series': { referencedImageId: other.imageIds[5] },
  };
}

/** Puts the viewport back on image 3 of the series. */
async function backToImage3(viewport, series) {
  viewport.setViewReference({
    FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
    referencedImageId: series.imageIds[3],
  });
  await settle(viewport);
  expect(shownIndex(viewport, series)).toBe(3);
}

describe('A planar viewport given a reference that names an image and no frame of reference -- ', () => {
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

  BACKENDS.forEach((backend) => {
    it(`in volume mode on the ${backend.name} takes none of them with any option, as the legacy volume viewport`, async function () {
      const series = await createSeries({ id: `noFrameVolume${backend.name}` });
      const other = await createSeries({
        id: `noFrameVolumeOther${backend.name}`,
      });
      const volume = createNextViewport(
        renderingEngine,
        `noFrameVolume-${backend.name}`
      );

      await showVolume(volume, series, 3, backend.options);

      for (const [name, viewRef] of Object.entries(
        referencesWithoutFrame(series, other)
      )) {
        expect(answers(volume, viewRef))
          .withContext(name)
          .toEqual(allAnswers(false));
      }
    });

    it(`in volume mode on the ${backend.name} takes an image of its volume with its frame of reference and navigation, and goes there`, async function () {
      const series = await createSeries({
        id: `withFrameVolume${backend.name}`,
      });
      const volume = createNextViewport(
        renderingEngine,
        `withFrameVolume-${backend.name}`
      );

      await showVolume(volume, series, 3, backend.options);

      const viewRef = {
        FrameOfReferenceUID: volume.getFrameOfReferenceUID(),
        referencedImageId: series.imageIds[5],
      };

      expect(volume.isReferenceViewable({ ...viewRef })).toBe(false);
      expect(
        volume.isReferenceViewable({ ...viewRef }, { withNavigation: true })
      ).toBe(true);

      volume.setViewReference({ ...viewRef });
      await settle(volume);
      expect(shownIndex(volume, series)).toBe(5);
    });

    it(`in stack mode on the ${backend.name} decides them by the image and goes to an image of the stack, as the legacy stack viewport`, async function () {
      const series = await createSeries({ id: `noFrameStack${backend.name}` });
      const other = await createSeries({
        id: `noFrameStackOther${backend.name}`,
      });
      const stack = createNextViewport(
        renderingEngine,
        `noFrameStack-${backend.name}`
      );

      await showStack(stack, series, 3, backend.options);

      const references = referencesWithoutFrame(series, other);

      expect(answers(stack, references['the image on display'])).toEqual(
        allAnswers(true)
      );
      expect(answers(stack, references['an image of another slice'])).toEqual({
        none: false,
        withNavigation: true,
        withOrientation: false,
        withNavigationAndOrientation: true,
        asVolume: false,
        asVolumeWithNavigation: true,
      });
      expect(answers(stack, references['an image of another series'])).toEqual(
        allAnswers(false)
      );

      stack.setViewReference({
        ...references['an image of another slice'],
      });
      await settle(stack);
      expect(shownIndex(stack, series)).toBe(5);

      await backToImage3(stack, series);
      stack.setViewReference({
        ...references['an image of another series'],
      });
      await settle(stack);
      expect(shownIndex(stack, series)).toBe(3);
    });
  });

  it('in volume mode still takes an image that lies on the slice on display as an overlay', async function () {
    const series = await createSeries({ id: 'noFrameOverlay' });
    const other = await createSeries({ id: 'noFrameOverlayOther' });
    const volume = createNextViewport(renderingEngine, 'noFrameOverlay');

    await showVolume(volume, series, 3);

    expect(
      volume.isReferenceViewable(
        { referencedImageId: other.imageIds[3] },
        { asOverlay: true }
      )
    ).toBe(true);
    expect(
      volume.isReferenceViewable(
        { referencedImageId: other.imageIds[5] },
        { asOverlay: true }
      )
    ).toBe(false);
  });
});
