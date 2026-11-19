import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  animationFrames,
  waitFor,
} from '../../../utils/test/testUtilsVideo';

const { Enums, utilities } = cornerstone3D;
const { ViewportType } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * How far the legacy video viewport of commit 58914567b moved the time of a
 * playing video back when `setCamera`, `setPan`, `setScrollSpeed` or
 * `setProperties` was called 150 ms after the last read of the time: not at
 * all. Those calls did not write the time.
 */
const LEGACY_SETBACK_SECONDS = 0;

/** Makes a direct next video viewport. */
function createViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    width: 320,
    height: 200,
    useEnableElement: true,
    orientation: null,
    viewportId: 'nextVideoTime',
    viewportType: ViewportType.VIDEO_NEXT,
  });

  return renderingEngine.getViewport('nextVideoTime');
}

/** The video element that a direct next video viewport shows. */
function videoElementOf(viewport) {
  return viewport.element.querySelector('video');
}

/**
 * Keeps the main thread busy, so that no animation frame and no media event
 * reads the time while the video plays on.
 */
function busyWait(milliseconds) {
  const start = performance.now();

  while (performance.now() - start < milliseconds) {
    Math.sqrt(start);
  }
}

describe('A direct next video viewport that plays, and a write of its view state -- ', () => {
  let renderingEngine;
  let videoUrl;
  let viewport;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    videoUrl = addTestVideoMetadata();
    viewport = createViewport(renderingEngine);
    await viewport.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });
    await waitFor(
      () =>
        videoElementOf(viewport).readyState >= 2 &&
        !videoElementOf(viewport).seeking
    );
    await animationFrames(3);
  }, 15000);

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    URL.revokeObjectURL(videoUrl);
  });

  const writes = {
    'a view state key': (next) => next.setViewState({ rotation: 0 }),
    'the scroll step': (next) =>
      next.setViewState({
        scrollStep: { value: 2, unit: Enums.VideoEnums.SpeedUnit.FRAME },
      }),
    'a pan': (next) => next.setPan([0, 0]),
    'a reset of the view state': (next) => next.resetViewState(),
  };

  for (const [name, write] of Object.entries(writes)) {
    it(`keeps the time of the media for ${name}, as the legacy viewport`, async function () {
      const element = videoElementOf(viewport);

      await viewport.play();
      await new Promise((resolve) => setTimeout(resolve, 150));

      const lastRead = viewport.getCurrentTime();

      busyWait(150);
      await Promise.resolve();

      const before = element.currentTime;

      write(viewport);

      const after = element.currentTime;

      viewport.pause();

      expect(before - lastRead).toBeGreaterThan(0.1);
      expect(before - after).toBeLessThanOrEqual(
        LEGACY_SETBACK_SECONDS + 0.001
      );
    });
  }
});
