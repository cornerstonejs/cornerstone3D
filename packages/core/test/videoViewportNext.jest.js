import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import VideoViewport from '../src/RenderingEngine/GenericViewport/Video/VideoViewport';
import { Enums } from '../src/index';

const WIDTH = 400;
const HEIGHT = 300;
const VIDEO_WIDTH = 200;
const VIDEO_HEIGHT = 100;
const FPS = 10;
const FRAMES = 50;
const VIDEO_ID =
  'wadors:https://server/studies/1/series/2/instances/3/frames/1';

/** The geometry of the test video, as `getVideoImageDataMetadata` makes it. */
const metadata = {
  bitsAllocated: 8,
  numberOfComponents: 3,
  origin: [0, 0, 0],
  rows: VIDEO_HEIGHT,
  columns: VIDEO_WIDTH,
  direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  dimensions: [VIDEO_WIDTH, VIDEO_HEIGHT, 1],
  spacing: [1, 1, 1],
  hasPixelSpacing: false,
  numVoxels: VIDEO_WIDTH * VIDEO_HEIGHT,
  imagePlaneModule: {},
};

/**
 * Gives a jsdom video element what a loaded video has: a size, a duration,
 * a current time, and play and pause that change `paused`.
 */
function stubVideoElement(video) {
  let paused = true;

  Object.defineProperty(video, 'videoWidth', { value: VIDEO_WIDTH });
  Object.defineProperty(video, 'videoHeight', { value: VIDEO_HEIGHT });
  Object.defineProperty(video, 'duration', { value: FRAMES / FPS });
  Object.defineProperty(video, 'readyState', { value: 4 });
  Object.defineProperty(video, 'currentTime', { value: 0, writable: true });
  Object.defineProperty(video, 'paused', { get: () => paused });
  video.play = jest.fn(() => {
    paused = false;

    return Promise.resolve();
  });
  video.pause = jest.fn(() => {
    paused = true;
  });
}

/** Waits for the queued promise callbacks and one timer turn. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Makes a direct next video viewport on an element of a known size, with the
 * default options given, and mounts the test video with the real HTML video
 * render path.
 */
async function createViewport(
  entry = { displaySetId: VIDEO_ID },
  defaultOptions = undefined
) {
  const element = document.createElement('div');

  Object.defineProperty(element, 'clientWidth', { value: WIDTH });
  Object.defineProperty(element, 'clientHeight', { value: HEIGHT });
  document.body.appendChild(element);

  const viewport = new VideoViewport({
    id: 'video',
    element,
    renderingEngineId: 'renderingEngine',
    defaultOptions,
    dataProvider: {
      load: async (id) => ({
        id,
        type: 'video',
        renderedUrl: 'https://server/video.mp4',
        fps: FPS,
        numberOfFrames: FRAMES,
        frameRange: [1, FRAMES],
        modality: 'XC',
        metadata,
      }),
    },
  });
  const mounted = viewport.setDisplaySets(entry);

  await flush();

  const video = element.querySelector('video');

  stubVideoElement(video);
  video.dispatchEvent(new Event('loadedmetadata'));
  await mounted;

  return { viewport, element, video };
}

describe('Next video viewport', () => {
  let viewport;
  let element;
  let video;

  beforeEach(async () => {
    ({ viewport, element, video } = await createViewport());
  });

  afterEach(() => {
    viewport.destroy();
    element.remove();
  });

  it('gives view references with the view plane normal, the view up and the focal point', () => {
    const reference = viewport.getViewReference();
    const camera = viewport.getResolvedView().toICamera();

    expect(reference.viewPlaneNormal).toEqual([0, 0, 1]);
    expect(reference.viewUp).toEqual(camera.viewUp);
    expect(reference.cameraFocalPoint).toEqual(camera.focalPoint);
  });

  it('sees a reference saved with its view plane normal and not one with another', () => {
    const reference = viewport.getViewReference();

    expect(
      viewport.isReferenceViewable({
        ...reference,
        viewPlaneNormal: [0, 0, 1],
      })
    ).toBe(true);
    expect(
      viewport.isReferenceViewable({
        ...reference,
        viewPlaneNormal: [1, 0, 0],
      })
    ).toBe(false);
  });

  it('fires STACK_NEW_IMAGE for each new frame while it plays', async () => {
    const stackNewImage = jest.fn();

    element.addEventListener(Enums.Events.STACK_NEW_IMAGE, stackNewImage);

    await viewport.play();
    video.currentTime = 1.5;
    await nextAnimationFrame();
    await nextAnimationFrame();
    viewport.pause();

    expect(stackNewImage).toHaveBeenCalled();
    expect(stackNewImage.mock.calls.at(-1)[0].detail).toMatchObject({
      viewportId: 'video',
      renderingEngineId: 'renderingEngine',
      imageIdIndex: 15,
      imageId: viewport.getCurrentImageId(15),
      time: 1.5,
      duration: FRAMES / FPS,
    });
  });

  it('fires STACK_NEW_IMAGE after a seek', () => {
    const stackNewImage = jest.fn();

    element.addEventListener(Enums.Events.STACK_NEW_IMAGE, stackNewImage);
    video.currentTime = 2;
    video.dispatchEvent(new Event('seeked'));

    expect(stackNewImage).toHaveBeenCalledTimes(1);
    expect(stackNewImage.mock.calls[0][0].detail.imageIdIndex).toBe(20);
  });

  it('opens on the frame number of the display set options', async () => {
    const opened = await createViewport({
      displaySetId: VIDEO_ID,
      options: { frameNumber: 12 },
    });

    expect(opened.viewport.getFrameNumber()).toBe(12);
    opened.viewport.destroy();
    opened.element.remove();
  });
});

describe('Pan of the next video viewport', () => {
  let viewport;
  let element;

  beforeEach(async () => {
    ({ viewport, element } = await createViewport());
  });

  afterEach(() => {
    viewport.destroy();
    element.remove();
  });

  /**
   * Moves the view as PanTool does on a viewport without a camera: it adds
   * the canvas delta of the mouse to `getPan` and sets the sum.
   */
  function dragBy(delta) {
    const pan = viewport.getPan();

    viewport.setPan([pan[0] + delta[0], pan[1] + delta[1]]);
  }

  function expectMovedBy(world, before, delta) {
    const after = viewport.worldToCanvas(world);

    expect(after[0] - before[0]).toBeCloseTo(delta[0], 6);
    expect(after[1] - before[1]).toBeCloseTo(delta[1], 6);
  }

  it('starts with no pan, as the planar viewport', () => {
    expect(viewport.getPan()[0]).toBeCloseTo(0, 6);
    expect(viewport.getPan()[1]).toBeCloseTo(0, 6);
  });

  it('moves the picture with the mouse at any rotation and zoom', () => {
    const world = [50, 40, 0];
    const delta = [12, -7];

    [
      { rotation: 0 },
      { rotation: 90 },
      { rotation: 30 },
      { rotation: 270, scale: 1.5 },
    ].forEach((viewState) => {
      viewport.setViewState(viewState);

      const before = viewport.worldToCanvas(world);

      dragBy(delta);
      expectMovedBy(world, before, delta);
    });
  });

  it('gives back the pan that it was set to', () => {
    viewport.setViewState({ rotation: 90, scale: 2 });
    viewport.setPan([30, -20]);

    expect(viewport.getPan()[0]).toBeCloseTo(30, 6);
    expect(viewport.getPan()[1]).toBeCloseTo(-20, 6);
  });
});

describe('suppressEvents on the direct next video viewport', () => {
  /** Counts the camera events and the renders of a viewport. */
  function countEvents(element) {
    const counts = { modified: 0, reset: 0, rendered: 0 };

    element.addEventListener(Enums.Events.CAMERA_MODIFIED, () => {
      counts.modified++;
    });
    element.addEventListener(Enums.Events.CAMERA_RESET, () => {
      counts.reset++;
    });
    element.addEventListener(Enums.Events.IMAGE_RENDERED, () => {
      counts.rendered++;
    });

    return counts;
  }

  it('fires no camera event with suppressEvents in the options, as the legacy viewport fires none, and still renders', async () => {
    const { viewport, element } = await createViewport(undefined, {
      suppressEvents: true,
    });
    const counts = countEvents(element);

    viewport.setPan([12, 5]);
    viewport.setZoom(2);
    viewport.resetViewState();
    viewport.render();
    await nextAnimationFrame();

    expect(viewport.defaultOptions.suppressEvents).toBe(true);
    expect('suppressEvents' in viewport).toBe(false);
    expect(counts.modified).toBe(0);
    expect(counts.reset).toBe(0);
    expect(counts.rendered).toBeGreaterThan(0);

    viewport.destroy();
    element.remove();
  });

  it('still fires the camera events without suppressEvents', async () => {
    const { viewport, element } = await createViewport();
    const counts = countEvents(element);

    viewport.setPan([12, 5]);
    viewport.resetViewState();

    expect(viewport.defaultOptions.suppressEvents).toBeUndefined();
    expect('suppressEvents' in viewport).toBe(false);
    expect(counts.modified).toBeGreaterThan(0);
    expect(counts.reset).toBe(1);

    viewport.destroy();
    element.remove();
  });
});
