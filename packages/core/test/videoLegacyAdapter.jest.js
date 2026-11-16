import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import VideoViewportLegacyAdapter from '../src/RenderingEngine/GenericViewport/Video/VideoViewportLegacyAdapter';
import * as metaData from '../src/metaData';
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

/**
 * Makes a video legacy adapter on an element of a known size and mounts the
 * test video with the real HTML video render path.
 */
async function createAdapter(args = {}, entry = { displaySetId: VIDEO_ID }) {
  const element = document.createElement('div');

  Object.defineProperty(element, 'clientWidth', { value: WIDTH });
  Object.defineProperty(element, 'clientHeight', { value: HEIGHT });
  document.body.appendChild(element);

  const viewport = new VideoViewportLegacyAdapter({
    id: 'video',
    element,
    renderingEngineId: 'renderingEngine',
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
    ...args,
  });
  const mounted = viewport.setDisplaySets(entry);

  await flush();

  const video = element.querySelector('video');

  stubVideoElement(video);
  video.dispatchEvent(new Event('loadedmetadata'));
  await mounted;

  return { viewport, element, video };
}

describe('Video legacy adapter', () => {
  let viewport;
  let element;
  let video;

  beforeEach(async () => {
    ({ viewport, element, video } = await createAdapter());
  });

  afterEach(() => {
    viewport.destroy();
    element.remove();
  });

  it('gives the legacy camera of the frame on display', () => {
    const camera = viewport.getCamera();
    const worldToCanvasRatio = Math.min(
      WIDTH / VIDEO_WIDTH,
      HEIGHT / VIDEO_HEIGHT
    );

    expect(camera.focalPoint).toEqual(
      viewport.canvasToWorld([WIDTH / 2, HEIGHT / 2])
    );
    expect(camera.focalPoint).toEqual([VIDEO_WIDTH / 2, VIDEO_HEIGHT / 2, 0]);
    expect(camera.position).toEqual([0, 0, 0]);
    expect(camera.viewPlaneNormal).toEqual([0, 0, 1]);
    expect(camera.parallelScale).toBeCloseTo(HEIGHT / 2 / worldToCanvasRatio);
  });

  it('gives view references with the legacy camera that stay viewable', () => {
    const reference = viewport.getViewReference({ points: [[20, 30, 0]] });

    expect(reference.viewPlaneNormal).toEqual([0, 0, 1]);
    expect(reference.viewUp).toEqual([0, -1, 0]);
    expect(reference.cameraFocalPoint).toEqual(viewport.getCamera().focalPoint);
    expect(viewport.isReferenceViewable(reference)).toBe(true);
    expect(
      viewport.isReferenceViewable({
        ...reference,
        viewPlaneNormal: [1, 0, 0],
      })
    ).toBe(false);
  });

  it('zooms with the parallel scale of setCamera and keeps the centre', () => {
    const { parallelScale, focalPoint } = viewport.getCamera();

    viewport.setCamera({ parallelScale: parallelScale / 2 });

    expect(viewport.getZoom()).toBeCloseTo(2);
    expect(viewport.getCamera().parallelScale).toBeCloseTo(parallelScale / 2);
    expect(viewport.getCamera().focalPoint[0]).toBeCloseTo(focalPoint[0]);
    expect(viewport.getCamera().focalPoint[1]).toBeCloseTo(focalPoint[1]);
  });

  it('moves the focal point of setCamera to the centre of the canvas', () => {
    viewport.setCamera({ focalPoint: [30, 40, 0] });

    const { focalPoint } = viewport.getCamera();

    expect(focalPoint[0]).toBeCloseTo(30);
    expect(focalPoint[1]).toBeCloseTo(40);
    expect(viewport.worldToCanvas([30, 40, 0])[0]).toBeCloseTo(WIDTH / 2);
    expect(viewport.worldToCanvas([30, 40, 0])[1]).toBeCloseTo(HEIGHT / 2);
  });

  it('keeps the legacy pan in world units, where a canvas point is the world point plus the pan times the ratio', () => {
    const ratio = Math.min(WIDTH / VIDEO_WIDTH, HEIGHT / VIDEO_HEIGHT);

    expect(viewport.getPan()).toEqual([
      (WIDTH / ratio - VIDEO_WIDTH) / 2,
      (HEIGHT / ratio - VIDEO_HEIGHT) / 2,
    ]);

    viewport.setPan([10, 30]);

    expect(viewport.getPan()[0]).toBeCloseTo(10);
    expect(viewport.getPan()[1]).toBeCloseTo(30);
    expect(viewport.worldToCanvas([5, 7, 0])[0]).toBeCloseTo((5 + 10) * ratio);
    expect(viewport.worldToCanvas([5, 7, 0])[1]).toBeCloseTo((7 + 30) * ratio);
  });

  it('takes a canvas point or the legacy flag as the second zoom argument', () => {
    viewport.setZoom(2, true);

    expect(viewport.getZoom()).toBeCloseTo(2);
    expect(viewport.getCamera().focalPoint[0]).toBeCloseTo(VIDEO_WIDTH / 2);

    const anchor = viewport.canvasToWorld([10, 20]);

    viewport.setZoom(4, [10, 20]);

    expect(viewport.getZoom()).toBeCloseTo(4);
    expect(viewport.canvasToWorld([10, 20])[0]).toBeCloseTo(anchor[0]);
    expect(viewport.canvasToWorld([10, 20])[1]).toBeCloseTo(anchor[1]);
  });

  it('toggles play and pause', async () => {
    expect(viewport.togglePlayPause()).toBe(true);
    await flush();
    expect(video.play).toHaveBeenCalled();
    expect(video.paused).toBe(false);

    expect(viewport.togglePlayPause()).toBe(false);
    expect(video.pause).toHaveBeenCalled();
    expect(video.paused).toBe(true);
  });

  it('goes to a time, a frame, the start and the end', async () => {
    await viewport.setTime(2);
    expect(video.currentTime).toBeCloseTo(2);
    expect(viewport.getFrameNumber()).toBe(21);

    await viewport.setFrameNumber(31);
    expect(viewport.getFrameNumber()).toBe(31);

    await viewport.start();
    expect(video.currentTime).toBe(0);

    await viewport.end();
    expect(video.currentTime).toBeCloseTo(FRAMES / FPS);
  });

  it('opens on the frame of the display set options', async () => {
    const opened = await createAdapter(
      {},
      { displaySetId: VIDEO_ID, options: { frameNumber: 12 } }
    );

    expect(opened.viewport.getFrameNumber()).toBe(12);
    opened.viewport.destroy();
    opened.element.remove();
  });

  it('keeps the frame range of setFrameRange', () => {
    expect(viewport.getFrameRange()).toEqual([1, FRAMES]);

    viewport.setFrameRange([5, 10]);
    expect(viewport.getFrameRange()).toEqual([5, 10]);

    viewport.setFrameRange([7, 7]);
    viewport.setFrameRange([1, 2, 3]);
    expect(viewport.getFrameRange()).toEqual([5, 10]);

    viewport.setFrameRange(null);
    expect(viewport.getFrameRange()).toEqual([1, FRAMES]);
  });

  it('keeps playback in the frame range', async () => {
    viewport.setFrameRange([5, 10]);
    await viewport.play();

    video.currentTime = 2;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(viewport.getFrameNumber()).toBe(5);
    viewport.pause();
  });

  it('fires the legacy frame events for a new frame and a seek', async () => {
    const stackNewImage = jest.fn();
    const imageRendered = jest.fn();

    element.addEventListener(Enums.Events.STACK_NEW_IMAGE, stackNewImage);
    element.addEventListener(Enums.Events.IMAGE_RENDERED, imageRendered);

    await viewport.play();
    video.currentTime = 1.5;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    viewport.pause();

    expect(stackNewImage).toHaveBeenCalled();
    expect(stackNewImage.mock.calls.at(-1)[0].detail).toMatchObject({
      viewportId: 'video',
      time: 1.5,
      duration: FRAMES / FPS,
    });
    expect(imageRendered.mock.calls.at(-1)[0].detail).toMatchObject({
      imageIndex: 15,
      numberOfSlices: FRAMES,
    });

    const calls = stackNewImage.mock.calls.length;

    video.dispatchEvent(new Event('seeked'));

    expect(stackNewImage.mock.calls.length).toBe(calls + 1);
  });

  it('scrolls by the scroll speed', async () => {
    await viewport.setFrameNumber(11);

    viewport.setScrollSpeed(3);
    await viewport.scroll(1);
    expect(viewport.getFrameNumber()).toBe(14);
    expect(viewport.getProperties().scrollSpeed).toBe(3);

    viewport.setScrollSpeed(1, Enums.VideoEnums.SpeedUnit.SECOND);
    await viewport.scroll(-1);
    expect(viewport.getFrameNumber()).toBe(4);
  });

  it('sets the VOI from a window level and filters the video with it', () => {
    expect(viewport.getProperties().voiRange).toEqual({
      lower: 0,
      upper: 255,
    });
    expect(video.style.filter).toBe('');

    viewport.setWindowLevel(100, 100);

    expect(viewport.getProperties().voiRange).toEqual({
      lower: 50,
      upper: 149,
    });
    expect(video.style.filter).toContain('feColorMatrix');
  });

  it('gives the image data of the frame on display', () => {
    const imageData = viewport.getImageData();

    expect(imageData.dimensions).toEqual([VIDEO_WIDTH, VIDEO_HEIGHT, 1]);
    expect(imageData.spacing).toEqual([1, 1, 1]);
    expect(imageData.metadata.Modality).toBe('XC');
    expect(imageData.hasPixelSpacing).toBe(false);
    expect(imageData.scalarData.length).toBe(VIDEO_WIDTH * VIDEO_HEIGHT * 4);
    expect(imageData.imageData.worldToIndex([12, 34, 5])).toEqual([12, 34, 0]);
    expect(imageData.imageData.indexToWorld([12, 34, 0])).toEqual([12, 34, 0]);
    expect(imageData.voxelManager.dimensions).toEqual([
      VIDEO_WIDTH,
      VIDEO_HEIGHT,
      1,
    ]);
    expect(viewport.modality).toBe('XC');
  });

  it('finds its video by image URI and the frame of an image id', () => {
    const uri = 'https://server/studies/1/series/2/instances/3';

    expect(viewport.hasImageURI(`${uri}/frames/20`)).toBe(true);
    expect(viewport.hasImageURI(uri)).toBe(true);
    expect(viewport.hasImageURI('https://server/studies/1/series/9')).toBe(
      false
    );
    expect(viewport.getSliceIndexForImage(`wadors:${uri}/frames/7-9`)).toBe(7);
    expect(
      viewport.getSliceIndexForImage({
        referencedImageId: `wadors:${uri}/frames/4`,
      })
    ).toBe(4);
  });

  it('reads the image plane metadata of a video image', () => {
    const provider = (type, imageId) =>
      type === 'imagePlaneModule' && imageId === VIDEO_ID
        ? { rows: 10, columns: 20, columnPixelSpacing: 0.5 }
        : undefined;

    metaData.addProvider(provider, 100000);

    try {
      const imageMetadata = viewport.getImageDataMetadata(VIDEO_ID);

      expect(imageMetadata.dimensions).toEqual([20, 10, 1]);
      expect(imageMetadata.spacing).toEqual([0.5, 1, 1]);
      expect(imageMetadata.hasPixelSpacing).toBe(true);
    } finally {
      metaData.removeProvider(provider);
    }
  });

  it('has the legacy options, canvas and actor members', async () => {
    const canvas = document.createElement('canvas');
    const made = await createAdapter({
      canvas,
      defaultOptions: { background: [1, 0, 0], suppressEvents: true },
    });

    expect(made.viewport.canvas).toBe(canvas);
    expect(made.viewport.getCanvas()).toBe(canvas);
    expect(made.viewport.suppressEvents).toBe(true);
    expect(made.viewport.options).toEqual(made.viewport.defaultOptions);
    expect(made.viewport.options).not.toBe(made.viewport.defaultOptions);

    made.viewport.setOptions({ displayArea: { imageArea: [1, 1] } });
    expect(made.viewport.getDisplayArea()).toEqual({ imageArea: [1, 1] });

    made.viewport.reset();
    expect(made.viewport.options).toEqual({
      background: [1, 0, 0],
      suppressEvents: true,
    });
    made.viewport.destroy();
    made.element.remove();

    expect(viewport.isDisabled).toBe(false);
    expect(viewport.uid).toBe('video');
    expect(viewport.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(viewport.suppressEvents).toBe(false);
    expect(viewport.getActors()).toEqual([]);
    expect(viewport.getDefaultActor()).toBeUndefined();
    expect(viewport.getActor('any')).toBeUndefined();
    expect(viewport.getRotation()).toBe(0);
    expect(viewport.isOrientationChangeable()).toBe(false);
  });
});
