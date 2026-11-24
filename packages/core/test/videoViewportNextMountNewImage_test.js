import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  animationFrames,
  waitFor,
} from '../../../utils/test/testUtilsVideo';

const { Enums, utilities } = cornerstone3D;
const { ViewportType, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * What the legacy video viewport of commit 58914567b fired at a mount with
 * `setVideo`: its new image event, STACK_NEW_IMAGE, once for each draw of the
 * frame, and it drew the frame twice at a mount (the seek of the mount, then
 * the seek of its first render), so twice, on the first frame (time 0) and
 * with the frame number 5 (time 0.4). A direct next viewport fires its new
 * image event, NEW_IMAGE, once for each frame that it shows.
 */
const LEGACY_MOUNT_EVENTS = {
  firstFrame: { count: 2, frameIndex: 0 },
  frameFive: { count: 2, frameIndex: 4 },
};

/** Makes a direct next video viewport. */
function createViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    width: 320,
    height: 200,
    useEnableElement: true,
    orientation: null,
    viewportId: 'nextVideoMount',
    viewportType: ViewportType.VIDEO,
  });

  return renderingEngine.getViewport('nextVideoMount');
}

/** Records NEW_IMAGE and STACK_NEW_IMAGE of an element from now on. */
function recordNewImageEvents(element) {
  const events = { newImage: [], stack: [] };

  element.addEventListener(Events.NEW_IMAGE, (evt) => {
    events.newImage.push(evt.detail);
  });
  element.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', (evt) => {
    events.stack.push(evt.detail);
  });

  return events;
}

/** Mounts the test video and waits until it shows its frame, at rest. */
async function mount(viewport, options) {
  await viewport.setDisplaySets({
    displaySetId: TEST_VIDEO.imageId,
    ...(options ? { options } : {}),
  });

  const element = viewport.element.querySelector('video');

  await waitFor(() => element.readyState >= 2 && !element.seeking);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await animationFrames(3);
}

/** Expects one NEW_IMAGE for a frame, with the detail of a new frame. */
function expectOneNewImage(viewport, events, frameIndex) {
  expect(events.newImage.length).toBe(1);
  expect(events.newImage[0]).toEqual({
    viewportId: 'nextVideoMount',
    renderingEngineId,
    displaySetId: TEST_VIDEO.imageId,
    sliceIndex: frameIndex,
    numberOfSlices: TEST_VIDEO.numberOfFrames,
    imageId: viewport.getImageIds()[frameIndex],
    image: undefined,
  });
  expect(events.stack).toEqual([]);
}

describe('The new image event of a direct next video viewport at a mount -- ', () => {
  let renderingEngine;
  let videoUrl;
  let viewport;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    videoUrl = addTestVideoMetadata();
    viewport = createViewport(renderingEngine);
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    URL.revokeObjectURL(videoUrl);
  });

  it('fires NEW_IMAGE once for the first frame at a mount, where the legacy viewport fired its new image event', async function () {
    const events = recordNewImageEvents(viewport.element);

    await mount(viewport);

    expect(LEGACY_MOUNT_EVENTS.firstFrame.count).toBeGreaterThan(0);
    expectOneNewImage(
      viewport,
      events,
      LEGACY_MOUNT_EVENTS.firstFrame.frameIndex
    );
  });

  it('fires NEW_IMAGE once for the first frame at a mount with the frame number 1', async function () {
    const events = recordNewImageEvents(viewport.element);

    await mount(viewport, { frameNumber: 1 });

    expectOneNewImage(
      viewport,
      events,
      LEGACY_MOUNT_EVENTS.firstFrame.frameIndex
    );
  });

  it('fires NEW_IMAGE once for the frame of the frame number of a mount', async function () {
    const events = recordNewImageEvents(viewport.element);

    await mount(viewport, { frameNumber: 5 });

    expectOneNewImage(
      viewport,
      events,
      LEGACY_MOUNT_EVENTS.frameFive.frameIndex
    );
  });

  it('fires NEW_IMAGE again at the next mount', async function () {
    await mount(viewport);

    const events = recordNewImageEvents(viewport.element);

    await mount(viewport);

    expectOneNewImage(
      viewport,
      events,
      LEGACY_MOUNT_EVENTS.firstFrame.frameIndex
    );
  });
});
