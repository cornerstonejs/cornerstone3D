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
import { DefaultVideoDataProvider } from '../src/RenderingEngine/Viewports/Video/DefaultVideoDataProvider';
import ECGViewport from '../src/RenderingEngine/Viewports/ECG/ECGViewport';
import WSIViewport from '../src/RenderingEngine/Viewports/WSI/WSIViewport';
import { buildWSIColorTransform } from '../src/RenderingEngine/Viewports/WSI/wsiTransformUtils';
import imageIdToURI from '../src/utilities/imageIdToURI';
import {
  IMAGE_ID as SLIDE_ID,
  FRAME_OF_REFERENCE_UID,
  COLUMNS,
  createClient,
  withMicroscopyViewer,
} from './utils/wsiStandIn';

const { Events, MetadataModules, ViewportStatus } = Enums;

/**
 * `addDisplaySet(displaySetId, options)` on a video, an ECG and a whole slide
 * viewport mounts what `setDisplaySets({ displaySetId, options })` mounts for
 * that entry, leaves the display sets on display as they are, and takes its
 * role from the rule of every family: the source on a viewport that shows
 * nothing, an overlay on any other. A family that cannot show a second
 * display set of a kind refuses it in words, through both calls. The current
 * display set of these viewports, which the calls without an id follow, is
 * their source.
 */

/**
 * Records each DISPLAY_SETS_CHANGED of a viewport, with what
 * `getDisplaySets()` answers in the listener.
 */
function recordDisplaySetsChanged(viewport) {
  const events = [];

  viewport.element.addEventListener(Events.DISPLAY_SETS_CHANGED, (evt) => {
    events.push({
      displaySets: evt.detail.displaySets,
      sourceDisplaySetId: evt.detail.sourceDisplaySetId,
      added: evt.detail.added,
      removed: evt.detail.removed,
      sourceChanged: evt.detail.sourceChanged,
      mounted: viewport.getDisplaySets().map(({ displaySetId, options }) => ({
        displaySetId,
        role: options.role,
      })),
    });
  });

  return events;
}

/** What DISPLAY_SETS_CHANGED gives for display sets and the change. */
function changed(displaySets, { added = [], removed = [], sourceChanged }) {
  const entries = displaySets.map(([displaySetId, role]) => ({
    displaySetId,
    role,
  }));

  return {
    displaySets: entries,
    sourceDisplaySetId: entries.find(({ role }) => role === 'source')
      ?.displaySetId,
    added,
    removed,
    sourceChanged,
    mounted: entries,
  };
}

/** Records the detail of each event of a type on the element of a viewport. */
function recordEvents(viewport, type) {
  const details = [];

  viewport.element.addEventListener(type, (evt) => details.push(evt.detail));

  return details;
}

/** Resolves after the pending promise jobs and timers of a few turns. */
async function settle() {
  for (let turn = 0; turn < 5; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** The display set ids and roles that a viewport shows. */
function rolesOf(viewport) {
  return viewport
    .getDisplaySets()
    .map(({ displaySetId, options }) => [displaySetId, options.role]);
}

describe('addDisplaySet on a video viewport', () => {
  const FIRST = 'wadors:https://server/studies/1/series/2/instances/1/frames/1';
  const SECOND =
    'wadors:https://server/studies/1/series/2/instances/2/frames/1';
  const SEGMENTATION = 'segmentationOverTheVideo';
  const FRAMES = 50;
  const FPS = { [FIRST]: 10, [SECOND]: 25 };
  const viewports = [];

  /** Gives a jsdom video element what a loaded video has. */
  function stubVideoElement(video, fps) {
    Object.defineProperty(video, 'videoWidth', { value: 200 });
    Object.defineProperty(video, 'videoHeight', { value: 100 });
    Object.defineProperty(video, 'duration', { value: FRAMES / fps });
    Object.defineProperty(video, 'readyState', { value: 4 });
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true });
    Object.defineProperty(video, 'paused', { get: () => true });
    video.play = jest.fn(() => Promise.resolve());
    video.pause = jest.fn();
  }

  /**
   * Makes a video viewport whose data provider gives the two test videos,
   * each with its own frame rate, and loads any other display set as the
   * default provider does.
   */
  function createVideoViewport(id = 'video') {
    const element = document.createElement('div');
    const defaultProvider = new DefaultVideoDataProvider();

    Object.defineProperty(element, 'clientWidth', { value: 400 });
    Object.defineProperty(element, 'clientHeight', { value: 300 });
    document.body.appendChild(element);

    const viewport = new VideoViewport({
      id,
      element,
      renderingEngineId: 'renderingEngine',
      dataProvider: {
        load: async (displaySetId) => {
          if (!FPS[displaySetId]) {
            return defaultProvider.load(displaySetId);
          }

          return {
            id: displaySetId,
            type: 'video',
            renderedUrl: `https://server/${displaySetId === FIRST ? 'first' : 'second'}.mp4`,
            fps: FPS[displaySetId],
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
          };
        },
      },
    });

    viewports.push(viewport);

    return viewport;
  }

  /**
   * Runs a mount and gives each video element that it makes what a loaded
   * video has, until the mount settles. Gives the promise of the mount.
   */
  async function withLoadedVideos(viewport, mount) {
    const stubbed = new Set(viewport.element.querySelectorAll('video'));
    let finished = false;
    const result = mount().finally(() => {
      finished = true;
    });

    result.catch(() => undefined);

    while (!finished) {
      await settle();
      viewport.element.querySelectorAll('video').forEach((video) => {
        if (stubbed.has(video)) {
          return;
        }

        stubbed.add(video);
        stubVideoElement(
          video,
          video.src.endsWith('first.mp4') ? FPS[FIRST] : FPS[SECOND]
        );
        video.dispatchEvent(new Event('loadedmetadata'));
      });
    }

    return result;
  }

  /** The video element that shows a test video. */
  function videoOf(viewport, displaySetId) {
    const name = displaySetId === FIRST ? 'first' : 'second';

    return Array.from(viewport.element.querySelectorAll('video')).find(
      (video) => video.src.endsWith(`${name}.mp4`)
    );
  }

  /** What a viewport shows: its display sets, the view and the look. */
  function stateOf(viewport) {
    return {
      displaySets: viewport.getDisplaySets(),
      viewState: viewport.getViewState(),
      frameNumber: viewport.getFrameNumber(),
      appearances: viewport
        .getDisplaySets()
        .map(({ displaySetId }) => [
          viewport.getDisplaySetAppearance(displaySetId),
          viewport.getEffectiveDisplaySetAppearance(displaySetId),
        ]),
    };
  }

  beforeEach(() => {
    displaySetRegistry.add(SEGMENTATION, {
      imageIds: ['labelmap:1', 'labelmap:2'],
      volumeId: 'labelmapVolume',
      reference: { kind: 'segmentation', segmentationId: 'segmentation' },
    });
  });

  afterEach(() => {
    viewports.splice(0).forEach((viewport) => viewport.destroy());
    displaySetRegistry.clear();
    document.body.innerHTML = '';
  });

  it('mounts the source on an empty viewport as setDisplaySets of that entry does, and shows its frame', async () => {
    const viewport = createVideoViewport();
    const twin = createVideoViewport('twin');
    const events = recordDisplaySetsChanged(viewport);
    const newImages = recordEvents(viewport, Events.NEW_IMAGE);
    const rendered = recordEvents(viewport, Events.IMAGE_RENDERED);
    const options = { frameNumber: 12, appearance: { playbackRate: 2 } };

    await withLoadedVideos(viewport, () =>
      viewport.addDisplaySet(FIRST, options)
    );
    await withLoadedVideos(twin, () =>
      twin.setDisplaySets({ displaySetId: FIRST, options })
    );
    await settle();

    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: FIRST, options: { role: 'source', frameNumber: 12 } },
    ]);
    expect(stateOf(viewport)).toEqual(stateOf(twin));
    expect(events).toEqual([
      changed([[FIRST, 'source']], { added: [FIRST], sourceChanged: true }),
    ]);
    expect(newImages).toEqual([
      expect.objectContaining({ displaySetId: FIRST, sliceIndex: 11 }),
    ]);

    const video = videoOf(viewport, FIRST);

    expect(video.style.display).toBe('');
    expect(video.playbackRate).toBe(2);
    expect(video.currentTime).toBeGreaterThan(1);
    expect(video.currentTime).toBe(videoOf(twin, FIRST).currentTime);
    expect(rendered.length).toBeGreaterThan(0);
    expect(viewport.getCurrentMode()).toBe('video');
  });

  it('adds a second video as an overlay on the frame and the view of the source, and leaves the source as it is', async () => {
    const viewport = createVideoViewport();

    await withLoadedVideos(viewport, () => viewport.addDisplaySet(FIRST));
    viewport.setFrameNumber(21);
    viewport.setZoom(2);

    const first = videoOf(viewport, FIRST);
    const timeOfTheSource = first.currentTime;
    const pausesOfTheSource = first.pause.mock.calls.length;
    const viewState = viewport.getViewState();
    const events = recordDisplaySetsChanged(viewport);
    const newImages = recordEvents(viewport, Events.NEW_IMAGE);

    await withLoadedVideos(viewport, () =>
      viewport.addDisplaySet(SECOND, { appearance: { opacity: 0.5 } })
    );

    const second = videoOf(viewport, SECOND);

    expect(rolesOf(viewport)).toEqual([
      [FIRST, 'source'],
      [SECOND, 'overlay'],
    ]);
    expect(events).toEqual([
      changed(
        [
          [FIRST, 'source'],
          [SECOND, 'overlay'],
        ],
        { added: [SECOND], sourceChanged: false }
      ),
    ]);
    expect(viewport.getViewState()).toEqual(viewState);
    expect(viewport.getFrameNumber()).toBe(21);
    expect(viewport.getFrameRate()).toBe(FPS[FIRST]);
    expect(timeOfTheSource).toBeGreaterThan(1.9);
    expect(first.currentTime).toBe(timeOfTheSource);
    expect(first.pause.mock.calls.length).toBe(pausesOfTheSource);
    expect(second.currentTime).toBe(timeOfTheSource);
    expect(second.style.opacity).toBe('0.5');
    expect(second.style.width).toBe(first.style.width);
    expect(newImages).toEqual([]);
  });

  it('makes the second video the source when the first one goes', async () => {
    const viewport = createVideoViewport();

    await withLoadedVideos(viewport, () => viewport.addDisplaySet(FIRST));
    await withLoadedVideos(viewport, () => viewport.addDisplaySet(SECOND));

    const events = recordDisplaySetsChanged(viewport);

    viewport.removeDisplaySet(FIRST);

    expect(events).toEqual([
      changed([[SECOND, 'source']], {
        removed: [FIRST],
        sourceChanged: true,
      }),
    ]);
    expect(viewport.getFrameRate()).toBe(FPS[SECOND]);
    expect(viewport.getCurrentImageId()).toContain('/instances/2/');
    expect(videoOf(viewport, FIRST)).toBeUndefined();
  });

  it('refuses a display set that is not a video, through addDisplaySet and setDisplaySets, and keeps the video on display', async () => {
    const viewport = createVideoViewport();
    const message = `[VideoViewport] The display set "${SEGMENTATION}" has no imageId, which a VideoViewport needs to show it`;

    await withLoadedVideos(viewport, () => viewport.addDisplaySet(FIRST));

    const events = recordDisplaySetsChanged(viewport);

    await expect(viewport.addDisplaySet(SEGMENTATION)).rejects.toThrow(message);
    expect(rolesOf(viewport)).toEqual([[FIRST, 'source']]);
    expect(videoOf(viewport, FIRST).isConnected).toBe(true);

    await expect(
      withLoadedVideos(viewport, () =>
        viewport.setDisplaySets(
          { displaySetId: FIRST },
          { displaySetId: SEGMENTATION }
        )
      )
    ).rejects.toThrow(message);
    expect(events).toEqual([]);
  });

  it('follows the source, not the first display set, without an id', async () => {
    const viewport = createVideoViewport();
    const appearanceEvents = recordEvents(
      viewport,
      Events.DISPLAY_SET_APPEARANCE_CHANGED
    );
    const newImages = recordEvents(viewport, Events.NEW_IMAGE);

    await withLoadedVideos(viewport, () =>
      viewport.setDisplaySets(
        { displaySetId: FIRST, options: { role: 'overlay' } },
        { displaySetId: SECOND, options: { role: 'source' } }
      )
    );
    appearanceEvents.length = 0;
    viewport.setDisplaySetAppearance({ playbackRate: 2 });

    expect(rolesOf(viewport)).toEqual([
      [FIRST, 'overlay'],
      [SECOND, 'source'],
    ]);
    expect(viewport.getFrameRate()).toBe(FPS[SECOND]);
    expect(viewport.getCurrentImageId()).toContain('/instances/2/');
    expect(viewport.getViewReference().displaySetId).toBe(SECOND);
    expect(newImages.map(({ displaySetId }) => displaySetId)).toEqual([SECOND]);
    expect(
      appearanceEvents.map(({ displaySetId, role, cause }) => ({
        displaySetId,
        role,
        cause,
      }))
    ).toEqual([{ displaySetId: SECOND, role: 'source', cause: 'edit' }]);
    expect(viewport.getDisplaySetAppearance()).toEqual({ playbackRate: 2 });
    expect(videoOf(viewport, SECOND).playbackRate).toBe(2);
    expect(videoOf(viewport, FIRST).playbackRate).toBe(1);
  });

  it('follows a display set that addDisplaySet mounts with the role source', async () => {
    const viewport = createVideoViewport();

    await withLoadedVideos(viewport, () => viewport.addDisplaySet(FIRST));
    await withLoadedVideos(viewport, () =>
      viewport.addDisplaySet(SECOND, { role: 'source' })
    );

    expect(rolesOf(viewport)).toEqual([
      [FIRST, 'overlay'],
      [SECOND, 'source'],
    ]);
    expect(viewport.getFrameRate()).toBe(FPS[SECOND]);
    expect(viewport.getViewReference().displaySetId).toBe(SECOND);
  });
});

describe('addDisplaySet on an ECG viewport', () => {
  const ECG_IDS = ['ecg:first', 'ecg:second'];
  const SAMPLES = { 'ecg:first': 500, 'ecg:second': 1000 };

  /**
   * The ECG module of a record of two multiplex groups of two leads, for
   * each test id: the second record is twice as long as the first.
   */
  function ecgModuleProvider(type, imageId, options) {
    if (type !== MetadataModules.ECG || !ECG_IDS.includes(imageId)) {
      return;
    }

    const multiplexGroupIndex = options?.multiplexGroupIndex ?? 0;
    const samples = SAMPLES[imageId];

    return {
      numberOfWaveformChannels: 2,
      numberOfWaveformSamples: samples,
      samplingFrequency: 500,
      multiplexGroupIndex,
      totalMultiplexGroups: 2,
      channelDefinitionSequence: [
        ['I', 'II'],
        ['V1', 'V2'],
      ][multiplexGroupIndex].map((codeMeaning) => ({
        channelSourceSequence: { codeMeaning },
        mvPerUnit: 0.001,
      })),
      waveformData: {
        retrieveBulkData: async () => [
          new Int16Array(samples).fill(100),
          new Int16Array(samples).fill(-100),
        ],
      },
    };
  }

  /** Makes an ECG viewport on an element with a canvas. */
  function createECGViewport(id = 'ecg') {
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

  /** What a viewport shows: its display sets, the view and the look. */
  function stateOf(viewport) {
    return {
      displaySets: viewport.getDisplaySets(),
      viewState: viewport.getViewState(),
      channels: viewport.getVisibleChannels(),
      appearances: viewport
        .getDisplaySets()
        .map(({ displaySetId }) => [
          viewport.getDisplaySetAppearance(displaySetId),
          viewport.getEffectiveDisplaySetAppearance(displaySetId),
        ]),
    };
  }

  /** The error of a call that would show two waveforms. */
  function twoWaveformsMessage(call) {
    return (
      `[ECGViewport] An ECG viewport shows one waveform, and ${call} would show 2: ` +
      `"${ECG_IDS[0]}", "${ECG_IDS[1]}". Mount one with setDisplaySets({ displaySetId }), ` +
      'which shows it in place of the waveform on display, and show the others in other ECG viewports.'
    );
  }

  beforeEach(() => {
    metaData.addProvider(ecgModuleProvider, 100000);
  });

  afterEach(() => {
    metaData.removeProvider(ecgModuleProvider);
    document.body.innerHTML = '';
  });

  it('mounts the source on an empty viewport as setDisplaySets of that entry does, and draws the waveform', async () => {
    const viewport = createECGViewport();
    const twin = createECGViewport('twin');
    const events = recordDisplaySetsChanged(viewport);
    const rendered = recordEvents(viewport, Events.IMAGE_RENDERED);
    const options = { multiplexGroupIndex: 1, appearance: { lineWidth: 3 } };

    await viewport.addDisplaySet(ECG_IDS[0], options);
    await twin.setDisplaySets({ displaySetId: ECG_IDS[0], options });
    viewport.render();

    expect(viewport.getDisplaySets()).toEqual([
      {
        displaySetId: ECG_IDS[0],
        options: { role: 'source', multiplexGroupIndex: 1 },
      },
    ]);
    expect(stateOf(viewport)).toEqual(stateOf(twin));
    expect(viewport.getVisibleChannels().map(({ name }) => name)).toEqual([
      'V1',
      'V2',
    ]);
    expect(events).toEqual([
      changed([[ECG_IDS[0], 'source']], {
        added: [ECG_IDS[0]],
        sourceChanged: true,
      }),
    ]);
    expect(rendered.at(-1).resolvedView).toBeDefined();
    expect(viewport.getCurrentMode()).toBe('ecg');
    viewport.destroy();
    twin.destroy();
  });

  it('refuses a second waveform, through addDisplaySet and setDisplaySets, and keeps the waveform on display', async () => {
    const viewport = createECGViewport();

    await viewport.addDisplaySet(ECG_IDS[0]);

    const viewState = viewport.getViewState();
    const events = recordDisplaySetsChanged(viewport);

    await expect(viewport.addDisplaySet(ECG_IDS[1])).rejects.toThrow(
      twoWaveformsMessage(`addDisplaySet("${ECG_IDS[1]}")`)
    );
    await expect(
      viewport.setDisplaySets(
        { displaySetId: ECG_IDS[0] },
        { displaySetId: ECG_IDS[1] }
      )
    ).rejects.toThrow(twoWaveformsMessage('setDisplaySets'));

    expect(rolesOf(viewport)).toEqual([[ECG_IDS[0], 'source']]);
    expect(viewport.getViewState()).toEqual(viewState);
    expect(viewport.getDurationMs()).toBe(1000);
    expect(events).toEqual([]);
    viewport.destroy();
  });

  it('mounts the waveform on display again in its role, and the next waveform as the source once the first one went', async () => {
    const viewport = createECGViewport();

    await viewport.setDisplaySets({
      displaySetId: ECG_IDS[0],
      options: { role: 'overlay' },
    });
    await viewport.addDisplaySet(ECG_IDS[0], { multiplexGroupIndex: 1 });

    expect(viewport.getDisplaySets()).toEqual([
      {
        displaySetId: ECG_IDS[0],
        options: { role: 'overlay', multiplexGroupIndex: 1 },
      },
    ]);

    const events = recordDisplaySetsChanged(viewport);

    viewport.removeDisplaySet(ECG_IDS[0]);
    await viewport.addDisplaySet(ECG_IDS[1]);

    expect(events).toEqual([
      changed([], { removed: [ECG_IDS[0]], sourceChanged: false }),
      changed([[ECG_IDS[1], 'source']], {
        added: [ECG_IDS[1]],
        sourceChanged: true,
      }),
    ]);
    expect(viewport.getSourceDisplaySetId()).toBe(ECG_IDS[1]);
    expect(viewport.getDurationMs()).toBe(2000);
    expect(viewport.getViewState().timeRange).toEqual([0, 2000]);
    viewport.destroy();
  });
});

describe('addDisplaySet on a whole slide viewport', () => {
  const SECOND_SLIDE = 'secondSlide';
  const SECOND_IMAGE_ID =
    'wadors:https://server/studies/1/series/4/instances/5';
  const SECOND_FRAME_OF_REFERENCE_UID = '4.5.6';
  const NO_CLIENT = 'slideWithoutClient';
  const elements = [];

  /**
   * A stand-in for the DICOMweb client of the second slide: half as wide
   * as the first, in another frame of reference.
   */
  function createSecondClient() {
    const client = createClient();

    return {
      getDICOMwebMetadata: (imageId) => ({
        ...client.getDICOMwebMetadata(imageId),
        TotalPixelMatrixColumns: COLUMNS / 2,
        '00200052': { Value: [SECOND_FRAME_OF_REFERENCE_UID] },
      }),
    };
  }

  /** Makes an empty whole slide viewport on an element of the test size. */
  function createSlideViewport(id = 'wsi') {
    const element = document.createElement('div');
    const viewportElement = document.createElement('div');
    const canvas = document.createElement('canvas');

    [element, canvas].forEach((node) => {
      Object.defineProperty(node, 'clientWidth', { value: 400 });
      Object.defineProperty(node, 'clientHeight', { value: 300 });
    });
    viewportElement.appendChild(canvas);
    element.appendChild(viewportElement);
    document.body.appendChild(element);

    const viewport = new WSIViewport({
      id,
      element,
      canvas,
      renderingEngineId: 'renderingEngine',
    });

    elements.push({ viewport, element });

    return viewport;
  }

  /** Runs a mount with the stand-in microscopy viewer, and gives its maps. */
  async function mountWithMaps(mount) {
    const maps = [];

    await withMicroscopyViewer(0, mount, maps);

    return maps;
  }

  /** What a viewport shows: its display sets, the view and the look. */
  function stateOf(viewport) {
    return {
      displaySets: viewport.getDisplaySets(),
      viewState: viewport.getViewState(),
      appearances: viewport
        .getDisplaySets()
        .map(({ displaySetId }) => [
          viewport.getDisplaySetAppearance(displaySetId),
          viewport.getEffectiveDisplaySetAppearance(displaySetId),
        ]),
    };
  }

  beforeEach(() => {
    displaySetRegistry.add(SLIDE_ID, {
      imageIds: [SLIDE_ID],
      options: { miniNavigationOverlay: false, webClient: createClient() },
    });
    displaySetRegistry.add(SECOND_SLIDE, {
      imageIds: [SECOND_IMAGE_ID],
      options: {
        miniNavigationOverlay: false,
        webClient: createSecondClient(),
      },
    });
    displaySetRegistry.add(NO_CLIENT, { imageIds: [SECOND_IMAGE_ID] });
  });

  afterEach(() => {
    elements.splice(0).forEach(({ viewport, element }) => {
      viewport.destroy();
      element.remove();
    });
    displaySetRegistry.clear();
  });

  it('mounts the source on an empty viewport as setDisplaySets of that entry does, and draws the slide', async () => {
    const viewport = createSlideViewport();
    const twin = createSlideViewport('twin');
    const events = recordDisplaySetsChanged(viewport);
    const rendered = recordEvents(viewport, Events.IMAGE_RENDERED);
    const options = { appearance: { opacity: 0.5 } };
    const [map] = await mountWithMaps(() =>
      viewport.addDisplaySet(SLIDE_ID, options)
    );

    await mountWithMaps(() =>
      twin.setDisplaySets({ displaySetId: SLIDE_ID, options })
    );
    map.dispatch('postrender');
    map.dispatch('rendercomplete');

    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: SLIDE_ID, options: { role: 'source' } },
    ]);
    expect(stateOf(viewport)).toEqual(stateOf(twin));
    expect(events).toEqual([
      changed([[SLIDE_ID, 'source']], {
        added: [SLIDE_ID],
        sourceChanged: true,
      }),
    ]);
    expect(
      viewport.element.querySelector('.DicomMicroscopyViewer').style.opacity
    ).toBe('0.5');
    expect(rendered).toEqual([
      expect.objectContaining({
        rendering: { displaySetId: SLIDE_ID, renderMode: 'wsi2d' },
      }),
    ]);
    expect(viewport.viewportStatus).toBe(ViewportStatus.RENDERED);
    expect(viewport.getCurrentMode()).toBe('wholeSlide');
  });

  it('adds a second slide as an overlay with the view of the source, and leaves the source as it is', async () => {
    const viewport = createSlideViewport();
    const [sourceMap] = await mountWithMaps(() =>
      viewport.addDisplaySet(SLIDE_ID)
    );

    viewport.setViewState({ centerIndex: [5000, -7000], rotation: 30 });

    const sourceView = sourceMap.getView();
    const before = {
      center: sourceView.getCenter(),
      resolution: sourceView.getResolution(),
      rotation: sourceView.getRotation(),
    };
    const events = recordDisplaySetsChanged(viewport);
    const [overlayMap] = await mountWithMaps(() =>
      viewport.addDisplaySet(SECOND_SLIDE, { appearance: { opacity: 0.4 } })
    );
    const overlayView = overlayMap.getView();

    expect(rolesOf(viewport)).toEqual([
      [SLIDE_ID, 'source'],
      [SECOND_SLIDE, 'overlay'],
    ]);
    expect(events).toEqual([
      changed(
        [
          [SLIDE_ID, 'source'],
          [SECOND_SLIDE, 'overlay'],
        ],
        { added: [SECOND_SLIDE], sourceChanged: false }
      ),
    ]);
    expect({
      center: sourceView.getCenter(),
      resolution: sourceView.getResolution(),
      rotation: sourceView.getRotation(),
    }).toEqual(before);
    expect(overlayView.getCenter()).toEqual(before.center);
    expect(overlayView.getResolution()).toBe(before.resolution);
    expect(overlayView.getRotation()).toBeCloseTo(before.rotation);
    expect(viewport.getEffectiveDisplaySetAppearance(SECOND_SLIDE)).toEqual({
      visible: true,
      opacity: 0.4,
    });
    expect(viewport.getCurrentImageId()).toBe(SLIDE_ID);
  });

  it('makes the second slide the source when the first one goes', async () => {
    const viewport = createSlideViewport();

    await mountWithMaps(() => viewport.addDisplaySet(SLIDE_ID));
    await mountWithMaps(() => viewport.addDisplaySet(SECOND_SLIDE));

    const events = recordDisplaySetsChanged(viewport);

    viewport.removeDisplaySet(SLIDE_ID);

    expect(events).toEqual([
      changed([[SECOND_SLIDE, 'source']], {
        removed: [SLIDE_ID],
        sourceChanged: true,
      }),
    ]);
    expect(viewport.getCurrentImageId()).toBe(SECOND_IMAGE_ID);
    expect(viewport.getFrameOfReferenceUID()).toBe(
      SECOND_FRAME_OF_REFERENCE_UID
    );
    expect(
      viewport.element.querySelectorAll('.DicomMicroscopyViewer')
    ).toHaveLength(1);
  });

  it('refuses a display set that is not a slide, through addDisplaySet and setDisplaySets, and keeps the slide on display', async () => {
    const viewport = createSlideViewport();
    const message = `[WSIViewport] The display set "${NO_CLIENT}" has no imageIds with a web client`;

    await mountWithMaps(() => viewport.addDisplaySet(SLIDE_ID));

    const events = recordDisplaySetsChanged(viewport);

    await expect(
      withMicroscopyViewer(0, () => viewport.addDisplaySet(NO_CLIENT))
    ).rejects.toThrow(message);
    expect(rolesOf(viewport)).toEqual([[SLIDE_ID, 'source']]);
    expect(
      viewport.element.querySelectorAll('.DicomMicroscopyViewer')
    ).toHaveLength(1);

    await expect(
      withMicroscopyViewer(0, () =>
        viewport.setDisplaySets(
          { displaySetId: SLIDE_ID },
          { displaySetId: NO_CLIENT }
        )
      )
    ).rejects.toThrow(message);
    expect(events).toEqual([]);
  });
});

describe('The current display set of a whole slide viewport with two slides', () => {
  const SECOND_SLIDE = 'secondSlide';
  const SECOND_IMAGE_ID =
    'wadors:https://server/studies/1/series/4/instances/5';
  const elements = [];

  /** Makes a whole slide viewport that shows two slides, the first the source. */
  async function mountTwoSlides() {
    const element = document.createElement('div');
    const viewportElement = document.createElement('div');
    const canvas = document.createElement('canvas');
    const client = createClient();

    [element, canvas].forEach((node) => {
      Object.defineProperty(node, 'clientWidth', { value: 400 });
      Object.defineProperty(node, 'clientHeight', { value: 300 });
    });
    viewportElement.appendChild(canvas);
    element.appendChild(viewportElement);
    document.body.appendChild(element);
    displaySetRegistry.add(SLIDE_ID, {
      imageIds: [SLIDE_ID],
      options: { miniNavigationOverlay: false, webClient: client },
    });
    displaySetRegistry.add(SECOND_SLIDE, {
      imageIds: [SECOND_IMAGE_ID],
      options: {
        miniNavigationOverlay: false,
        webClient: {
          getDICOMwebMetadata: (imageId) => ({
            ...client.getDICOMwebMetadata(imageId),
            TotalPixelMatrixColumns: COLUMNS / 2,
            '00200052': { Value: ['4.5.6'] },
          }),
        },
      },
    });

    const viewport = new WSIViewport({
      id: 'wsi',
      element,
      canvas,
      renderingEngineId: 'renderingEngine',
    });
    const maps = [];

    elements.push({ viewport, element });
    await withMicroscopyViewer(
      0,
      () =>
        viewport.setDisplaySets(
          { displaySetId: SLIDE_ID },
          { displaySetId: SECOND_SLIDE }
        ),
      maps
    );

    return { viewport, maps };
  }

  afterEach(() => {
    elements.splice(0).forEach(({ viewport, element }) => {
      viewport.destroy();
      element.remove();
    });
    displaySetRegistry.clear();
  });

  it('is the source: the appearance without an id, the frame of reference, the image data and the view reference follow it', async () => {
    const { viewport } = await mountTwoSlides();
    const appearanceEvents = recordEvents(
      viewport,
      Events.DISPLAY_SET_APPEARANCE_CHANGED
    );

    viewport.setDisplaySetAppearance({ opacity: 0.5 });

    expect(rolesOf(viewport)).toEqual([
      [SLIDE_ID, 'source'],
      [SECOND_SLIDE, 'overlay'],
    ]);
    expect(
      appearanceEvents.map(({ displaySetId, role }) => ({
        displaySetId,
        role,
      }))
    ).toEqual([{ displaySetId: SLIDE_ID, role: 'source' }]);
    expect(viewport.getDisplaySetAppearance()).toEqual({ opacity: 0.5 });
    expect(viewport.getDisplaySetAppearance(SECOND_SLIDE)).toEqual({});
    expect(viewport.getFrameOfReferenceUID()).toBe(FRAME_OF_REFERENCE_UID);
    expect(viewport.getImageData().dimensions[0]).toBe(COLUMNS);
    expect(viewport.getCurrentImageId()).toBe(SLIDE_ID);
    expect(viewport.getViewReference().displaySetId).toBe(SLIDE_ID);
    expect(viewport.hasImageURI(imageIdToURI(SLIDE_ID))).toBe(true);
    expect(viewport.hasImageURI(imageIdToURI(SECOND_IMAGE_ID))).toBe(false);
  });

  it('draws each slide with its own window', async () => {
    const { viewport, maps } = await mountTwoSlides();
    const layerOf = (map) => {
      map.getViewport().innerHTML =
        '<div class="ol-layers"><canvas></canvas></div>';

      return map.getViewport().querySelector('canvas');
    };
    const [sourceLayer, overlayLayer] = maps.map(layerOf);
    const sourceWindow = { lower: 10, upper: 200 };
    const overlayWindow = { lower: 40, upper: 120 };

    viewport.setDisplaySetAppearance(SLIDE_ID, { voiRange: sourceWindow });
    viewport.setDisplaySetAppearance(SECOND_SLIDE, {
      voiRange: overlayWindow,
    });

    expect(sourceLayer.style.filter).toBe(buildWSIColorTransform(sourceWindow));
    expect(overlayLayer.style.filter).toBe(
      buildWSIColorTransform(overlayWindow)
    );
  });
});
