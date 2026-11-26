import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import BaseViewport from '../src/RenderingEngine/Viewports/BaseViewport';
import ViewportType from '../src/enums/ViewportType';
import Events from '../src/enums/Events';
import { MetadataModules } from '../src/enums';
import * as metaData from '../src/metaData';
import ECGViewport from '../src/RenderingEngine/Viewports/ECG/ECGViewport';

/** A concrete BaseViewport with the hooks that a mount needs. */
class TestViewport extends BaseViewport {
  constructor({ id, element, dataProvider, renderPathResolver }) {
    super({ id, element });

    this.type = ViewportType.PLANAR;
    this.renderingEngineId = 'engine-1';
    this.dataProvider = dataProvider;
    this.renderPathResolver = renderPathResolver;
    this.renderContext = { viewportId: id, type: 'planar' };
    this.viewState = {};
  }

  render() {}

  getResolvedView() {
    return undefined;
  }

  normalizeViewState(viewState) {
    return viewState;
  }
}

function createAttachment() {
  return {
    rendering: { renderMode: 'fake' },
    removeData: jest.fn(),
    applyViewState: jest.fn(),
    updateAppearance: jest.fn(),
    getFrameOfReferenceUID: () => '1.2.3',
    render: jest.fn(),
    resize: jest.fn(),
  };
}

/**
 * A render path whose data of a display set comes when the test opens its
 * gate, and that stops when the signal of its mount aborts, as the video
 * path stops its wait for a video.
 */
function createGatedRenderPaths() {
  const gates = new Map();
  const added = [];
  const gateOf = (displaySetId) => {
    if (!gates.has(displaySetId)) {
      let open;
      const promise = new Promise((resolve) => {
        open = resolve;
      });

      gates.set(displaySetId, { promise, open });
    }

    return gates.get(displaySetId);
  };
  const addData = (ctx, data, options, signal) =>
    new Promise((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')), {
        once: true,
      });
      gateOf(data.id).promise.then(() => {
        added.push(data.id);
        resolve(createAttachment());
      });
    });

  return {
    open: (displaySetId) => gateOf(displaySetId).open(),
    added,
    resolver: {
      resolve: () => ({ createRenderPath: () => ({ addData }) }),
    },
  };
}

function createViewport(paths) {
  const element = document.createElement('div');

  element.setAttribute('data-viewport-uid', 'vp-1');
  element.setAttribute('data-rendering-engine-uid', 'engine-1');

  const viewport = new TestViewport({
    id: 'vp-1',
    element,
    dataProvider: {
      load: async (displaySetId) => ({ id: displaySetId, type: 'image' }),
    },
    renderPathResolver: paths.resolver,
  });
  const changes = [];

  element.addEventListener(Events.DISPLAY_SETS_CHANGED, (evt) =>
    changes.push(evt.detail.added)
  );

  return { viewport, changes };
}

/** Gives 'pending' when the promise has not settled after the microtasks. */
async function outcomeOf(promise) {
  let outcome = 'pending';

  promise.then(
    () => (outcome = 'resolved'),
    (error) => (outcome = error)
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  return outcome;
}

const options = { renderMode: 'fake' };

describe('A pending addDisplaySet of a viewport', () => {
  it('ends at once when a setDisplaySets starts: it binds nothing and fires nothing', async () => {
    const paths = createGatedRenderPaths();
    const { viewport, changes } = createViewport(paths);
    const pending = viewport.addDisplaySet('ds-add', options);

    expect(await outcomeOf(pending)).toBe('pending');

    const newer = viewport.setDisplaySets({ displaySetId: 'ds-set', options });

    expect(await outcomeOf(pending)).toBe('resolved');

    paths.open('ds-add');
    paths.open('ds-set');
    await newer;

    expect(
      viewport.getDisplaySets().map(({ displaySetId }) => displaySetId)
    ).toEqual(['ds-set']);
    expect(changes).toEqual([['ds-set']]);
  });

  it('ends at once when the viewport is destroyed, as a pending setDisplaySets does', async () => {
    const paths = createGatedRenderPaths();
    const { viewport, changes } = createViewport(paths);
    const set = viewport.setDisplaySets({ displaySetId: 'ds-set', options });
    const add = viewport.addDisplaySet('ds-add', options);

    expect(await outcomeOf(set)).toBe('pending');
    expect(await outcomeOf(add)).toBe('pending');

    viewport.destroy();

    expect(await outcomeOf(set)).toBe('resolved');
    expect(await outcomeOf(add)).toBe('resolved');
    expect(changes).toEqual([]);
  });

  it('mounts after an addDisplaySet that started before it, in call order, also when its own data comes first', async () => {
    const paths = createGatedRenderPaths();
    const { viewport, changes } = createViewport(paths);
    const first = viewport.addDisplaySet('ds-1', options);
    const second = viewport.addDisplaySet('ds-2', options);

    paths.open('ds-2');
    expect(await outcomeOf(second)).toBe('pending');

    paths.open('ds-1');
    await Promise.all([first, second]);

    expect(paths.added).toEqual(['ds-1', 'ds-2']);
    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: 'ds-1', options: { role: 'source' } },
      { displaySetId: 'ds-2', options: { role: 'overlay' } },
    ]);
    expect(changes).toEqual([['ds-1'], ['ds-2']]);
  });
});

const ECG_IDS = ['ecg:raceFirst', 'ecg:raceSecond'];
const SAMPLES = 500;

/** The ECG module of two records whose samples come when the test says. */
function createEcgProvider() {
  const gates = new Map();

  ECG_IDS.forEach((id) => {
    let open;
    const promise = new Promise((resolve) => {
      open = resolve;
    });

    gates.set(id, { promise, open });
  });

  const provider = (type, imageId) => {
    if (type !== MetadataModules.ECG || !gates.has(imageId)) {
      return;
    }

    return {
      numberOfWaveformChannels: 1,
      numberOfWaveformSamples: SAMPLES,
      samplingFrequency: 500,
      channelDefinitionSequence: [
        { channelSourceSequence: { codeMeaning: 'I' }, mvPerUnit: 0.001 },
      ],
      waveformData: {
        retrieveBulkData: () =>
          gates.get(imageId).promise.then(() => [new Int16Array(SAMPLES)]),
      },
    };
  };

  return { provider, open: (id) => gates.get(id).open() };
}

function createEcgElement() {
  const element = document.createElement('div');
  const viewportElement = document.createElement('div');
  const canvas = document.createElement('canvas');

  viewportElement.classList.add('viewport-element');
  canvas.classList.add('cornerstone-canvas');
  [element, canvas].forEach((node) => {
    Object.defineProperty(node, 'clientWidth', { value: 400 });
    Object.defineProperty(node, 'clientHeight', { value: 300 });
  });
  viewportElement.appendChild(canvas);
  element.appendChild(viewportElement);
  document.body.appendChild(element);

  return element;
}

describe('Two addDisplaySet calls that race on an ECG viewport', () => {
  let ecg;
  let element;

  beforeEach(() => {
    ecg = createEcgProvider();
    metaData.addProvider(ecg.provider, 100000);
    element = createEcgElement();
  });

  afterEach(() => {
    metaData.removeProvider(ecg.provider);
    element.remove();
  });

  it('mount the first waveform and refuse the second with the one waveform message', async () => {
    const viewport = new ECGViewport({
      id: 'ecgRace',
      element,
      renderingEngineId: 'renderingEngine',
    });
    const first = viewport.addDisplaySet(ECG_IDS[0]);
    const second = viewport.addDisplaySet(ECG_IDS[1]);

    ecg.open(ECG_IDS[1]);
    ecg.open(ECG_IDS[0]);

    await first;
    await expect(second).rejects.toThrow(/one waveform/i);
    expect(
      viewport.getDisplaySets().map(({ displaySetId }) => displaySetId)
    ).toEqual([ECG_IDS[0]]);
  });
});
