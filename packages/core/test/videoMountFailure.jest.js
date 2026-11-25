import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import VideoViewport from '../src/RenderingEngine/Viewports/Video/VideoViewport';
import { Enums, metaData } from '../src/index';

const WIDTH = 400;
const HEIGHT = 300;
const FPS = 10;
const FRAMES = 50;
const GOOD_URL = 'https://server/video.mp4';
const HTML_URL = 'https://server/index.mp4';
const CHROME_OPEN_ERROR =
  'DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed';

const metadata = {
  bitsAllocated: 8,
  numberOfComponents: 3,
  origin: [0, 0, 0],
  rows: 100,
  columns: 200,
  direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  dimensions: [200, 100, 1],
  spacing: [1, 1, 1],
  hasPixelSpacing: false,
  numVoxels: 20000,
  imagePlaneModule: {},
};

/** Waits for the queued promise callbacks and one timer turn. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Settles a mount or gives `'pending'` after `ms`: `'mounted'` when it
 * resolves, the error when it rejects.
 */
function outcomeOf(mounted, ms = 500) {
  return Promise.race([
    mounted.then(
      () => 'mounted',
      (error) => error
    ),
    wait(ms).then(() => 'pending'),
  ]);
}

/**
 * Gives a jsdom video element the state of a browser video: its media
 * error, its ready state and its network state can change, and `play()`
 * is recorded. `currentTime` fires `seeked` unless `onSeek` says what a
 * seek does.
 */
function stubVideoElement(
  video,
  { readyState = 1, networkState = 2, onSeek } = {}
) {
  const state = { readyState, networkState, error: null, paused: true };
  let currentTime = 0;

  Object.defineProperty(video, 'videoWidth', { value: 200 });
  Object.defineProperty(video, 'videoHeight', { value: 100 });
  Object.defineProperty(video, 'duration', { value: FRAMES / FPS });
  Object.defineProperty(video, 'readyState', { get: () => state.readyState });
  Object.defineProperty(video, 'networkState', {
    get: () => state.networkState,
  });
  Object.defineProperty(video, 'error', { get: () => state.error });
  Object.defineProperty(video, 'paused', { get: () => state.paused });
  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: (value) => {
      currentTime = value;
      setTimeout(() => {
        if (onSeek) {
          onSeek(video, state);
        } else {
          video.dispatchEvent(new Event('seeked'));
        }
      }, 0);
    },
  });
  video.play = jest.fn(() => {
    state.paused = false;

    return Promise.resolve();
  });
  video.pause = jest.fn(() => {
    state.paused = true;
  });

  return state;
}

/** Fires the media error `code` with `message` on a stubbed element. */
function failVideo(video, state, code, message = '') {
  state.error = { code, message };
  state.networkState = 3;
  video.dispatchEvent(new Event('error'));
}

/** Gives the element its first frame, as `loadeddata` does. */
function loadFrame(video, state) {
  state.readyState = 4;
  video.dispatchEvent(new Event('loadeddata'));
}

/**
 * The video element that the mount of `displaySetId` made, by the URL of
 * its data provider; the newest when there are more.
 */
function videoOf(element, url) {
  return Array.from(element.querySelectorAll('video'))
    .filter((video) => video.src === url)
    .at(-1);
}

/**
 * A video viewport whose data provider gives `GOOD_URL` for every id but
 * the ids of `urls`, which get the URL given there.
 */
function createViewport(urls = {}) {
  const element = document.createElement('div');

  Object.defineProperty(element, 'clientWidth', { value: WIDTH });
  Object.defineProperty(element, 'clientHeight', { value: HEIGHT });
  document.body.appendChild(element);

  const viewport = new VideoViewport({
    id: 'video',
    element,
    renderingEngineId: 'renderingEngine',
    dataProvider: {
      load: async (id) => ({
        id,
        type: 'video',
        renderedUrl: urls[id] ?? GOOD_URL,
        fps: FPS,
        numberOfFrames: FRAMES,
        frameRange: [1, FRAMES],
        modality: 'XC',
        metadata,
      }),
    },
  });
  const events = [];

  element.addEventListener(Enums.Events.DISPLAY_SETS_CHANGED, (evt) =>
    events.push(evt.detail)
  );

  return { viewport, element, events };
}

/** Mounts `displaySetId` and gives its element metadata and a frame. */
async function mountGood(viewport, element, displaySetId) {
  const mounted = viewport.setDisplaySets({ displaySetId });

  await flush();

  const video = element.querySelector('video:last-of-type');
  const state = stubVideoElement(video, { readyState: 4 });

  video.dispatchEvent(new Event('loadedmetadata'));
  await mounted;

  return { video, state };
}

afterEach(() => {
  document.body.innerHTML = '';
  displaySetRegistry.clear();
});

describe('A video mount whose video does not load', () => {
  it('rejects for a registered display set whose URL is not a video, naming the display set and the media error', async () => {
    const provider = (type, imageId) => {
      if (imageId !== 'video:bad') {
        return;
      }

      if (type === Enums.MetadataModules.IMAGE_URL) {
        return { rendered: HTML_URL };
      }

      if (type === Enums.MetadataModules.IMAGE_PLANE) {
        return { rows: 100, columns: 200 };
      }
    };

    metaData.addProvider(provider, 100000);

    try {
      displaySetRegistry.add('v', { imageId: 'video:bad' });

      const element = document.createElement('div');

      Object.defineProperty(element, 'clientWidth', { value: WIDTH });
      Object.defineProperty(element, 'clientHeight', { value: HEIGHT });
      document.body.appendChild(element);

      const viewport = new VideoViewport({
        id: 'video-registered',
        element,
        renderingEngineId: 'renderingEngine',
      });
      const events = [];

      element.addEventListener(Enums.Events.DISPLAY_SETS_CHANGED, (evt) =>
        events.push(evt.detail)
      );

      const mounted = viewport.setDisplaySets({ displaySetId: 'v' });

      await flush();

      const video = element.querySelector('video');
      const state = stubVideoElement(video);

      failVideo(video, state, 4, CHROME_OPEN_ERROR);

      const outcome = await outcomeOf(mounted);

      expect(outcome).toBeInstanceOf(Error);
      expect(outcome.message).toBe(
        `[VideoViewport] The display set "v" did not load its video ${HTML_URL}: ` +
          `MEDIA_ERR_SRC_NOT_SUPPORTED (${CHROME_OPEN_ERROR})`
      );
      expect(outcome.cause).toBe(state.error);
      expect(events).toEqual([]);
      expect(viewport.getDisplaySets()).toEqual([]);
      expect(element.querySelectorAll('video').length).toBe(0);
      viewport.destroy();
    } finally {
      metaData.removeProvider(provider);
    }
  });

  it('leaves a viewport that mounts the next video, and fires only for that one', async () => {
    const { viewport, element, events } = createViewport({ bad: HTML_URL });
    const failing = viewport.setDisplaySets({ displaySetId: 'bad' });

    await flush();

    const bad = element.querySelector('video');

    failVideo(bad, stubVideoElement(bad), 4, CHROME_OPEN_ERROR);
    expect(await outcomeOf(failing)).toBeInstanceOf(Error);

    await mountGood(viewport, element, 'good');

    expect(events).toEqual([
      expect.objectContaining({
        displaySets: [{ displaySetId: 'good', role: 'source' }],
        added: ['good'],
        removed: [],
      }),
    ]);
    expect(element.querySelectorAll('video').length).toBe(1);
    viewport.destroy();
  });

  it('rejects when the video fails after its metadata and before its first frame, unbinds it, restores its appearance, and plays nothing later', async () => {
    const { viewport, element, events } = createViewport({ bad: HTML_URL });

    viewport.setDisplaySetAppearance('bad', { playbackRate: 3 });

    const mounted = viewport.setDisplaySets({
      displaySetId: 'bad',
      options: { appearance: { loop: false } },
    });

    await flush();

    const video = element.querySelector('video');
    const state = stubVideoElement(video, { networkState: 1 });

    video.dispatchEvent(new Event('loadedmetadata'));
    await flush();
    failVideo(video, state, 3, 'PIPELINE_ERROR_DECODE');

    const outcome = await outcomeOf(mounted);

    expect(outcome).toBeInstanceOf(Error);
    expect(outcome.message).toBe(
      `[VideoViewport] The display set "bad" did not load its video ${HTML_URL}: ` +
        'MEDIA_ERR_DECODE (PIPELINE_ERROR_DECODE)'
    );
    await wait(300);
    expect(video.play).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(viewport.getDisplaySets()).toEqual([]);
    expect(element.querySelectorAll('video').length).toBe(0);
    expect(viewport.getDisplaySetAppearance('bad')).toEqual({
      playbackRate: 3,
    });
    viewport.destroy();
  });

  it('does not fail a mount for an error after the first frame: during the seek of the mount, or after the mount', async () => {
    const { viewport, element, events } = createViewport();
    const mounted = viewport.setDisplaySets({ displaySetId: 'good' });

    await flush();

    const video = element.querySelector('video');
    const state = stubVideoElement(video, {
      networkState: 1,
      onSeek: (seeking, seekingState) =>
        failVideo(seeking, seekingState, 2, 'network lost'),
    });

    video.play = jest.fn(() => {
      loadFrame(video, state);

      return Promise.resolve();
    });
    video.dispatchEvent(new Event('loadedmetadata'));

    expect(await outcomeOf(mounted, 1000)).toBe('mounted');
    expect(video.play).toHaveBeenCalled();
    expect(events.length).toBe(1);

    video.dispatchEvent(new Event('error'));
    await flush();

    expect(events.length).toBe(1);
    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: 'good', options: { role: 'source' } },
    ]);
    viewport.destroy();
  });

  it('waits through stalled and abort, which are not failures, and has no time limit: a newer mount takes over', async () => {
    const { viewport, element, events } = createViewport();
    const slow = viewport.setDisplaySets({ displaySetId: 'slow' });

    await flush();

    const video = element.querySelector('video');
    const state = stubVideoElement(video);

    video.dispatchEvent(new Event('stalled'));
    video.dispatchEvent(new Event('abort'));
    expect(await outcomeOf(slow)).toBe('pending');

    video.dispatchEvent(new Event('loadedmetadata'));
    await flush();
    video.dispatchEvent(new Event('stalled'));
    expect(await outcomeOf(slow, 400)).toBe('pending');

    loadFrame(video, state);
    expect(await outcomeOf(slow)).toBe('mounted');

    const stuck = viewport.setDisplaySets({ displaySetId: 'stuck' });

    await flush();

    const stuckVideo = videoOf(element, GOOD_URL);

    stubVideoElement(stuckVideo);
    stuckVideo.dispatchEvent(new Event('stalled'));
    expect(await outcomeOf(stuck)).toBe('pending');

    await mountGood(viewport, element, 'newer');

    expect(events.map(({ displaySets }) => displaySets)).toEqual([
      [{ displaySetId: 'slow', role: 'source' }],
      [{ displaySetId: 'newer', role: 'source' }],
    ]);
    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: 'newer', options: { role: 'source' } },
    ]);
    viewport.destroy();
  });
});

describe('A failing video mount that a newer mount superseded', () => {
  it('rejects and leaves the newer mount, its video and its event alone', async () => {
    const { viewport, element, events } = createViewport({ older: HTML_URL });
    const older = viewport.setDisplaySets({ displaySetId: 'older' });

    await flush();

    const olderVideo = element.querySelector('video');
    const olderState = stubVideoElement(olderVideo);
    const { video: newerVideo } = await mountGood(viewport, element, 'newer');

    failVideo(olderVideo, olderState, 4, CHROME_OPEN_ERROR);

    const outcome = await outcomeOf(older);

    expect(outcome).toBeInstanceOf(Error);
    expect(outcome.message).toContain('The display set "older"');
    expect(events.map(({ displaySets }) => displaySets)).toEqual([
      [{ displaySetId: 'newer', role: 'source' }],
    ]);
    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: 'newer', options: { role: 'source' } },
    ]);
    expect(Array.from(element.querySelectorAll('video'))).toEqual([newerVideo]);
    viewport.destroy();
  });

  it('keeps the appearance of a newer mount of the same display set, whether the older one fails or loads late', async () => {
    for (const olderEnds of ['fails', 'loads late']) {
      const { viewport, element } = createViewport();
      const older = viewport.setDisplaySets({
        displaySetId: 'v',
        options: { appearance: { playbackRate: 2 } },
      });

      await flush();

      const olderVideo = element.querySelector('video');
      const olderState = stubVideoElement(olderVideo, { readyState: 4 });
      const newer = viewport.setDisplaySets({
        displaySetId: 'v',
        options: { appearance: { playbackRate: 3 } },
      });

      await flush();

      const newerVideo = element.querySelectorAll('video')[1];

      stubVideoElement(newerVideo, { readyState: 4 });

      if (olderEnds === 'fails') {
        failVideo(olderVideo, olderState, 2, 'network lost');
      } else {
        olderVideo.dispatchEvent(new Event('loadedmetadata'));
      }

      await outcomeOf(older);
      newerVideo.dispatchEvent(new Event('loadedmetadata'));

      expect(await outcomeOf(newer)).toBe('mounted');
      expect([olderEnds, viewport.getDisplaySetAppearance('v')]).toEqual([
        olderEnds,
        { playbackRate: 3 },
      ]);
      expect([olderEnds, newerVideo.playbackRate]).toEqual([olderEnds, 3]);
      viewport.destroy();
      document.body.innerHTML = '';
    }
  });
});
