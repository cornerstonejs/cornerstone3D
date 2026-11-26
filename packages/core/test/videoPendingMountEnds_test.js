import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  waitFor,
} from '../../../utils/test/testUtilsVideo';

const { Enums, utilities, metaData } = cornerstone3D;
const { ViewportType, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'videoPendingMountEnds';

/** The image id of a video whose server never answers. */
const STUCK_IMAGE_ID =
  'wadors:https://stuck.video/studies/1/series/2/instances/4/frames/1';

/**
 * Registers the video metadata of `STUCK_IMAGE_ID` with a rendered URL of a
 * media source that never gets data, so the video element neither fires
 * `loadedmetadata` nor `error`, as with a server that holds the connection
 * open.
 */
function addStuckVideoMetadata() {
  const mediaSource = new MediaSource();
  const url = URL.createObjectURL(mediaSource);
  const base = STUCK_IMAGE_ID.replace(/\/frames\/\d+$/, '');
  const modules = {
    imageUrlModule: { rendered: url },
    generalSeriesModule: { modality: 'XC', Modality: 'XC' },
    cineModule: { cineRate: 10, numberOfFrames: 20 },
    instance: { NumberOfFrames: 20 },
    imagePlaneModule: {
      rows: 48,
      columns: 64,
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imagePositionPatient: [0, 0, 0],
    },
  };
  const provider = (type, id) => {
    if (typeof id !== 'string' || !id.startsWith(base)) {
      return;
    }

    return modules[type];
  };

  metaData.addProvider(provider, 20000);

  return { mediaSource, provider };
}

/** Settles a promise or gives `'pending'` after `ms`. */
function outcomeOf(promise, ms) {
  return Promise.race([
    promise.then(
      () => 'resolved',
      (error) => error
    ),
    new Promise((resolve) => setTimeout(() => resolve('pending'), ms)),
  ]);
}

describe('A video mount that waits for a video whose server never answers -- ', () => {
  let renderingEngine;
  let stuck;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    addTestVideoMetadata();
    stuck = addStuckVideoMetadata();
    testUtils.createViewports(renderingEngine, {
      width: 400,
      height: 300,
      useEnableElement: true,
      orientation: null,
      viewportId,
      viewportType: ViewportType.VIDEO,
    });
  });

  afterEach(function () {
    metaData.removeProvider(stuck.provider);
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('ends at once when the element is disabled, and lets the browser drop the request of its video', async function () {
    const viewport = renderingEngine.getViewport(viewportId);
    const pending = viewport.setDisplaySets({ displaySetId: STUCK_IMAGE_ID });

    await waitFor(() => stuck.mediaSource.readyState === 'open', 5000);

    const video = viewport.element.querySelector('video');
    const sourceClosed = new Promise((resolve) =>
      stuck.mediaSource.addEventListener('sourceclose', resolve, {
        once: true,
      })
    );

    expect(await outcomeOf(pending, 300)).toBe('pending');

    renderingEngine.disableElement(viewportId);

    expect(await outcomeOf(pending, 100)).toBe('resolved');
    expect(video.isConnected).toBe(false);
    expect(await outcomeOf(sourceClosed, 2000)).toBe('resolved');
  }, 30000);

  it('ends a pending addDisplaySet at once when a setDisplaySets starts: the add binds nothing and fires nothing', async function () {
    const viewport = renderingEngine.getViewport(viewportId);
    const added = [];

    viewport.element.addEventListener(Events.DISPLAY_SETS_CHANGED, (evt) =>
      added.push(evt.detail.added)
    );

    const pendingAdd = viewport.addDisplaySet(STUCK_IMAGE_ID);

    await waitFor(() => stuck.mediaSource.readyState === 'open', 5000);
    expect(await outcomeOf(pendingAdd, 300)).toBe('pending');

    const newer = viewport.setDisplaySets({
      displaySetId: TEST_VIDEO.imageId,
    });

    expect(await outcomeOf(pendingAdd, 100)).toBe('resolved');

    await newer;

    expect(viewport.element.querySelectorAll('video').length).toBe(1);
    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: TEST_VIDEO.imageId, options: { role: 'source' } },
    ]);
    expect(added).toEqual([[TEST_VIDEO.imageId]]);
  }, 30000);
});
