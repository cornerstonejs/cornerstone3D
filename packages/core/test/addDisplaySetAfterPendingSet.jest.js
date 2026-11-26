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
  unmount as unmountSlide,
  withMicroscopyViewer,
} from './utils/wsiStandIn';

const { setRenderBackend, Enums, imageLoader, metaData, init, cache } =
  cornerstone3D;
const { Events, MetadataModules } = Enums;

/**
 * Row 291 of `v6-open-issues.md`: the calls of `setDisplaySets` and
 * `addDisplaySet` of a viewport take effect in call order, on every family.
 * An `addDisplaySet` made while a `setDisplaySets` loads waits for it and
 * adds to its result; a later `setDisplaySets` ends both, and both end with
 * nothing bound and no event.
 */

/** The display sets of each DISPLAY_SETS_CHANGED, and the call that it added. */
function recordChanges(viewport) {
  const changes = [];

  viewport.element.addEventListener(Events.DISPLAY_SETS_CHANGED, (evt) =>
    changes.push({
      added: evt.detail.added,
      displaySets: evt.detail.displaySets.map(
        ({ displaySetId }) => displaySetId
      ),
    })
  );

  return changes;
}

function shownIds(viewport) {
  return viewport.getDisplaySets().map(({ displaySetId }) => displaySetId);
}

/**
 * Holds the first load of the data provider of a viewport, once it loaded,
 * until the function it gives is called.
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

async function settle() {
  for (let turn = 0; turn < 5; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Gives 'pending' when the promise has not settled after a few turns. */
async function outcomeOf(promise) {
  let outcome = 'pending';

  promise.then(
    () => (outcome = 'resolved'),
    (error) => (outcome = error)
  );
  await settle();

  return outcome;
}

/**
 * The two cases of the rule on one family. `mount` gives the viewport;
 * `run(viewport, calls)` makes the calls and lets their data come, and gives
 * when every call has settled.
 */
function describeCallOrder(family, { create, cleanup, run }) {
  describe(`setDisplaySets then addDisplaySet on a ${family} viewport`, () => {
    afterEach(async () => {
      await cleanup?.();
    });

    it('an addDisplaySet made while a setDisplaySets loads waits for it and adds to its result', async () => {
      const { viewport, ids } = await create();
      const changes = recordChanges(viewport);
      const release = holdFirstLoad(viewport);

      await run(viewport, async () => {
        const set = viewport.setDisplaySets({ displaySetId: ids[0] });
        const add = viewport.addDisplaySet(ids[1], { role: 'overlay' });

        expect(await outcomeOf(add)).toBe('pending');
        expect(shownIds(viewport)).toEqual([]);

        release();

        return [set, add];
      });

      expect(shownIds(viewport)).toEqual([ids[0], ids[1]]);
      expect(changes).toEqual([
        { added: [ids[0]], displaySets: [ids[0]] },
        { added: [ids[1]], displaySets: [ids[0], ids[1]] },
      ]);
    });

    it('a later setDisplaySets ends both, and neither binds or fires', async () => {
      const { viewport, ids } = await create();
      const changes = recordChanges(viewport);
      const release = holdFirstLoad(viewport);

      await run(viewport, async () => {
        const set = viewport.setDisplaySets({ displaySetId: ids[0] });
        const add = viewport.addDisplaySet(ids[1], { role: 'overlay' });

        await settle();

        const newer = viewport.setDisplaySets({ displaySetId: ids[2] });

        expect(await outcomeOf(add)).toBe('resolved');
        release();

        return [set, add, newer];
      });

      expect(shownIds(viewport)).toEqual([ids[2]]);
      expect(changes).toEqual([{ added: [ids[2]], displaySets: [ids[2]] }]);
    });
  });
}

/** Waits for each call of `calls`, and gives each video that appears its data. */
async function runWithVideos(viewport, calls) {
  const loaded = new WeakSet();
  const promises = await calls();
  let settled = false;
  const all = Promise.allSettled(promises).then((results) => {
    settled = true;
    return results;
  });

  while (!settled) {
    viewport.element.querySelectorAll('video').forEach((video) => {
      if (loaded.has(video)) {
        return;
      }

      loaded.add(video);
      Object.defineProperty(video, 'videoWidth', { value: 200 });
      Object.defineProperty(video, 'videoHeight', { value: 100 });
      Object.defineProperty(video, 'duration', { value: 5 });
      Object.defineProperty(video, 'readyState', { value: 4 });
      Object.defineProperty(video, 'currentTime', {
        value: 0,
        writable: true,
      });
      Object.defineProperty(video, 'paused', { get: () => true });
      video.play = jest.fn(() => Promise.resolve());
      video.pause = jest.fn();
      video.dispatchEvent(new Event('loadedmetadata'));
    });
    await settle();
  }

  (await all).forEach((result) => {
    if (result.status === 'rejected') {
      throw result.reason;
    }
  });
}

async function runAll(_viewport, calls) {
  const results = await Promise.allSettled(await calls());

  results.forEach((result) => {
    if (result.status === 'rejected') {
      throw result.reason;
    }
  });
}

const planarEngines = [];

describeCallOrder('planar', {
  create: async () => {
    window.devicePixelRatio = 1;
    init({});
    setRenderBackend('cpu');
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);

    const element = document.createElement('div');

    document.body.appendChild(element);
    ['offsetWidth', 'clientWidth', 'offsetHeight', 'clientHeight'].forEach(
      (key) => Object.defineProperty(element, key, { value: 64 })
    );
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ width: 64, height: 64 }),
    });

    const ids = ['first', 'second', 'third'];

    ids.forEach((name) =>
      displaySetRegistry.add(name, {
        imageIds: [0, 1].map(
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
              })
            )}`
        ),
      })
    );

    const made = createPlanarViewportOnStandInEngine(element, 'planar');

    planarEngines.push(made.renderingEngine);

    return { viewport: made.viewport, ids };
  },
  cleanup: () => {
    planarEngines.splice(0).forEach((engine) => engine.destroy());
    cache.purgeCache();
    displaySetRegistry.clear();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    setRenderBackend('auto');
    document.body.innerHTML = '';
  },
  run: runAll,
});

const viewports3D = [];

describeCallOrder('3D', {
  create: async () => {
    const renderingEngineId = 'callOrder3D';
    const renderer = vtkRenderer.newInstance();

    renderingEngineCache.set({
      id: renderingEngineId,
      getRenderer: () => renderer,
      renderViewport() {},
    });

    const element = document.createElement('div');

    document.body.appendChild(element);

    const viewport = new VolumeViewport3D({
      id: '3d',
      element,
      renderingEngineId,
      canvas: document.createElement('canvas'),
      sWidth: 64,
      sHeight: 64,
      dataProvider: {
        load: async (displaySetId) => ({ id: displaySetId }),
      },
      renderPathResolver: {
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
      },
    });

    viewport.resolveRenderMode = () => 'vtkGeometry3d';
    viewports3D.push({ viewport, renderingEngineId });

    return { viewport, ids: ['surface', 'marker', 'outline'] };
  },
  cleanup: () => {
    viewports3D.splice(0).forEach(({ viewport, renderingEngineId }) => {
      viewport.destroy();
      renderingEngineCache.delete(renderingEngineId);
    });
    document.body.innerHTML = '';
  },
  run: runAll,
});

const videoViewports = [];

describeCallOrder('video', {
  create: async () => {
    const element = document.createElement('div');

    Object.defineProperty(element, 'clientWidth', { value: 400 });
    Object.defineProperty(element, 'clientHeight', { value: 300 });
    document.body.appendChild(element);

    const viewport = new VideoViewport({
      id: 'video',
      element,
      renderingEngineId: 'renderingEngine',
      dataProvider: {
        load: async (id) => ({
          id,
          type: 'video',
          renderedUrl: `https://server/${id}.mp4`,
          fps: 10,
          numberOfFrames: 50,
          frameRange: [1, 50],
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

    videoViewports.push(viewport);

    return { viewport, ids: ['first', 'second', 'third'] };
  },
  cleanup: () => {
    videoViewports.splice(0).forEach((viewport) => viewport.destroy());
    document.body.innerHTML = '';
  },
  run: runWithVideos,
});

const wsiMounts = [];

describeCallOrder('whole slide', {
  create: async () => {
    const slide = await mountSlide(WSIViewport);

    wsiMounts.push(slide);
    ['secondSlide', 'thirdSlide'].forEach((id) =>
      displaySetRegistry.add(id, {
        imageIds: [SLIDE_ID],
        options: { miniNavigationOverlay: false, webClient: createClient() },
      })
    );
    slide.viewport.removeDisplaySet(SLIDE_ID);

    return {
      viewport: slide.viewport,
      ids: [SLIDE_ID, 'secondSlide', 'thirdSlide'],
    };
  },
  cleanup: () => {
    wsiMounts.splice(0).forEach(unmountSlide);
    displaySetRegistry.clear();
  },
  run: (viewport, calls) =>
    withMicroscopyViewer(0, () => runAll(viewport, calls)),
});

describe('setDisplaySets then addDisplaySet on an ECG viewport', () => {
  const ECG_IDS = ['ecg:first', 'ecg:second'];

  function ecgModuleProvider(type, imageId) {
    if (type !== MetadataModules.ECG || !ECG_IDS.includes(imageId)) {
      return;
    }

    return {
      numberOfWaveformChannels: 1,
      numberOfWaveformSamples: 500,
      samplingFrequency: 500,
      channelDefinitionSequence: [
        { channelSourceSequence: { codeMeaning: 'I' }, mvPerUnit: 0.001 },
      ],
      waveformData: {
        retrieveBulkData: async () => [new Int16Array(500).fill(100)],
      },
    };
  }

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

  it('refuses the add of a second waveform with its message once the setDisplaySets has settled', async () => {
    const viewport = createECGViewport();
    const changes = recordChanges(viewport);
    const release = holdFirstLoad(viewport);
    const set = viewport.setDisplaySets({ displaySetId: ECG_IDS[0] });
    const add = viewport.addDisplaySet(ECG_IDS[1]);

    expect(await outcomeOf(add)).toBe('pending');

    release();
    await set;
    await expect(add).rejects.toThrow(/one waveform/i);

    expect(shownIds(viewport)).toEqual([ECG_IDS[0]]);
    expect(changes).toEqual([
      { added: [ECG_IDS[0]], displaySets: [ECG_IDS[0]] },
    ]);
    viewport.destroy();
  });

  it('a later setDisplaySets ends both, and neither binds or fires', async () => {
    const viewport = createECGViewport();
    const changes = recordChanges(viewport);
    const release = holdFirstLoad(viewport);
    const set = viewport.setDisplaySets({ displaySetId: ECG_IDS[0] });
    const add = viewport.addDisplaySet(ECG_IDS[1]);

    await settle();

    const newer = viewport.setDisplaySets({ displaySetId: ECG_IDS[1] });

    expect(await outcomeOf(add)).toBe('resolved');
    release();
    await Promise.all([set, newer]);

    expect(shownIds(viewport)).toEqual([ECG_IDS[1]]);
    expect(changes).toEqual([
      { added: [ECG_IDS[1]], displaySets: [ECG_IDS[1]] },
    ]);
    viewport.destroy();
  });
});
