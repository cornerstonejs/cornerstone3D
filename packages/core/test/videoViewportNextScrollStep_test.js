import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  animationFrames,
  waitFor,
} from '../../../utils/test/testUtilsVideo';

const { Enums, utilities, eventTarget } = cornerstone3D;
const { ViewportType, Events } = Enums;
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

  it('fires SCROLL_OUT_OF_BOUNDS on the element and on the eventTarget when the frames of a step pass an end, from utilities.scroll and from viewport.scroll alike', async function () {
    const viewport = await createVideoViewport(renderingEngine);
    const displaySetId = viewport.getDisplaySets()[0].displaySetId;
    const imageIds = viewport.getImageIds();
    const outcomes = {};

    viewport.setViewState({
      scrollStep: { value: 3, unit: SpeedUnit.FRAME },
    });

    for (const [name, run] of [
      [
        'utilities',
        (delta, loop) => utilities.scroll(viewport, { delta, loop }),
      ],
      ['viewport', (delta, loop) => viewport.scroll(delta, true, loop)],
    ]) {
      const onElement = [];
      const onEventTarget = [];
      const elementListener = (event) => onElement.push(event.detail);
      const eventTargetListener = (event) => onEventTarget.push(event.detail);
      const frames = [];

      viewport.element.addEventListener(
        Events.SCROLL_OUT_OF_BOUNDS,
        elementListener
      );
      eventTarget.addEventListener(
        Events.SCROLL_OUT_OF_BOUNDS,
        eventTargetListener
      );

      try {
        for (const [seconds, delta, loop] of [
          [1.8, 1, false],
          [0.1, -1, false],
          [1.5, 1, false],
          [1.8, 1, true],
          [0.1, -1, true],
        ]) {
          viewport.seek(seconds);
          await settle(viewport);
          run(delta, loop);
          await settle(viewport);
          frames.push(viewport.getCurrentImageIdIndex());
        }
      } finally {
        viewport.element.removeEventListener(
          Events.SCROLL_OUT_OF_BOUNDS,
          elementListener
        );
        eventTarget.removeEventListener(
          Events.SCROLL_OUT_OF_BOUNDS,
          eventTargetListener
        );
      }

      expect(onEventTarget).toEqual(onElement);
      outcomes[name] = { frames, details: onElement };
    }

    expect(outcomes.viewport).toEqual(outcomes.utilities);
    expect(outcomes.utilities.frames).toEqual([19, 0, 18, 1, 18]);
    expect(outcomes.utilities.details).toEqual([
      {
        viewportId: viewport.id,
        renderingEngineId,
        displaySetId,
        volumeId: undefined,
        sliceIndex: 19,
        numberOfSlices: 20,
        delta: 1,
        direction: 1,
        imageId: imageIds[19],
      },
      {
        viewportId: viewport.id,
        renderingEngineId,
        displaySetId,
        volumeId: undefined,
        sliceIndex: 0,
        numberOfSlices: 20,
        delta: -1,
        direction: -1,
        imageId: imageIds[0],
      },
    ]);
  });

  it('wraps from the last frame to the first and back with loop, one frame for each step', async function () {
    const viewport = await createVideoViewport(renderingEngine);
    const frames = [];

    viewport.seek(1.9);
    await settle(viewport);
    frames.push(viewport.getCurrentImageIdIndex());

    for (const delta of [1, -1, -1]) {
      viewport.scroll(delta, true, true);
      await settle(viewport);
      frames.push(viewport.getCurrentImageIdIndex());
    }

    expect(frames).toEqual([19, 0, 19, 18]);
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
