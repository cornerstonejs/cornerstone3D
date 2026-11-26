import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  waitFor,
} from '../../../utils/test/testUtilsVideo';

const { Enums, utilities, metaData } = cornerstone3D;
const { ViewportType } = Enums;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'videoSupersededMount';

/** The image id of a video whose server never answers. */
const STUCK_IMAGE_ID =
  'wadors:https://stuck.video/studies/1/series/2/instances/3/frames/1';

/**
 * Registers the video metadata of `STUCK_IMAGE_ID` with a rendered URL of a
 * media source that never gets data: the video element neither fires
 * `loadedmetadata` nor `error`, as with a server that holds the connection
 * open, and the media source closes only when the element lets it go.
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

  metaData.addProvider((type, id) => {
    if (typeof id !== 'string' || !id.startsWith(base)) {
      return;
    }

    return modules[type];
  }, 20000);

  return { mediaSource, url };
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

describe('A video mount that a newer setDisplaySets supersedes while its server never answers -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('resolves at once, removes its video element and lets the browser drop its request', async function () {
    addTestVideoMetadata();

    const { mediaSource } = addStuckVideoMetadata();

    testUtils.createViewports(renderingEngine, {
      width: 400,
      height: 300,
      useEnableElement: true,
      orientation: null,
      viewportId,
      viewportType: ViewportType.VIDEO,
    });

    const viewport = renderingEngine.getViewport(viewportId);
    const stuck = viewport.setDisplaySets({ displaySetId: STUCK_IMAGE_ID });

    await waitFor(() => mediaSource.readyState === 'open', 5000);

    const stuckVideo = viewport.element.querySelector('video');

    expect(await outcomeOf(stuck, 300)).toBe('pending');

    const sourceClosed = new Promise((resolve) =>
      mediaSource.addEventListener('sourceclose', resolve, { once: true })
    );
    const newer = viewport.setDisplaySets({
      displaySetId: TEST_VIDEO.imageId,
    });

    expect(await outcomeOf(stuck, 100)).toBe('resolved');
    expect(stuckVideo.isConnected).toBe(false);
    expect(stuckVideo.hasAttribute('src')).toBe(false);
    expect(await outcomeOf(sourceClosed, 2000)).toBe('resolved');
    expect(mediaSource.readyState).toBe('closed');

    await newer;

    const videos = Array.from(viewport.element.querySelectorAll('video'));

    expect(videos.length).toBe(1);
    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: TEST_VIDEO.imageId, options: { role: 'source' } },
    ]);
  }, 30000);
});
