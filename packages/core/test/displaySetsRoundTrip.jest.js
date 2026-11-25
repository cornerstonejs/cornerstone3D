import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import { Enums, metaData } from '../src/index';
import VideoViewport from '../src/RenderingEngine/Viewports/Video/VideoViewport';
import ECGViewport from '../src/RenderingEngine/Viewports/ECG/ECGViewport';
import WSIViewport from '../src/RenderingEngine/Viewports/WSI/WSIViewport';
import {
  IMAGE_ID as SLIDE_ID,
  mountNext as mountSlide,
  unmount as unmountSlide,
  withMicroscopyViewer,
} from './utils/wsiStandIn';

const { MetadataModules } = Enums;

/**
 * The contract of `getDisplaySets()` on the video, ECG and whole slide
 * viewports, as on the planar and 3D viewports (`displaySetsRoundTrip_test.js`):
 * each entry gives the options of its mount, resolved, so
 * `other.setDisplaySets(...viewport.getDisplaySets())` on a viewport of the
 * same family shows the same display sets in the same roles, and
 * `getDisplaySetAppearance(displaySetId)` gives the look.
 */

/** The display sets of a viewport with the appearance of each in its options. */
function displaySetsWithAppearance(viewport) {
  return viewport.getDisplaySets().map(({ displaySetId, options }) => ({
    displaySetId,
    options: {
      ...options,
      appearance: viewport.getDisplaySetAppearance(displaySetId),
    },
  }));
}

/** Resolves after the pending promise jobs and one timer turn. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('getDisplaySets of a video viewport', () => {
  const FPS = 10;
  const FRAMES = 50;
  const VIDEO_ID =
    'wadors:https://server/studies/1/series/2/instances/3/frames/1';
  const viewports = [];

  /** Gives a jsdom video element what a loaded video has. */
  function stubVideoElement(video) {
    Object.defineProperty(video, 'videoWidth', { value: 200 });
    Object.defineProperty(video, 'videoHeight', { value: 100 });
    Object.defineProperty(video, 'duration', { value: FRAMES / FPS });
    Object.defineProperty(video, 'readyState', { value: 4 });
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true });
    Object.defineProperty(video, 'paused', { get: () => true });
    video.play = jest.fn(() => Promise.resolve());
    video.pause = jest.fn();
  }

  /** Makes a video viewport whose data provider gives the test video. */
  function createVideoViewport(id) {
    const element = document.createElement('div');

    Object.defineProperty(element, 'clientWidth', { value: 400 });
    Object.defineProperty(element, 'clientHeight', { value: 300 });
    document.body.appendChild(element);

    const viewport = new VideoViewport({
      id,
      element,
      renderingEngineId: 'renderingEngine',
      dataProvider: {
        load: async (displaySetId) => ({
          id: displaySetId,
          type: 'video',
          renderedUrl: 'https://server/video.mp4',
          fps: FPS,
          numberOfFrames: FRAMES,
          frameRange: [1, FRAMES],
          modality: 'XC',
          metadata: {
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
          },
        }),
      },
    });

    viewports.push(viewport);

    return viewport;
  }

  /** Mounts the entries and gives the video element what a loaded video has. */
  async function mount(viewport, ...entries) {
    const mounted = viewport.setDisplaySets(...entries);

    await flush();

    const video = viewport.element.querySelector('video');

    stubVideoElement(video);
    video.dispatchEvent(new Event('loadedmetadata'));
    await mounted;
  }

  afterEach(() => {
    viewports.splice(0).forEach((viewport) => viewport.destroy());
    document.body.innerHTML = '';
  });

  it('gives the role and the frame number of the mount, and a copy opens on the same frame with the same look', async () => {
    const source = createVideoViewport('videoSource');
    const target = createVideoViewport('videoTarget');

    await mount(source, {
      displaySetId: VIDEO_ID,
      options: { frameNumber: 12, appearance: { playbackRate: 2 } },
    });

    expect(source.getDisplaySets()).toEqual([
      { displaySetId: VIDEO_ID, options: { role: 'source', frameNumber: 12 } },
    ]);

    await mount(target, ...source.getDisplaySets());

    expect(target.getDisplaySets()).toEqual(source.getDisplaySets());
    expect(target.getFrameNumber()).toBe(12);

    await mount(target, ...displaySetsWithAppearance(source));

    expect(target.getDisplaySetAppearance(VIDEO_ID)).toEqual({
      playbackRate: 2,
    });
    expect(target.getEffectiveDisplaySetAppearance(VIDEO_ID)).toEqual(
      source.getEffectiveDisplaySetAppearance(VIDEO_ID)
    );
  });

  it('gives the role alone for a mount without a frame number, and takes the role of the options', async () => {
    const viewport = createVideoViewport('videoRole');

    await mount(viewport, { displaySetId: VIDEO_ID });

    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: VIDEO_ID, options: { role: 'source' } },
    ]);

    await mount(viewport, {
      displaySetId: VIDEO_ID,
      options: { role: 'overlay' },
    });

    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: VIDEO_ID, options: { role: 'overlay' } },
    ]);
  });
});

describe('getDisplaySets of an ECG viewport', () => {
  const ECG_IDS = ['ecg:first', 'ecg:second'];
  const LEADS_OF_GROUP = [
    ['I', 'II'],
    ['V1', 'V2'],
  ];
  let loads;

  /**
   * The ECG module of a record with two multiplex groups of two leads each,
   * for each test id: the group of the options, else group 0.
   */
  function ecgModuleProvider(type, imageId, options) {
    if (type !== MetadataModules.ECG || !ECG_IDS.includes(imageId)) {
      return;
    }

    const multiplexGroupIndex = options?.multiplexGroupIndex ?? 0;

    loads.push([imageId, options?.multiplexGroupIndex]);

    return {
      numberOfWaveformChannels: 2,
      numberOfWaveformSamples: 500,
      samplingFrequency: 500,
      multiplexGroupIndex,
      totalMultiplexGroups: 2,
      channelDefinitionSequence: LEADS_OF_GROUP[multiplexGroupIndex].map(
        (codeMeaning) => ({
          channelSourceSequence: { codeMeaning },
          mvPerUnit: 0.001,
        })
      ),
      waveformData: {
        retrieveBulkData: async () => [
          new Int16Array(500).fill(100),
          new Int16Array(500).fill(-100),
        ],
      },
    };
  }

  /** Makes an ECG viewport on an element with a canvas. */
  function createECGViewport(id) {
    const element = document.createElement('div');
    const viewportElement = document.createElement('div');
    const canvas = document.createElement('canvas');

    viewportElement.classList.add('viewport-element');
    [element, canvas].forEach((node) => {
      Object.defineProperty(node, 'clientWidth', { value: 400 });
      Object.defineProperty(node, 'clientHeight', { value: 300 });
    });
    viewportElement.appendChild(canvas);
    element.appendChild(viewportElement);
    document.body.appendChild(element);

    return new ECGViewport({
      id,
      element,
      renderingEngineId: 'renderingEngine',
    });
  }

  beforeEach(() => {
    loads = [];
    metaData.addProvider(ecgModuleProvider, 100000);
  });

  afterEach(() => {
    metaData.removeProvider(ecgModuleProvider);
    document.body.innerHTML = '';
  });

  it('gives the role and the multiplex group that each waveform shows, and a copy shows the same groups in the same roles with the same look', async () => {
    const source = createECGViewport('ecgSource');
    const target = createECGViewport('ecgTarget');

    await source.setDisplaySets(
      {
        displaySetId: ECG_IDS[0],
        options: { multiplexGroupIndex: 1, appearance: { lineWidth: 3 } },
      },
      { displaySetId: ECG_IDS[1] }
    );

    expect(source.getDisplaySets()).toEqual([
      {
        displaySetId: ECG_IDS[0],
        options: { role: 'source', multiplexGroupIndex: 1 },
      },
      {
        displaySetId: ECG_IDS[1],
        options: { role: 'overlay', multiplexGroupIndex: 0 },
      },
    ]);

    loads = [];
    await target.setDisplaySets(...source.getDisplaySets());

    expect(loads).toEqual([
      [ECG_IDS[0], 1],
      [ECG_IDS[1], 0],
    ]);
    expect(target.getDisplaySets()).toEqual(source.getDisplaySets());

    await target.setDisplaySets(...displaySetsWithAppearance(source));

    expect(target.getDisplaySetAppearance(ECG_IDS[0])).toEqual({
      lineWidth: 3,
    });
    expect(target.getEffectiveDisplaySetAppearance(ECG_IDS[0])).toEqual(
      source.getEffectiveDisplaySetAppearance(ECG_IDS[0])
    );
    source.destroy();
    target.destroy();
  });

  it('takes the role of the options', async () => {
    const viewport = createECGViewport('ecgRole');

    await viewport.setDisplaySets(
      { displaySetId: ECG_IDS[0], options: { role: 'overlay' } },
      { displaySetId: ECG_IDS[1], options: { role: 'source' } }
    );

    expect(
      viewport
        .getDisplaySets()
        .map(({ displaySetId, options }) => [displaySetId, options.role])
    ).toEqual([
      [ECG_IDS[0], 'overlay'],
      [ECG_IDS[1], 'source'],
    ]);
    viewport.destroy();
  });
});

describe('getDisplaySets of a whole slide viewport', () => {
  const mounted = [];

  afterEach(() => {
    mounted.splice(0).forEach(unmountSlide);
    displaySetRegistry.clear();
  });

  it('gives the role of the slide, and a copy shows the slide in the same role with the same look', async () => {
    const source = await mountSlide(WSIViewport);
    const target = await mountSlide(WSIViewport);

    mounted.push(source, target);
    await withMicroscopyViewer(0, () =>
      source.viewport.setDisplaySets({
        displaySetId: SLIDE_ID,
        options: { appearance: { opacity: 0.5 } },
      })
    );

    expect(source.viewport.getDisplaySets()).toEqual([
      { displaySetId: SLIDE_ID, options: { role: 'source' } },
    ]);

    await withMicroscopyViewer(0, () =>
      target.viewport.setDisplaySets(
        ...displaySetsWithAppearance(source.viewport)
      )
    );

    expect(target.viewport.getDisplaySets()).toEqual(
      source.viewport.getDisplaySets()
    );
    expect(target.viewport.getDisplaySetAppearance(SLIDE_ID)).toEqual({
      opacity: 0.5,
    });
  });

  it('takes the role of the options', async () => {
    const slide = await mountSlide(WSIViewport);

    mounted.push(slide);
    await withMicroscopyViewer(0, () =>
      slide.viewport.setDisplaySets({
        displaySetId: SLIDE_ID,
        options: { role: 'overlay' },
      })
    );

    expect(slide.viewport.getDisplaySets()).toEqual([
      { displaySetId: SLIDE_ID, options: { role: 'overlay' } },
    ]);
  });
});
