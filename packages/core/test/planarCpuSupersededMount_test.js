import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, cache, imageLoader } = cornerstone3D;
const { Events, OrientationAxis, InterpolationType } = Enums;

const renderingEngineId = utilities.uuidv4();

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Counts the IMAGE_RENDERED events of a viewport from now on. */
function countRendered(viewport) {
  const counter = { count: 0 };

  viewport.element.addEventListener(Events.IMAGE_RENDERED, () => {
    counter.count++;
  });

  return counter;
}

/**
 * Makes the fake image loader wait, for each image id of `stalls`, until the
 * promise of that image id resolves.
 */
function registerStallingLoader(stalls) {
  imageLoader.registerImageLoader('fakeImageLoader', (imageId, options) =>
    stalls.has(imageId)
      ? {
          promise: stalls
            .get(imageId)
            .then(() => testUtils.fakeImageLoader(imageId, options).promise),
        }
      : testUtils.fakeImageLoader(imageId, options)
  );
}

/**
 * Makes a series whose first image is not in the cache and whose load waits
 * in `stalls` until the test releases it. Gives the series and the release.
 */
async function createStalledSeries(id, stalls) {
  const series = await createSeries({ id });
  const stalledImageId = series.imageIds[0];
  let release;

  stalls.set(
    stalledImageId,
    new Promise((resolve) => {
      release = resolve;
    })
  );
  cache.removeVolumeLoadObject(series.volumeId);

  if (cache.getImageLoadObject(stalledImageId)) {
    cache.removeImageLoadObject(stalledImageId);
  }

  return { series, release: () => release() };
}

/** Registers a series as a stack display set, shown from image 0. */
function addStack(displaySetId, series) {
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: series.imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });
}

/**
 * Mounts a stack display set on the CPU, with the nearest interpolation. With
 * the default one the CPU path draws the image once more about 100 ms after
 * the view comes to rest, finer, on the grid of the screen. That draw is not
 * one of the mounts that the tests count, and whether it fell inside the
 * frames that a test waits depended on how fast the frames came.
 */
function mountCpu(viewport, displaySetId) {
  viewport.setDisplaySetPresentation(displaySetId, {
    interpolationType: InterpolationType.NEAREST,
  });

  return viewport.setDisplaySets({
    displaySetId,
    options: {
      orientation: OrientationAxis.ACQUISITION,
      renderBackend: 'cpu',
    },
  });
}

describe('A mount of a direct next planar viewport on the CPU that a newer mount replaced -- ', () => {
  let renderingEngine;
  let stalls;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    stalls = new Map();
    registerStallingLoader(stalls);
  });

  afterEach(function () {
    stalls.clear();
    utilities.genericViewportDisplaySetMetadataProvider.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('does not keep the newer mount of a cached stack from drawing while its image never loads', async function () {
    const cached = await createSeries({ id: 'supersededCached' });
    const stalled = await createStalledSeries('supersededStalled', stalls);
    const viewport = createNextViewport(renderingEngine, 'supersededMount');
    const rendered = countRendered(viewport);

    addStack('supersededStalledStack', stalled.series);
    addStack('supersededCachedStack', cached);

    mountCpu(viewport, 'supersededStalledStack');
    await frames();
    await mountCpu(viewport, 'supersededCachedStack');
    await frames();

    expect(viewport.getImageIds()).toEqual(cached.imageIds);
    expect(rendered.count).toBe(1);
  });

  it('draws the newer mount once, and its late end neither draws nor frees the hold of a later mount', async function () {
    const cached = await createSeries({ id: 'lateCached' });
    const first = await createStalledSeries('lateFirst', stalls);
    const third = await createStalledSeries('lateThird', stalls);
    const viewport = createNextViewport(renderingEngine, 'lateMount');
    const rendered = countRendered(viewport);

    addStack('lateFirstStack', first.series);
    addStack('lateCachedStack', cached);
    addStack('lateThirdStack', third.series);

    const firstMount = mountCpu(viewport, 'lateFirstStack');

    await frames();
    await mountCpu(viewport, 'lateCachedStack');
    await frames();

    expect(rendered.count).toBe(1);

    const thirdMount = mountCpu(viewport, 'lateThirdStack');

    await frames();
    viewport.render();
    first.release();
    await firstMount;
    await frames();

    expect(rendered.count).toBe(1);

    third.release();
    await thirdMount;
    await frames();

    expect(viewport.getImageIds()).toEqual(third.series.imageIds);
    expect(rendered.count).toBe(2);
  });
});
