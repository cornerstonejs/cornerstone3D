import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, cache, imageLoader } = cornerstone3D;
const { Events, OrientationAxis, InterpolationType } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * What the legacy stack viewport of commit 58914567b fired on the CPU for one
 * scroll of the series of `createSeries` (`setImageIdIndex` or
 * `utilities.scroll`), with the default and with the nearest interpolation:
 * one IMAGE_RENDERED, a few milliseconds after the call, with the new image.
 * It drew no picture of the image shown before and no finer picture at rest.
 */
const LEGACY_IMAGE_RENDERED_PER_SCROLL = 1;

/** Longer than the wait of the work at rest before the finer draw. */
const REST_MS = 800;

/** Resolves after the given number of milliseconds. */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** The picture of the canvas that a CPU path draws on. */
function cpuPictureOf(viewport) {
  const canvases = Array.from(viewport.element.querySelectorAll('canvas'));
  const shown = canvases.find((canvas) => canvas.style.display !== 'none');

  return shown.toDataURL();
}

/**
 * Records the IMAGE_RENDERED events of a viewport from now on, each with the
 * picture of the canvas at that moment.
 */
function recordRendered(viewport) {
  const pictures = [];

  viewport.element.addEventListener(Events.IMAGE_RENDERED, () => {
    pictures.push(cpuPictureOf(viewport));
  });

  return pictures;
}

/**
 * Mounts the series as a stack on the CPU at image 0 and waits for the rest.
 * `beforeMount` gets the series before the mount.
 */
async function mountCpuStack(
  renderingEngine,
  id,
  { interpolationType, beforeMount } = {}
) {
  const series = await createSeries({ id });

  beforeMount?.(series);

  const viewport = createNextViewport(renderingEngine, 'cpuScroll');

  cornerstone3D.displaySetRegistry.add(`${id}Stack`, {
    imageIds: series.imageIds,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({
    displaySetId: `${id}Stack`,
    options: {
      orientation: OrientationAxis.ACQUISITION,
      renderBackend: 'cpu',
    },
  });

  if (interpolationType !== undefined) {
    viewport.setDisplaySetPresentation({ interpolationType });
  }

  await wait(REST_MS);

  return viewport;
}

describe('IMAGE_RENDERED of a scroll of a direct next planar viewport that draws a stack on the CPU -- ', () => {
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

  it('fires it once with the new image for setImageIdIndex, as the legacy CPU stack viewport, and once more for the finer draw at rest', async function () {
    const viewport = await mountCpuStack(renderingEngine, 'cpuScrollIndex');
    const before = cpuPictureOf(viewport);
    const rendered = recordRendered(viewport);

    await viewport.setImageIdIndex(2);
    await frames();

    expect(viewport.getCurrentImageIdIndex()).toBe(2);
    expect(rendered.length).toBe(LEGACY_IMAGE_RENDERED_PER_SCROLL);
    expect(rendered[0]).not.toBe(before);

    await wait(REST_MS);

    expect(rendered.length).toBe(LEGACY_IMAGE_RENDERED_PER_SCROLL + 1);
    expect(rendered[1]).not.toBe(rendered[0]);
  });

  it('fires it once with the new image for utilities.scroll, as the legacy CPU stack viewport, and once more for the finer draw at rest', async function () {
    const viewport = await mountCpuStack(renderingEngine, 'cpuScrollUtility');
    const before = cpuPictureOf(viewport);
    const rendered = recordRendered(viewport);

    utilities.scroll(viewport, { delta: 1 });
    await wait(100);

    expect(viewport.getCurrentImageIdIndex()).toBe(1);
    expect(rendered.length).toBe(LEGACY_IMAGE_RENDERED_PER_SCROLL);
    expect(rendered[0]).not.toBe(before);

    await wait(REST_MS);

    expect(rendered.length).toBe(LEGACY_IMAGE_RENDERED_PER_SCROLL + 1);
  });

  it('fires it once with the new image for a scroll with the nearest interpolation, as the legacy CPU stack viewport, and no more at rest', async function () {
    const viewport = await mountCpuStack(renderingEngine, 'cpuScrollNearest', {
      interpolationType: InterpolationType.NEAREST,
    });
    const before = cpuPictureOf(viewport);
    const rendered = recordRendered(viewport);

    utilities.scroll(viewport, { delta: 1 });
    await wait(100 + REST_MS);

    expect(viewport.getCurrentImageIdIndex()).toBe(1);
    expect(rendered.length).toBe(LEGACY_IMAGE_RENDERED_PER_SCROLL);
    expect(rendered[0]).not.toBe(before);
  });

  it('draws once with the image shown before when the image of a scroll fails to load, and holds no later draw', async function () {
    let failingImageId;
    const viewport = await mountCpuStack(renderingEngine, 'cpuScrollFailed', {
      beforeMount: (series) => {
        failingImageId = series.imageIds[2];
        cache.removeVolumeLoadObject(series.volumeId);

        if (cache.getImageLoadObject(failingImageId)) {
          cache.removeImageLoadObject(failingImageId);
        }

        imageLoader.registerImageLoader(
          'fakeImageLoader',
          (imageId, options) =>
            imageId === failingImageId
              ? { promise: Promise.reject(new Error('The image is not there')) }
              : testUtils.fakeImageLoader(imageId, options)
        );
      },
    });

    const before = cpuPictureOf(viewport);
    const rendered = recordRendered(viewport);

    await viewport.setImageIdIndex(2);
    await wait(100);

    expect(rendered.length).toBe(1);
    expect(rendered[0]).toBe(before);

    viewport.render();

    expect(rendered.length).toBe(2);
  });
});
