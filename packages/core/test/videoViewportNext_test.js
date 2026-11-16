import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  animationFrames,
  waitFor,
} from '../../../utils/test/testUtilsVideo';

const { Enums, utilities, getConfiguration } = cornerstone3D;
const { ViewportType, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const WIDTH = 320;
const HEIGHT = 200;

/**
 * Makes a legacy video viewport and a direct next video viewport of one size
 * in one rendering engine. The switch of the generic viewports is off for
 * the legacy one, so it is the legacy class with or without
 * FORCE_GENERIC_VIEWPORT.
 */
function createViewports(renderingEngine) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;
  const viewportOptions = {
    width: WIDTH,
    height: HEIGHT,
    useEnableElement: true,
    orientation: null,
  };

  rendering.useGenericViewport = false;
  testUtils.createViewports(renderingEngine, {
    ...viewportOptions,
    viewportId: 'legacyVideo',
    viewportType: ViewportType.VIDEO,
  });
  rendering.useGenericViewport = useGenericViewport;
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

/** The legacy video element of a legacy video viewport. */
function legacyVideoElement(legacy) {
  return legacy.videoElement;
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
    expect(next.modality).toBe(legacy.modality);
    expect(next.getImageDataMetadata(TEST_VIDEO.imageId)).toEqual(
      legacy.getImageDataMetadata(TEST_VIDEO.imageId)
    );
  });

  it('finds its video by image URI as the legacy viewport does', function () {
    const uri = 'https://test.video/studies/1/series/2/instances/3';

    [`${uri}/frames/7`, uri, 'https://test.video/studies/1/series/9'].forEach(
      (imageURI) => {
        expect(next.hasImageURI(imageURI)).toBe(legacy.hasImageURI(imageURI));
      }
    );
    expect(next.hasImageURI(uri)).toBe(true);
  });

  it('keeps the frame range of setFrameRange as the legacy viewport does', function () {
    expect(next.getFrameRange()).toEqual(legacy.getFrameRange());
    expect(next.getFrameRange()).toEqual([1, TEST_VIDEO.numberOfFrames]);

    [
      [5, 10],
      [7, 7],
      [1, 2, 3],
    ].forEach((frameRange) => {
      legacy.setFrameRange(frameRange);
      next.setFrameRange(frameRange);
      expect(next.getFrameRange()).toEqual(legacy.getFrameRange());
    });
    expect(next.getFrameRange()).toEqual([5, 10]);

    legacy.setFrameRange(null);
    next.setFrameRange(null);
    expect(next.getFrameRange()).toEqual(legacy.getFrameRange());
  });

  it('plays inside the frame range as the legacy viewport does', async function () {
    const samples = { legacy: [], next: [] };

    legacy.setFrameRange([5, 10]);
    next.setFrameRange([5, 10]);
    expect(legacy.togglePlayPause()).toBe(true);
    expect(next.togglePlayPause()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const start = performance.now();

    await waitFor(() => {
      samples.legacy.push(legacy.getFrameNumber());
      samples.next.push(next.getFrameNumber());

      return performance.now() - start > 1500;
    }, 3000);

    expect(legacy.togglePlayPause()).toBe(false);
    expect(next.togglePlayPause()).toBe(false);
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
    next.setFrameRange([3, 9]);
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

  it('gives a canvas of the viewport size with the frame on display', async function () {
    legacy.setFrameNumber(6);
    next.setFrameNumber(6);
    await waitFor(
      () =>
        legacy.getFrameNumber() === 6 &&
        next.getFrameNumber() === 6 &&
        !legacyVideoElement(legacy).seeking &&
        !nextVideoElement(next).seeking
    );
    next.setZoom(1.5);
    legacy.setCamera({ parallelScale: legacy.getCamera().parallelScale / 1.5 });
    await animationFrames(3);

    const nextCanvas = next.getCanvas();

    expect(next.canvas).toBe(nextCanvas);
    expect(nextCanvas.width).toBe(legacy.canvas.width);
    expect(nextCanvas.height).toBe(legacy.canvas.height);
    expect(nextCanvas.clientWidth).toBe(WIDTH);
    expect(nextCanvas.clientHeight).toBe(HEIGHT);
    expect(nextCanvas.toDataURL('image/png')).toMatch(/^data:image\/png/);

    const pixelAt = (canvas, point) =>
      Array.from(
        canvas
          .getContext('2d')
          .getImageData(Math.round(point[0]), Math.round(point[1]), 1, 1).data
      );

    [
      [10.5, 20.5, 0],
      [40.5, 10.5, 0],
      [55.5, 40.5, 0],
    ].forEach((world) => {
      const legacyPixel = pixelAt(legacy.canvas, legacy.worldToCanvas(world));
      const nextPixel = pixelAt(nextCanvas, next.worldToCanvas(world));

      nextPixel.forEach((value, channel) =>
        expect(Math.abs(value - legacyPixel[channel])).toBeLessThanOrEqual(8)
      );
    });
  });

  it('draws the frame of a later seek into the canvas when it is read', async function () {
    const world = [30.5, 20.5, 0];
    const pixelAt = (canvas, point) =>
      Array.from(
        canvas
          .getContext('2d')
          .getImageData(Math.round(point[0]), Math.round(point[1]), 1, 1).data
      );
    const firstPixel = pixelAt(next.canvas, next.worldToCanvas(world));

    next.setFrameNumber(15);
    await waitFor(
      () => next.getFrameNumber() === 15 && !nextVideoElement(next).seeking
    );
    await animationFrames(3);

    const laterPixel = pixelAt(next.canvas, next.worldToCanvas(world));

    expect(laterPixel).not.toEqual(firstPixel);
  });
});
