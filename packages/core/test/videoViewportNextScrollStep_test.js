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
const { SpeedUnit } = Enums.VideoEnums;

const renderingEngineId = utilities.uuidv4();

/**
 * What the legacy video viewport of commit 58914567b gave with the test video
 * (20 frames at 10 frames a second), from the frame index 5, for each
 * `setScrollSpeed(value, unit)`: the frame index after `scroll(1)`, after
 * `utilities.scroll` with a delta of 1 and after `scroll(-1)`, its
 * `getNumberOfSlices()`, and its `getSliceIndex()` at the frame index 5.
 */
const LEGACY_STEPS = [
  {
    scrollStep: { value: 1, unit: SpeedUnit.FRAME },
    afterScroll: 6,
    afterUtility: 7,
    afterBack: 6,
    slices: 20,
    sliceIndexAtStart: 5,
  },
  {
    scrollStep: { value: 2, unit: SpeedUnit.FRAME },
    afterScroll: 7,
    afterUtility: 9,
    afterBack: 7,
    slices: 10,
    sliceIndexAtStart: 2.5,
  },
  {
    scrollStep: { value: 3, unit: SpeedUnit.FRAME },
    afterScroll: 8,
    afterUtility: 11,
    afterBack: 8,
    slices: 7,
    sliceIndexAtStart: 5 / 3,
  },
  {
    scrollStep: { value: 0.5, unit: SpeedUnit.SECOND },
    afterScroll: 10,
    afterUtility: 15,
    afterBack: 10,
    slices: 4,
    sliceIndexAtStart: 1,
  },
];

function videoElement(viewport) {
  return viewport.element.querySelector('video');
}

/** Waits until the video element has its frame after a seek. */
async function settle(viewport) {
  await waitFor(() => !videoElement(viewport).seeking);
  await animationFrames(3);
}

/** Makes a direct next video viewport with the test video, paused. */
async function createVideoViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    width: 320,
    height: 200,
    useEnableElement: true,
    orientation: null,
    viewportId: 'nextVideoScrollStep',
    viewportType: ViewportType.VIDEO,
  });

  const viewport = renderingEngine.getViewport('nextVideoScrollStep');

  await viewport.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });
  viewport.pause();
  await waitFor(() => videoElement(viewport).readyState >= 2);
  await settle(viewport);

  return viewport;
}

describe('The scroll step of a direct next video viewport -- ', () => {
  let renderingEngine;
  let videoUrl;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    videoUrl = addTestVideoMetadata();
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    URL.revokeObjectURL(videoUrl);
  });

  it('moves each scroll and each step of utilities.scroll by the scroll step of the view state, in frames or in seconds, as the legacy setScrollSpeed', async function () {
    const viewport = await createVideoViewport(renderingEngine);

    for (const legacy of LEGACY_STEPS) {
      viewport.setViewState({ scrollStep: legacy.scrollStep });
      viewport.seek(0.5);
      await settle(viewport);

      expect(viewport.getCurrentImageIdIndex()).toBe(5);
      expect(viewport.getNumberOfSlices()).toBe(legacy.slices);
      expect(viewport.getSliceIndex()).toBeCloseTo(legacy.sliceIndexAtStart, 6);

      viewport.scroll(1);
      await settle(viewport);
      expect(viewport.getCurrentImageIdIndex()).toBe(legacy.afterScroll);

      utilities.scroll(viewport, { delta: 1 });
      await settle(viewport);
      expect(viewport.getCurrentImageIdIndex()).toBe(legacy.afterUtility);

      viewport.scroll(-1);
      await settle(viewport);
      expect(viewport.getCurrentImageIdIndex()).toBe(legacy.afterBack);
    }
  });

  it('keeps the scroll step on a reset of the view state and on a new mount, as the legacy scroll speed stayed on resetCamera and setVideo', async function () {
    const viewport = await createVideoViewport(renderingEngine);
    const scrollStep = { value: 2, unit: SpeedUnit.FRAME };

    viewport.setViewState({ scrollStep });
    viewport.resetViewState();
    expect(viewport.getViewState().scrollStep).toEqual(scrollStep);

    await viewport.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });
    viewport.pause();
    await settle(viewport);
    expect(viewport.getViewState().scrollStep).toEqual(scrollStep);
    expect(viewport.getNumberOfSlices()).toBe(10);

    viewport.setViewState({ scrollStep: undefined });
    expect(viewport.getViewState().scrollStep).toBeUndefined();
    expect(viewport.getNumberOfSlices()).toBe(20);
  });
});
