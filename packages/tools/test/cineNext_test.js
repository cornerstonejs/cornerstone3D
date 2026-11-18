import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { createNextPlanarViewport } from './nextLabelmapScenes';

const { utilities, volumeLoader } = cornerstone3D;
const { playClip, stopClip } = csTools3d.utilities.cine;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'cineNext';

/** Waits until the condition holds, for at most two seconds. */
async function waitFor(condition) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Plays a clip on the viewport at 30 frames in a second until it shows
 * another slice, and stops it.
 * @returns The slice index before the clip and after it.
 */
async function playUntilAnotherSlice(viewport) {
  const before = viewport.getSliceIndex();

  playClip(viewport.element, { framesPerSecond: 30 });
  await waitFor(() => viewport.getSliceIndex() !== before);
  stopClip(viewport.element);

  return [before, viewport.getSliceIndex()];
}

describe('Cine playback on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('scrolls the slices of a volume, in volume mode', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);
    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 64,
      columns: 64,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
    await testUtils.setVolumesOnNextViewport(viewport, [volumeId]);
    expect(viewport.getCurrentMode()).toBe('volume');

    const [before, after] = await playUntilAnotherSlice(viewport);

    expect(after).toBeGreaterThan(before);
  });

  it('scrolls the images of a stack, in stack mode', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);
    const imageIds = [0, 1, 2, 3, 4].map((sliceIndex) =>
      testUtils.encodeImageIdInfo({
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 10,
        barWidth: 5,
        xSpacing: 1,
        ySpacing: 1,
        sliceIndex,
      })
    );

    await testUtils.setStackOnNextViewport(viewport, imageIds, 0);
    expect(viewport.getCurrentMode()).toBe('stack');

    const [before, after] = await playUntilAnotherSlice(viewport);

    expect(before).toBe(0);
    expect(after).toBeGreaterThan(before);
  });
});
