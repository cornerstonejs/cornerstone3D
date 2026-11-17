import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  animationFrames,
  waitFor,
} from '../../../utils/test/testUtilsVideo';

const { Enums, utilities } = cornerstone3D;
const { ViewportType, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const WIDTH = 320;
const HEIGHT = 200;

/**
 * Makes the viewport of the legacy `VIDEO` type, which is the legacy adapter
 * of the video viewport, and a direct next video viewport of one size in one
 * rendering engine.
 */
function createViewports(renderingEngine) {
  const viewportOptions = {
    width: WIDTH,
    height: HEIGHT,
    useEnableElement: true,
    orientation: null,
  };

  testUtils.createViewports(renderingEngine, {
    ...viewportOptions,
    viewportId: 'legacyVideo',
    viewportType: ViewportType.VIDEO,
  });
  testUtils.createViewports(renderingEngine, {
    ...viewportOptions,
    viewportId: 'nextVideo',
    viewportType: ViewportType.VIDEO_NEXT,
  });

  return [
    renderingEngine.getViewport('legacyVideo'),
    renderingEngine.getViewport('nextVideo'),
  ];
}

/** The video element that the viewport of the legacy type shows. */
function legacyVideoElement(legacy) {
  return legacy.element.querySelector('video');
}

/** The video element that a direct next video viewport shows. */
function nextVideoElement(next) {
  return next.element.querySelector('video');
}

/**
 * Shows the test video on both viewports, on the first frame, paused, and
 * waits until both show that frame.
 */
async function showVideo(legacy, next) {
  await legacy.setVideo(TEST_VIDEO.imageId, 1);
  await next.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });
  next.setFrameNumber(1);
  await waitFor(
    () =>
      legacyVideoElement(legacy).paused &&
      legacyVideoElement(legacy).readyState >= 2 &&
      legacyVideoElement(legacy).currentTime === 0 &&
      nextVideoElement(next).readyState >= 2 &&
      nextVideoElement(next).currentTime === 0 &&
      !nextVideoElement(next).seeking
  );
  await animationFrames(3);
}

/**
 * Records the new image events of an element from now on: NEW_IMAGE, and
 * STACK_NEW_IMAGE that only a legacy adapter fires.
 */
function recordNewImageEvents(element) {
  const events = { newImage: [], stack: [] };

  element.addEventListener(Events.NEW_IMAGE, (evt) => {
    events.newImage.push(evt.detail);
  });
  element.addEventListener(Events.STACK_NEW_IMAGE, (evt) => {
    events.stack.push(evt.detail);
  });

  return events;
}

/** Counts the IMAGE_RENDERED events of an element. */
function countImageRendered(element) {
  const counter = { count: 0, details: [] };

  element.addEventListener(Events.IMAGE_RENDERED, (evt) => {
    counter.count++;
    counter.details.push(evt.detail);
  });

  return counter;
}

describe('Direct next video viewport -- ', () => {
  let renderingEngine;
  let videoUrl;
  let legacy;
  let next;

  beforeEach(async function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });

    renderingEngine = testEnv.renderingEngine;
    videoUrl = addTestVideoMetadata();
    [legacy, next] = createViewports(renderingEngine);
    await showVideo(legacy, next);
  }, 15000);

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    URL.revokeObjectURL(videoUrl);
  });

  it('fires IMAGE_RENDERED once after a pan, as the legacy viewport does after a camera move', async function () {
    const legacyRendered = countImageRendered(legacy.element);
    const nextRendered = countImageRendered(next.element);

    legacy.setCamera({ focalPoint: [20, 20, 0] });
    next.setPan([12, 6]);
    await animationFrames(3);

    expect(legacyRendered.count).toBe(1);
    expect(nextRendered.count).toBe(1);
    expect(nextRendered.details[0]).toEqual(
      jasmine.objectContaining({
        element: next.element,
        viewportId: 'nextVideo',
        renderingEngineId,
        imageIndex: 0,
        numberOfSlices: TEST_VIDEO.numberOfFrames,
      })
    );
  });

  it('fires IMAGE_RENDERED once for each zoom, resize and render', async function () {
    const nextRendered = countImageRendered(next.element);

    next.setZoom(2);
    await animationFrames(3);
    expect(nextRendered.count).toBe(1);

    next.resize();
    await animationFrames(3);
    expect(nextRendered.count).toBe(2);

    next.render();
    next.render();
    await animationFrames(3);
    expect(nextRendered.count).toBe(3);
  });

  it('fires IMAGE_RENDERED for a frame of a seek', async function () {
    const legacyRendered = countImageRendered(legacy.element);
    const nextRendered = countImageRendered(next.element);

    legacy.setFrameNumber(6);
    next.setFrameNumber(6);
    await waitFor(
      () =>
        legacyRendered.count > 0 &&
        nextRendered.details.some((detail) => detail.imageIndex === 5)
    );
    await animationFrames(3);

    expect(legacyRendered.details.at(-1).imageIndex).toBe(5);
    expect(nextRendered.details.at(-1).imageIndex).toBe(5);
    expect(nextRendered.count).toBeLessThanOrEqual(2);
  });

  it('fires NEW_IMAGE once for the frame of a seek, with the frame index, the number of frames and the image id, and no STACK_NEW_IMAGE', async function () {
    const events = recordNewImageEvents(next.element);

    next.setFrameNumber(6);
    await waitFor(() => events.newImage.length > 0);
    await animationFrames(3);

    expect(next.getCurrentImageIdIndex()).toBe(5);
    expect(next.getNumberOfSlices()).toBe(TEST_VIDEO.numberOfFrames);
    expect(events.newImage).toEqual([
      {
        viewportId: 'nextVideo',
        renderingEngineId,
        imageIdIndex: 5,
        numberOfSlices: TEST_VIDEO.numberOfFrames,
        imageId: next.getCurrentImageId(),
        image: undefined,
      },
    ]);
    expect(typeof events.newImage[0].imageId).toBe('string');
    expect(events.stack).toEqual([]);
  });

  it('fires NEW_IMAGE for each new frame while it plays, and no STACK_NEW_IMAGE', async function () {
    const events = recordNewImageEvents(next.element);

    await next.play();
    await waitFor(() => events.newImage.length >= 3);
    next.pause();
    await animationFrames(3);

    const indices = events.newImage.map(({ imageIdIndex }) => imageIdIndex);

    expect(new Set(indices).size).toBe(indices.length);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    events.newImage.forEach((detail) => {
      expect(detail).toEqual({
        viewportId: 'nextVideo',
        renderingEngineId,
        imageIdIndex: detail.imageIdIndex,
        numberOfSlices: TEST_VIDEO.numberOfFrames,
        imageId: next.getImageIds()[detail.imageIdIndex],
        image: undefined,
      });
    });
    expect(events.stack).toEqual([]);
  });

  it('keeps STACK_NEW_IMAGE of the legacy adapter for the frame of a seek, with the time and the duration, and fires NEW_IMAGE too', async function () {
    const events = recordNewImageEvents(legacy.element);

    legacy.setFrameNumber(6);
    await waitFor(() => events.stack.length > 0 && events.newImage.length > 0);
    await animationFrames(3);

    expect(events.stack).toEqual([
      {
        element: legacy.element,
        imageId: events.newImage[0].imageId,
        imageIdIndex: 5,
        viewportId: 'legacyVideo',
        renderingEngineId,
        time: legacyVideoElement(legacy).currentTime,
        duration: legacyVideoElement(legacy).duration,
      },
    ]);
    expect(events.newImage).toEqual([
      {
        viewportId: 'legacyVideo',
        renderingEngineId,
        imageIdIndex: 5,
        numberOfSlices: TEST_VIDEO.numberOfFrames,
        imageId: jasmine.any(String),
        image: undefined,
      },
    ]);
  });

  it('fires IMAGE_RENDERED while it plays, not more often than the legacy viewport', async function () {
    const legacyRendered = countImageRendered(legacy.element);
    const nextRendered = countImageRendered(next.element);

    await Promise.all([legacy.play(), next.play()]);
    await new Promise((resolve) => setTimeout(resolve, 700));
    legacy.pause();
    next.pause();

    expect(nextRendered.count).toBeGreaterThan(0);
    expect(nextRendered.count).toBeLessThanOrEqual(legacyRendered.count);
  });

  it('gives the pixels of the frame on display as the legacy viewport does', async function () {
    legacy.setFrameNumber(6);
    next.setFrameNumber(6);
    await waitFor(
      () =>
        legacy.getFrameNumber() === 6 &&
        next.getFrameNumber() === 6 &&
        !legacyVideoElement(legacy).seeking &&
        !nextVideoElement(next).seeking
    );
    await animationFrames(3);

    const legacyData = legacy.getImageData();
    const nextData = next.getImageData();

    expect(nextData.dimensions).toEqual(legacyData.dimensions);
    expect(nextData.spacing).toEqual(legacyData.spacing);
    expect(nextData.origin).toEqual(legacyData.origin);
    expect(nextData.direction).toEqual(legacyData.direction);
    expect(nextData.hasPixelSpacing).toBe(false);
    expect(nextData.metadata.Modality).toBe('XC');
    expect(nextData.metadata.Modality).toBe(legacyData.metadata.Modality);
    expect(nextData.scalarData.length).toBe(
      TEST_VIDEO.width * TEST_VIDEO.height * 4
    );
    expect(Array.from(nextData.scalarData)).toEqual(
      Array.from(legacyData.scalarData)
    );
    [
      [0, 0, 0],
      [10, 20, 0],
      [63, 47, 0],
    ].forEach((point) => {
      expect(nextData.imageData.worldToIndex(point)).toEqual(
        legacyData.imageData.worldToIndex(point).map(Math.round)
      );
      expect(nextData.voxelManager.getAtIJKPoint(point)).toEqual(
        legacyData.voxelManager.getAtIJKPoint(point)
      );
    });
    expect(nextData.metadata.Modality).toBe(legacy.modality);
    expect(
      utilities.VideoUtilities.getVideoImageDataMetadata(TEST_VIDEO.imageId)
    ).toEqual(legacy.getImageDataMetadata(TEST_VIDEO.imageId));
  });

  it('answers for an image URI of its video through isReferenceViewable, where the legacy viewport has hasImageURI', async function () {
    const uri = 'https://test.video/studies/1/series/2/instances/3';
    const otherURI = 'https://test.video/studies/1/series/9';
    const holds = (imageURI) =>
      next.isReferenceViewable(
        { referencedImageURI: imageURI },
        { withNavigation: true }
      );
    const shows = (imageURI) =>
      next.isReferenceViewable({ referencedImageURI: imageURI });

    expect(next.hasImageURI).toBeUndefined();
    [`${uri}/frames/7`, uri, `${uri}/frames/3-9`, otherURI].forEach(
      (imageURI) => {
        expect(holds(imageURI)).toBe(legacy.hasImageURI(imageURI));
        expect(
          utilities.getViewportsWithImageURI(imageURI).includes(next)
        ).toBe(utilities.getViewportsWithImageURI(imageURI).includes(legacy));
      }
    );
    expect(holds(uri)).toBe(true);
    expect(holds(otherURI)).toBe(false);
    expect(utilities.getViewportsWithImageURI(uri)).toContain(next);

    expect(next.getFrameNumber()).toBe(1);
    expect(shows(uri)).toBe(true);
    expect(shows(`${uri}/frames/1`)).toBe(true);
    expect(shows(`${uri}/frames/7`)).toBe(false);
    expect(shows(`${uri}/frames/3-9`)).toBe(false);
    expect(shows(otherURI)).toBe(false);

    next.setFrameNumber(5);
    await waitFor(
      () => next.getFrameNumber() === 5 && !nextVideoElement(next).seeking
    );

    expect(shows(uri)).toBe(true);
    expect(shows(`${uri}/frames/3-9`)).toBe(true);
    expect(shows(`${uri}/frames/7`)).toBe(false);
    expect(shows(`${uri}/frames/1`)).toBe(false);
  });

  it('keeps the frame range in the view state, where the legacy viewport has setFrameRange', function () {
    expect(next.setFrameRange).toBeUndefined();
    expect(next.getFrameRange).toBeUndefined();
    expect(next.getViewState().frameRange).toBeUndefined();
    expect(legacy.getFrameRange()).toEqual([1, TEST_VIDEO.numberOfFrames]);

    legacy.setFrameRange([5, 10]);
    next.setViewState({ frameRange: [5, 10] });

    expect(next.getViewState().frameRange).toEqual(legacy.getFrameRange());
    expect(next.getViewState().frameRange).toEqual([5, 10]);

    next.setViewState({ rotation: 90 });

    expect(next.getViewState().frameRange).toEqual([5, 10]);

    [[7, 7], [1, 2, 3], undefined].forEach((frameRange) => {
      next.setViewState({ frameRange: [5, 10] });
      next.setViewState({ frameRange });

      expect(next.getViewState().frameRange).toBeUndefined();
    });

    next.setViewState({ frameRange: [5, 10] });
    next.resetViewState();

    expect(next.getViewState().frameRange).toBeUndefined();
  });

  it('drops the frame range of the view state when another video is mounted', async function () {
    next.setViewState({ frameRange: [5, 10] });
    await next.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });

    expect(next.getViewState().frameRange).toBeUndefined();
  });

  it('plays inside the frame range as the legacy viewport does', async function () {
    const samples = { legacy: [], next: [] };

    legacy.setFrameRange([5, 10]);
    next.setViewState({ frameRange: [5, 10] });
    expect(legacy.togglePlayPause()).toBe(true);
    next.play();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(nextVideoElement(next).paused).toBe(false);

    const start = performance.now();

    await waitFor(() => {
      samples.legacy.push(legacy.getFrameNumber());
      samples.next.push(next.getFrameNumber());

      return performance.now() - start > 1500;
    }, 3000);

    expect(legacy.togglePlayPause()).toBe(false);
    next.pause();
    expect(nextVideoElement(next).paused).toBe(true);

    [samples.legacy, samples.next].forEach((frames) => {
      expect(Math.min(...frames)).toBeGreaterThanOrEqual(5);
      expect(Math.max(...frames)).toBeLessThanOrEqual(11);
      expect(Math.max(...frames)).toBeGreaterThanOrEqual(9);
      expect(frames.some((frame, index) => frame < frames[index - 1])).toBe(
        true
      );
    });
  }, 10000);

  it('shows an annotation over a range of frames as the legacy viewport does', async function () {
    const base = TEST_VIDEO.imageId.replace(/\/frames\/1$/, '');
    const referenceOf = (viewport) => ({
      FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
      referencedImageId: `${base}/frames/3`,
      sliceIndex: 2,
      multiSliceReference: {
        referencedImageId: `${base}/frames/9`,
        sliceIndex: 8,
      },
    });
    const goTo = async (frameNumber) => {
      legacy.setFrameNumber(frameNumber);
      next.setFrameNumber(frameNumber);
      await waitFor(
        () =>
          legacy.getFrameNumber() === frameNumber &&
          next.getFrameNumber() === frameNumber,
        10000
      );
    };

    for (const [frameNumber, viewable] of [
      [3, true],
      [6, true],
      [9, true],
      [2, false],
      [11, false],
    ]) {
      await goTo(frameNumber);
      expect(legacy.isReferenceViewable(referenceOf(legacy))).toBe(viewable);
      expect(next.isReferenceViewable(referenceOf(next))).toBe(viewable);
    }

    await goTo(10);
    expect(next.isReferenceViewable(referenceOf(next))).toBe(false);

    await goTo(6);

    const nextRange = next.getViewReference({
      sliceIndex: 2,
      rangeEndSliceIndex: 8,
    });

    expect(nextRange.sliceIndex).toBe(2);
    expect(nextRange.multiSliceReference.sliceIndex).toBe(8);
    expect(next.isReferenceViewable(nextRange)).toBe(true);
    await goTo(10);
    expect(next.isReferenceViewable(nextRange)).toBe(false);
  }, 60000);

  it('gives a range reference while it plays a frame range', async function () {
    legacy.setFrameRange([3, 9]);
    next.setViewState({ frameRange: [3, 9] });
    await Promise.all([legacy.play(), next.play()]);
    await animationFrames(3);

    const legacyReference = legacy.getViewReference();
    const nextReference = next.getViewReference();

    legacy.pause();
    next.pause();

    expect(legacyReference.multiSliceReference.sliceIndex).toBe(8);
    expect(nextReference.multiSliceReference.sliceIndex).toBe(8);
    expect(nextReference.sliceIndex).toBe(2);
    expect(nextReference.multiSliceReference.referencedImageId).toBe(
      legacyReference.multiSliceReference.referencedImageId
    );

    await waitFor(() => nextVideoElement(next).paused);
    expect(next.getViewReference().multiSliceReference).toBeUndefined();
  });

  it('maps world points to where a rotated video shows them', async function () {
    const centre = next.canvasToWorld([WIDTH / 2, HEIGHT / 2]);
    const corners = [
      [0, 0, 0],
      [TEST_VIDEO.width, 0, 0],
      [0, TEST_VIDEO.height, 0],
      [TEST_VIDEO.width, TEST_VIDEO.height, 0],
    ];

    for (const rotation of [90, 180, 270, 30]) {
      next.setViewState({ rotation });
      await animationFrames(2);

      const elementRect = next.element.getBoundingClientRect();
      const videoRect = nextVideoElement(next).getBoundingClientRect();
      const canvasCorners = corners.map((corner) => next.worldToCanvas(corner));
      const xs = canvasCorners.map((point) => point[0]);
      const ys = canvasCorners.map((point) => point[1]);

      expect(Math.min(...xs)).toBeCloseTo(videoRect.left - elementRect.left, 0);
      expect(Math.max(...xs)).toBeCloseTo(
        videoRect.right - elementRect.left,
        0
      );
      expect(Math.min(...ys)).toBeCloseTo(videoRect.top - elementRect.top, 0);
      expect(Math.max(...ys)).toBeCloseTo(
        videoRect.bottom - elementRect.top,
        0
      );
      corners.forEach((corner) => {
        const world = next.canvasToWorld(next.worldToCanvas(corner));

        expect(world[0]).toBeCloseTo(corner[0], 6);
        expect(world[1]).toBeCloseTo(corner[1], 6);
      });

      const rotatedCentre = next.canvasToWorld([WIDTH / 2, HEIGHT / 2]);

      expect(rotatedCentre[0]).toBeCloseTo(centre[0], 6);
      expect(rotatedCentre[1]).toBeCloseTo(centre[1], 6);
    }

    next.setViewState({ rotation: 90 });
    await animationFrames(2);

    const topLeft = next.worldToCanvas([0, 0, 0]);
    const videoRect = nextVideoElement(next).getBoundingClientRect();
    const elementRect = next.element.getBoundingClientRect();

    expect(topLeft[0]).toBeCloseTo(videoRect.right - elementRect.left, 0);
    expect(topLeft[1]).toBeCloseTo(videoRect.top - elementRect.top, 0);
  });

  it('applies the invert of the presentation to the video', async function () {
    const displaySetId = TEST_VIDEO.imageId;

    next.setDisplaySetPresentation(displaySetId, { invert: true });
    expect(getComputedStyle(nextVideoElement(next)).filter).toContain(
      'invert(1)'
    );

    next.setDisplaySetPresentation(displaySetId, {
      voiRange: { lower: 20, upper: 200 },
    });
    expect(getComputedStyle(nextVideoElement(next)).filter).toContain(
      'invert(1)'
    );
    expect(getComputedStyle(nextVideoElement(next)).filter).toContain('url(');

    next.setDisplaySetPresentation(displaySetId, { invert: false });
    expect(getComputedStyle(nextVideoElement(next)).filter).not.toContain(
      'invert'
    );
  });

  it('keeps the canvas of its element, of the viewport size, and draws no frame into it', async function () {
    const { canvas } = next;

    await animationFrames(3);

    const { data } = canvas
      .getContext('2d')
      .getImageData(0, 0, canvas.width, canvas.height);

    expect(canvas).toBe(next.element.querySelector('canvas'));
    expect(next.canvas).toBe(canvas);
    expect(canvas.clientWidth).toBe(WIDTH);
    expect(canvas.clientHeight).toBe(HEIGHT);
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((value, index) => value === data[index % 4])).toBe(true);
  });

  it('says video as its content mode, the mode that getViewportContentMode gives for the legacy video viewport, and empty with nothing mounted', function () {
    testUtils.createViewports(renderingEngine, {
      width: WIDTH,
      height: HEIGHT,
      useEnableElement: true,
      orientation: null,
      viewportId: 'emptyNextVideo',
      viewportType: ViewportType.VIDEO_NEXT,
    });

    expect(next.getCurrentMode()).toBe('video');
    expect(utilities.getViewportContentMode(next)).toBe(
      utilities.getViewportContentMode(legacy)
    );
    expect(utilities.isInAcquisitionPlane(next)).toBe(true);
    expect(utilities.isInAcquisitionPlane(next)).toBe(
      utilities.isInAcquisitionPlane(legacy)
    );
    expect(renderingEngine.getViewport('emptyNextVideo').getCurrentMode()).toBe(
      'empty'
    );
  });

  it('has none of the old members of the legacy video viewport', function () {
    for (const member of [
      'togglePlayPause',
      'getImageDataMetadata',
      'getCanvas',
      'getSliceIndexForImage',
      'hasImageURI',
      'setFrameRange',
      'getFrameRange',
    ]) {
      expect(next[member]).toBeUndefined();
      expect(typeof legacy[member]).toBe('function');
    }

    expect('modality' in next).toBe(false);
    expect(legacy.modality).toBeDefined();
  });
});

describe('Direct next video viewport at mount -- ', () => {
  let renderingEngine;
  let videoUrl;
  let legacy;
  let next;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });

    renderingEngine = testEnv.renderingEngine;
    videoUrl = addTestVideoMetadata();
    [legacy, next] = createViewports(renderingEngine);
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    URL.revokeObjectURL(videoUrl);
  });

  /** The frame on display, the time and the paused flag of a viewport. */
  function frameState(viewport, video) {
    return [viewport.getFrameNumber(), video.currentTime, video.paused];
  }

  it('opens on frame 1 on each of ten mounts, as the legacy viewport does', async function () {
    await legacy.setVideo(TEST_VIDEO.imageId);
    await animationFrames(3);

    expect(frameState(legacy, legacyVideoElement(legacy))).toEqual([
      1,
      0,
      true,
    ]);

    const states = [];

    for (let mount = 0; mount < 10; mount++) {
      await next.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });
      states.push(frameState(next, nextVideoElement(next)));
      await animationFrames(3);
      states.push(frameState(next, nextVideoElement(next)));
    }

    expect(states).toEqual(new Array(20).fill([1, 0, true]));
  }, 30000);

  it('opens on the frame number of the options on each of ten mounts, as the legacy viewport does', async function () {
    const frameNumber = 5;
    const time = (frameNumber - 1) / TEST_VIDEO.fps;

    await legacy.setVideo(TEST_VIDEO.imageId, frameNumber);
    await waitFor(() => !legacyVideoElement(legacy).seeking);

    expect(frameState(legacy, legacyVideoElement(legacy))).toEqual([
      frameNumber,
      time,
      true,
    ]);

    const states = [];

    for (let mount = 0; mount < 10; mount++) {
      await next.setDisplaySets({
        displaySetId: TEST_VIDEO.imageId,
        options: { frameNumber },
      });
      states.push(frameState(next, nextVideoElement(next)));
      await waitFor(() => !nextVideoElement(next).seeking);
      await animationFrames(3);
      states.push(frameState(next, nextVideoElement(next)));
    }

    expect(states).toEqual(new Array(20).fill([frameNumber, time, true]));
  }, 30000);
});
