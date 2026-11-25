import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import VideoViewport from '../src/RenderingEngine/Viewports/Video/VideoViewport';
import ECGViewport from '../src/RenderingEngine/Viewports/ECG/ECGViewport';
import WSIViewport from '../src/RenderingEngine/Viewports/WSI/WSIViewport';
import VolumeViewport3D from '../src/RenderingEngine/Viewports/Volume3D/viewport3D';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';
import {
  IMAGE_ID as SLIDE_ID,
  createClient,
  mountNext as mountSlide,
  remountNext as remountSlide,
  unmount as unmountSlide,
  withMicroscopyViewer,
} from './utils/wsiStandIn';

const { setRenderBackend, Enums, imageLoader, metaData, init, cache } =
  cornerstone3D;
const { Events, MetadataModules } = Enums;

/**
 * The keys of a DISPLAY_SETS_CHANGED detail that say what the viewport shows
 * and what the call changed, and the display sets that
 * `viewport.getDisplaySets()` gave in the listener.
 */
function summaryOf(detail, mounted) {
  return {
    displaySets: detail.displaySets,
    sourceDisplaySetId: detail.sourceDisplaySetId,
    added: detail.added,
    removed: detail.removed,
    sourceChanged: detail.sourceChanged,
    mounted,
  };
}

/**
 * Records each DISPLAY_SETS_CHANGED of a viewport, with what its getters
 * answer in the listener.
 */
function recordDisplaySetsChanged(viewport) {
  const events = [];

  viewport.element.addEventListener(Events.DISPLAY_SETS_CHANGED, (evt) => {
    expect(evt.detail.viewportId).toBe(viewport.id);
    expect(evt.detail.renderingEngineId).toBe(viewport.renderingEngineId);
    expect(evt.detail.element).toBe(viewport.element);
    events.push(
      summaryOf(
        evt.detail,
        viewport.getDisplaySets().map(({ displaySetId, options }) => ({
          displaySetId,
          role: options.role,
        }))
      )
    );
  });

  return events;
}

/** Records the detail of each NEW_IMAGE of a viewport. */
function recordNewImage(viewport) {
  const details = [];

  viewport.element.addEventListener(Events.NEW_IMAGE, (evt) =>
    details.push(evt.detail)
  );

  return details;
}

/** What DISPLAY_SETS_CHANGED gives for display sets, the change and the getters. */
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

/**
 * Holds the first load of the data provider of a viewport, once it loaded,
 * until the function it gives is called, so a call that loads it can be
 * superseded.
 */
function holdFirstLoad(viewport) {
  const provider = viewport.dataProvider;
  let release;
  let held = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  viewport.dataProvider = {
    load: async (displaySetId, options) => {
      const data = await provider.load(displaySetId, options);

      if (!held) {
        held = true;
        await gate;
      }

      return data;
    },
  };

  return () => release();
}

/** Resolves after the pending promise jobs and timers of a few turns. */
async function settle() {
  for (let turn = 0; turn < 5; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('DISPLAY_SETS_CHANGED and NEW_IMAGE on a planar viewport', () => {
  const engines = [];

  /** Image ids of the fake image loader for a stack of four 16 by 16 images. */
  function createImageIds(name, { fail = false } = {}) {
    return [0, 1, 2, 3].map(
      (sliceIndex) =>
        `fakeImageLoader:${encodeURIComponent(
          JSON.stringify({
            loader: 'fakeImageLoader',
            name,
            rows: 16,
            columns: 16,
            barStart: 2,
            barWidth: 4,
            xSpacing: 1,
            ySpacing: 1,
            sliceIndex,
            ...(fail ? { fail: true } : {}),
          })
        )}`
    );
  }

  /** The image loader of the tests: an image id marked `fail` rejects. */
  function testImageLoader(imageId) {
    if (imageId.includes(encodeURIComponent('"fail":true'))) {
      return {
        promise: Promise.reject(new Error(`no data for ${imageId}`)),
      };
    }

    return fakeImageLoader(imageId);
  }

  /** Makes a planar viewport that draws on the CPU, on a 64 by 64 element. */
  function createViewport() {
    window.devicePixelRatio = 1;
    init({});
    setRenderBackend('cpu');
    imageLoader.registerImageLoader('fakeImageLoader', testImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);

    const element = document.createElement('div');

    document.body.appendChild(element);
    ['offsetWidth', 'clientWidth'].forEach((key) =>
      Object.defineProperty(element, key, { value: 64 })
    );
    ['offsetHeight', 'clientHeight'].forEach((key) =>
      Object.defineProperty(element, key, { value: 64 })
    );
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ width: 64, height: 64 }),
    });

    const made = createPlanarViewportOnStandInEngine(element, 'planar');

    engines.push(made.renderingEngine);

    return made.viewport;
  }

  /** Registers a stack under a display set id. */
  function registerStack(displaySetId, options = {}) {
    displaySetRegistry.add(displaySetId, {
      imageIds: createImageIds(displaySetId, options),
    });
  }

  afterEach(() => {
    engines.splice(0).forEach((engine) => engine.destroy());
    cache.purgeCache();
    displaySetRegistry.clear();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    setRenderBackend('auto');
    document.body.innerHTML = '';
  });

  it('fires once for each committed setDisplaySets, addDisplaySet and removeDisplaySet, overlays too, with sourceChanged, when the getters answer for the call', async () => {
    const viewport = createViewport();
    const events = recordDisplaySetsChanged(viewport);

    registerStack('stack');
    registerStack('labelmap');

    await viewport.setDisplaySets({ displaySetId: 'stack' });
    await viewport.addDisplaySet('labelmap', { role: 'overlay' });
    viewport.removeDisplaySet('labelmap');
    viewport.removeDisplaySet('not-mounted');
    await viewport.setDisplaySets({ displaySetId: 'stack' });
    viewport.removeDisplaySet('stack');

    expect(events).toEqual([
      changed([['stack', 'source']], { added: ['stack'], sourceChanged: true }),
      changed(
        [
          ['stack', 'source'],
          ['labelmap', 'overlay'],
        ],
        { added: ['labelmap'], sourceChanged: false }
      ),
      changed([['stack', 'source']], {
        removed: ['labelmap'],
        sourceChanged: false,
      }),
      changed([['stack', 'source']], { added: ['stack'], sourceChanged: true }),
      changed([], { removed: ['stack'], sourceChanged: true }),
    ]);
  });

  it('gives the new source, and the display sets that went, when a setDisplaySets replaces the source and its overlay', async () => {
    const viewport = createViewport();

    registerStack('first');
    registerStack('labelmap');
    registerStack('second');
    await viewport.setDisplaySets({ displaySetId: 'first' });
    await viewport.addDisplaySet('labelmap', { role: 'overlay' });

    const events = recordDisplaySetsChanged(viewport);

    await viewport.setDisplaySets({ displaySetId: 'second' });

    expect(events).toEqual([
      changed([['second', 'source']], {
        added: ['second'],
        removed: ['first', 'labelmap'],
        sourceChanged: true,
      }),
    ]);
  });

  it('fires nothing for a setDisplaySets that a newer one supersedes, nor for one that fails', async () => {
    const viewport = createViewport();
    const events = recordDisplaySetsChanged(viewport);

    registerStack('older');
    registerStack('newer');
    registerStack('failing', { fail: true });

    const release = holdFirstLoad(viewport);
    const older = viewport.setDisplaySets({ displaySetId: 'older' });

    await viewport.setDisplaySets({ displaySetId: 'newer' });
    release();
    await older;
    await settle();

    await expect(
      viewport.setDisplaySets({ displaySetId: 'failing' })
    ).rejects.toThrow();
    await settle();

    expect(events).toEqual([
      changed([['newer', 'source']], { added: ['newer'], sourceChanged: true }),
    ]);
  });

  it('fires NEW_IMAGE for the source only in stack mode, with its display set and the slice index', async () => {
    const viewport = createViewport();
    const newImages = recordNewImage(viewport);

    registerStack('stack');
    registerStack('labelmap');
    await viewport.setDisplaySets({ displaySetId: 'stack' });
    await viewport.addDisplaySet('labelmap', { role: 'overlay' });
    await viewport.setImageIdIndex(2);
    await settle();

    expect(
      newImages.map(({ displaySetId, sliceIndex, numberOfSlices }) => ({
        displaySetId,
        sliceIndex,
        numberOfSlices,
      }))
    ).toEqual([
      { displaySetId: 'stack', sliceIndex: 0, numberOfSlices: 4 },
      { displaySetId: 'stack', sliceIndex: 2, numberOfSlices: 4 },
    ]);
    expect(newImages.at(-1).imageIdIndex).toBeUndefined();
    expect(newImages.at(-1).sliceIndex).toBe(viewport.getSliceIndex());
  });

  it('makes the first display set that remains the source when the source goes, in the event, the getters, the render plan and NEW_IMAGE', async () => {
    const viewport = createViewport();

    registerStack('stack');
    registerStack('first');
    registerStack('second');
    await viewport.setDisplaySets(
      { displaySetId: 'stack' },
      { displaySetId: 'first' },
      { displaySetId: 'second' }
    );

    const events = recordDisplaySetsChanged(viewport);
    const newImages = recordNewImage(viewport);

    viewport.removeDisplaySet('stack');
    await viewport.setImageIdIndex(2);
    await settle();

    expect(events).toEqual([
      changed(
        [
          ['first', 'source'],
          ['second', 'overlay'],
        ],
        { removed: ['stack'], sourceChanged: true }
      ),
    ]);
    expect(viewport.getSourceDisplaySetId()).toBe('first');
    expect(viewport.getCurrentImageId()).toBe(createImageIds('first')[2]);
    expect(
      viewport
        .getRenderPlan()
        .map(({ displaySetId, role }) => ({ displaySetId, role }))
    ).toEqual([
      { displaySetId: 'first', role: 'source' },
      { displaySetId: 'second', role: 'overlay' },
    ]);
    expect(
      newImages.map(({ displaySetId, sliceIndex }) => ({
        displaySetId,
        sliceIndex,
      }))
    ).toEqual([{ displaySetId: 'first', sliceIndex: 2 }]);
  });

  it('mounts the first display set that addDisplaySet gives without a role to an empty viewport as the source, a later one as an overlay', async () => {
    const viewport = createViewport();
    const events = recordDisplaySetsChanged(viewport);
    const newImages = recordNewImage(viewport);

    registerStack('stack');
    registerStack('labelmap');
    await viewport.addDisplaySet('stack');
    await viewport.addDisplaySet('labelmap');
    await settle();

    expect(events).toEqual([
      changed([['stack', 'source']], { added: ['stack'], sourceChanged: true }),
      changed(
        [
          ['stack', 'source'],
          ['labelmap', 'overlay'],
        ],
        { added: ['labelmap'], sourceChanged: false }
      ),
    ]);
    expect(viewport.getSourceDisplaySetId()).toBe('stack');
    expect(newImages.map(({ displaySetId }) => displaySetId)).toEqual([
      'stack',
    ]);
  });

  it('keeps a mount of overlays only without a source, also when one of them goes', async () => {
    const viewport = createViewport();
    const events = recordDisplaySetsChanged(viewport);

    registerStack('first');
    registerStack('second');
    await viewport.addDisplaySet('first', { role: 'overlay' });
    await viewport.addDisplaySet('second');
    viewport.removeDisplaySet('first');

    expect(events).toEqual([
      changed([['first', 'overlay']], {
        added: ['first'],
        sourceChanged: false,
      }),
      changed(
        [
          ['first', 'overlay'],
          ['second', 'overlay'],
        ],
        { added: ['second'], sourceChanged: false }
      ),
      changed([['second', 'overlay']], {
        removed: ['first'],
        sourceChanged: false,
      }),
    ]);
    expect(viewport.getSourceDisplaySetId()).toBeUndefined();
  });
});

describe('DISPLAY_SETS_CHANGED on a 3D viewport', () => {
  const renderingEngineId = 'displaySetsChanged3D';
  let viewport;

  /**
   * A render path that mounts any data at once, as the 3D render paths do
   * once their data is loaded.
   */
  const renderPathResolver = {
    resolve: () => ({
      createRenderPath: () => ({
        addData: async () => ({
          rendering: { renderMode: 'vtkGeometry3d' },
          updateAppearance() {},
          applyViewState() {},
          getFrameOfReferenceUID: () => 'for-3d',
          removeData() {},
        }),
      }),
    }),
  };

  beforeEach(() => {
    const renderer = vtkRenderer.newInstance();

    renderingEngineCache.set({
      id: renderingEngineId,
      getRenderer: () => renderer,
      renderViewport() {},
    });

    const element = document.createElement('div');

    document.body.appendChild(element);
    viewport = new VolumeViewport3D({
      id: '3d',
      element,
      renderingEngineId,
      canvas: document.createElement('canvas'),
      sWidth: 64,
      sHeight: 64,
      dataProvider: {
        load: async (displaySetId) => ({ id: displaySetId }),
      },
      renderPathResolver,
    });
  });

  afterEach(() => {
    viewport.destroy();
    renderingEngineCache.delete(renderingEngineId);
    document.body.innerHTML = '';
  });

  it('fires once for each committed setDisplaySets, addDisplaySet and removeDisplaySet, overlays too, with sourceChanged', async () => {
    const events = recordDisplaySetsChanged(viewport);
    const options = { renderMode: 'vtkGeometry3d' };

    await viewport.setDisplaySets(
      { displaySetId: 'surface', options },
      { displaySetId: 'outline', options }
    );
    await viewport.addDisplaySet('marker', { ...options, role: 'overlay' });
    viewport.removeDisplaySet('outline');
    viewport.removeDisplaySet('surface');

    expect(events).toEqual([
      changed(
        [
          ['surface', 'source'],
          ['outline', 'overlay'],
        ],
        { added: ['surface', 'outline'], sourceChanged: true }
      ),
      changed(
        [
          ['surface', 'source'],
          ['outline', 'overlay'],
          ['marker', 'overlay'],
        ],
        { added: ['marker'], sourceChanged: false }
      ),
      changed(
        [
          ['surface', 'source'],
          ['marker', 'overlay'],
        ],
        { removed: ['outline'], sourceChanged: false }
      ),
      changed([['marker', 'source']], {
        removed: ['surface'],
        sourceChanged: true,
      }),
    ]);
  });

  it('mounts the first display set that addDisplaySet gives without a role to an empty viewport as the source, a later one as an overlay', async () => {
    const events = recordDisplaySetsChanged(viewport);

    await viewport.addDisplaySet('surface');
    await viewport.addDisplaySet('marker');
    await viewport.addDisplaySet('surface');

    expect(events).toEqual([
      changed([['surface', 'source']], {
        added: ['surface'],
        sourceChanged: true,
      }),
      changed(
        [
          ['surface', 'source'],
          ['marker', 'overlay'],
        ],
        { added: ['marker'], sourceChanged: false }
      ),
      changed(
        [
          ['surface', 'source'],
          ['marker', 'overlay'],
        ],
        { added: ['surface'], sourceChanged: true }
      ),
    ]);
  });

  it('keeps a mount of overlays only without a source, also when one of them goes', async () => {
    const events = recordDisplaySetsChanged(viewport);

    await viewport.addDisplaySet('surface', { role: 'overlay' });
    await viewport.addDisplaySet('marker');
    viewport.removeDisplaySet('surface');

    expect(events).toEqual([
      changed([['surface', 'overlay']], {
        added: ['surface'],
        sourceChanged: false,
      }),
      changed(
        [
          ['surface', 'overlay'],
          ['marker', 'overlay'],
        ],
        { added: ['marker'], sourceChanged: false }
      ),
      changed([['marker', 'overlay']], {
        removed: ['surface'],
        sourceChanged: false,
      }),
    ]);
  });

  it('gives the display set that becomes the source its own look, and the role source in the appearance events after it', async () => {
    const appearanceEvents = [];

    await viewport.setDisplaySets(
      { displaySetId: 'surface' },
      { displaySetId: 'marker', options: { appearance: { opacity: 0.4 } } }
    );
    viewport.element.addEventListener(
      Events.DISPLAY_SET_APPEARANCE_CHANGED,
      (evt) => appearanceEvents.push(evt.detail)
    );

    viewport.removeDisplaySet('surface');
    viewport.setDisplaySetAppearance({ visible: false });

    expect(
      appearanceEvents.map(({ displaySetId, role, cause, effective }) => ({
        displaySetId,
        role,
        cause,
        effective,
      }))
    ).toEqual([
      {
        displaySetId: 'marker',
        role: 'source',
        cause: 'edit',
        effective: { visible: false, opacity: 0.4 },
      },
    ]);
    expect(viewport.getCurrentMode()).toBe('geometry3d');
  });

  it('keeps the getters on the source that a removal made, also when the volume that was the source comes back as an overlay', async () => {
    const appearanceEvents = [];

    displaySetRegistry.add('volume', { imageIds: ['volume:1'] });
    await viewport.setDisplaySets(
      { displaySetId: 'volume' },
      { displaySetId: 'surface' }
    );
    viewport.removeDisplaySet('volume');
    await viewport.addDisplaySet('volume', { role: 'overlay' });
    viewport.element.addEventListener(
      Events.DISPLAY_SET_APPEARANCE_CHANGED,
      (evt) => appearanceEvents.push(evt.detail)
    );
    viewport.setDisplaySetAppearance({ opacity: 0.5 });
    displaySetRegistry.clear();

    expect(
      viewport
        .getDisplaySets()
        .map(({ displaySetId, options }) => [displaySetId, options.role])
    ).toEqual([
      ['surface', 'source'],
      ['volume', 'overlay'],
    ]);
    expect(
      appearanceEvents.map(({ displaySetId, role }) => [displaySetId, role])
    ).toEqual([['surface', 'source']]);
  });

  it('fires nothing for a setDisplaySets that a newer one supersedes', async () => {
    const events = recordDisplaySetsChanged(viewport);
    const options = { renderMode: 'vtkGeometry3d' };
    const release = holdFirstLoad(viewport);
    const older = viewport.setDisplaySets({ displaySetId: 'older', options });

    await viewport.setDisplaySets({ displaySetId: 'newer', options });
    release();
    await older;

    expect(events).toEqual([
      changed([['newer', 'source']], { added: ['newer'], sourceChanged: true }),
    ]);
    expect(
      viewport.getDisplaySets().map(({ displaySetId }) => displaySetId)
    ).toEqual(['newer']);
  });
});

describe('DISPLAY_SETS_CHANGED and NEW_IMAGE on a video viewport', () => {
  const FPS = 10;
  const FRAMES = 50;
  const VIDEO_ID =
    'wadors:https://server/studies/1/series/2/instances/3/frames/1';

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
  function createVideoViewport() {
    const element = document.createElement('div');

    Object.defineProperty(element, 'clientWidth', { value: 400 });
    Object.defineProperty(element, 'clientHeight', { value: 300 });
    document.body.appendChild(element);

    return new VideoViewport({
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
  }

  /** Mounts a video and gives its element what a loaded video has. */
  async function mountVideo(viewport, displaySetId = VIDEO_ID) {
    const mounted = viewport.setDisplaySets({ displaySetId });

    await settle();

    const video = viewport.element.querySelector('video');

    stubVideoElement(video);
    video.dispatchEvent(new Event('loadedmetadata'));
    await mounted;

    return video;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fires DISPLAY_SETS_CHANGED once for a mount and for a removal, and NEW_IMAGE with the display set and the slice index of the frame', async () => {
    const viewport = createVideoViewport();
    const events = recordDisplaySetsChanged(viewport);
    const newImages = recordNewImage(viewport);
    const video = await mountVideo(viewport);

    video.currentTime = 2;
    video.dispatchEvent(new Event('seeked'));
    viewport.removeDisplaySet(VIDEO_ID);

    expect(events).toEqual([
      changed([[VIDEO_ID, 'source']], {
        added: [VIDEO_ID],
        sourceChanged: true,
      }),
      changed([], { removed: [VIDEO_ID], sourceChanged: true }),
    ]);
    expect(newImages.at(-1)).toEqual({
      viewportId: 'video',
      renderingEngineId: 'renderingEngine',
      displaySetId: VIDEO_ID,
      sliceIndex: 20,
      numberOfSlices: FRAMES,
      imageId: expect.any(String),
      image: undefined,
    });
    viewport.destroy();
  });

  it('makes the second video the source when the first one goes', async () => {
    const viewport = createVideoViewport();
    const mounted = viewport.setDisplaySets(
      { displaySetId: 'first' },
      { displaySetId: 'second' }
    );

    for (const index of [0, 1]) {
      while (viewport.element.querySelectorAll('video').length <= index) {
        await settle();
      }

      const video = viewport.element.querySelectorAll('video')[index];

      stubVideoElement(video);
      video.dispatchEvent(new Event('loadedmetadata'));
    }

    await mounted;

    const events = recordDisplaySetsChanged(viewport);

    viewport.removeDisplaySet('first');

    expect(events).toEqual([
      changed([['second', 'source']], {
        removed: ['first'],
        sourceChanged: true,
      }),
    ]);
    expect(viewport.getCurrentMode()).toBe('video');
    viewport.destroy();
  });

  it('fires nothing for a setDisplaySets that a newer one supersedes', async () => {
    const viewport = createVideoViewport();
    const events = recordDisplaySetsChanged(viewport);
    const release = holdFirstLoad(viewport);
    const older = viewport.setDisplaySets({ displaySetId: 'older' });

    await mountVideo(viewport, 'newer');
    release();
    await older;

    expect(events).toEqual([
      changed([['newer', 'source']], { added: ['newer'], sourceChanged: true }),
    ]);
    expect(
      viewport.getDisplaySets().map(({ displaySetId }) => displaySetId)
    ).toEqual(['newer']);
    viewport.destroy();
  });
});

describe('DISPLAY_SETS_CHANGED on an ECG viewport', () => {
  const ECG_IDS = ['ecg:first', 'ecg:second'];

  /** The ECG module of a short record of two leads, for each test id. */
  function ecgModuleProvider(type, imageId) {
    if (type !== MetadataModules.ECG || !ECG_IDS.includes(imageId)) {
      return;
    }

    return {
      numberOfWaveformChannels: 2,
      numberOfWaveformSamples: 500,
      samplingFrequency: 500,
      channelDefinitionSequence: ['I', 'II'].map((codeMeaning) => ({
        channelSourceSequence: { codeMeaning },
        mvPerUnit: 0.001,
      })),
      waveformData: {
        retrieveBulkData: async () => [
          new Int16Array(500).fill(100),
          new Int16Array(500).fill(-100),
        ],
      },
    };
  }

  /** Makes an ECG viewport on an element with a canvas. */
  function createECGViewport() {
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
      id: 'ecg',
      element,
      renderingEngineId: 'renderingEngine',
    });
  }

  beforeEach(() => {
    metaData.addProvider(ecgModuleProvider, 100000);
  });

  afterEach(() => {
    metaData.removeProvider(ecgModuleProvider);
    document.body.innerHTML = '';
  });

  it('fires once for each committed setDisplaySets and removeDisplaySet, with the waveform as the source', async () => {
    const viewport = createECGViewport();
    const events = recordDisplaySetsChanged(viewport);

    await viewport.setDisplaySets({ displaySetId: ECG_IDS[0] });
    await viewport.setDisplaySets({ displaySetId: ECG_IDS[1] });
    viewport.removeDisplaySet(ECG_IDS[1]);

    expect(events).toEqual([
      changed([[ECG_IDS[0], 'source']], {
        added: [ECG_IDS[0]],
        sourceChanged: true,
      }),
      changed([[ECG_IDS[1], 'source']], {
        added: [ECG_IDS[1]],
        removed: [ECG_IDS[0]],
        sourceChanged: true,
      }),
      changed([], { removed: [ECG_IDS[1]], sourceChanged: true }),
    ]);
    viewport.destroy();
  });

  it('fires nothing for a setDisplaySets that a newer one supersedes', async () => {
    const viewport = createECGViewport();
    const events = recordDisplaySetsChanged(viewport);
    const release = holdFirstLoad(viewport);
    const older = viewport.setDisplaySets({ displaySetId: ECG_IDS[0] });

    await viewport.setDisplaySets({ displaySetId: ECG_IDS[1] });
    release();
    await older;

    expect(events).toEqual([
      changed([[ECG_IDS[1], 'source']], {
        added: [ECG_IDS[1]],
        sourceChanged: true,
      }),
    ]);
    expect(
      viewport.getDisplaySets().map(({ displaySetId }) => displaySetId)
    ).toEqual([ECG_IDS[1]]);
    viewport.destroy();
  });
});

describe('DISPLAY_SETS_CHANGED on a whole slide viewport', () => {
  const mounted = [];

  afterEach(() => {
    mounted.splice(0).forEach(unmountSlide);
    displaySetRegistry.clear();
  });

  it('fires once for a committed setDisplaySets of the slide and once for its removal', async () => {
    const slide = await mountSlide(WSIViewport);

    mounted.push(slide);

    const events = recordDisplaySetsChanged(slide.viewport);

    await remountSlide(slide.viewport);
    slide.viewport.removeDisplaySet(SLIDE_ID);

    expect(events).toEqual([
      changed([[SLIDE_ID, 'source']], {
        added: [SLIDE_ID],
        sourceChanged: true,
      }),
      changed([], { removed: [SLIDE_ID], sourceChanged: true }),
    ]);
  });

  it('makes the second slide the source when the first one goes', async () => {
    const slide = await mountSlide(WSIViewport);

    mounted.push(slide);
    displaySetRegistry.add('secondSlide', {
      imageIds: [SLIDE_ID],
      options: { miniNavigationOverlay: false, webClient: createClient() },
    });
    await withMicroscopyViewer(0, () =>
      slide.viewport.setDisplaySets(
        { displaySetId: SLIDE_ID },
        { displaySetId: 'secondSlide' }
      )
    );

    const events = recordDisplaySetsChanged(slide.viewport);

    slide.viewport.removeDisplaySet(SLIDE_ID);

    expect(events).toEqual([
      changed([['secondSlide', 'source']], {
        removed: [SLIDE_ID],
        sourceChanged: true,
      }),
    ]);
    expect(slide.viewport.getCurrentMode()).toBe('wholeSlide');
  });

  it('fires nothing for a setDisplaySets that a newer one supersedes', async () => {
    const slide = await mountSlide(WSIViewport);

    mounted.push(slide);

    const events = recordDisplaySetsChanged(slide.viewport);
    const release = holdFirstLoad(slide.viewport);
    const older = remountSlide(slide.viewport);

    await remountSlide(slide.viewport);
    release();
    await older;

    expect(events).toEqual([
      changed([[SLIDE_ID, 'source']], {
        added: [SLIDE_ID],
        sourceChanged: true,
      }),
    ]);
  });
});
