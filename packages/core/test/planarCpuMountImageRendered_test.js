import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { Events, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * What the legacy stack viewport of commit 58914567b fired on the CPU for one
 * `setStack` of the series of `createSeries`, at its image 0 and at its image
 * 3: one IMAGE_RENDERED, a few milliseconds after the call. It drew once in
 * the frame of the rendering engine, however often the mount asked for a
 * render, and it drew no finer picture at rest.
 */
const LEGACY_IMAGE_RENDERED_PER_MOUNT = 1;

/** Longer than the wait of the work at rest before the finer draw. */
const REST_MS = 800;

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

/** The picture of the canvas that a CPU path draws on. */
function cpuPictureOf(viewport) {
  const canvases = Array.from(viewport.element.querySelectorAll('canvas'));
  const shown = canvases.find((canvas) => canvas.style.display !== 'none');

  return shown.toDataURL();
}

describe('IMAGE_RENDERED of a direct next planar viewport that draws a stack on the CPU -- ', () => {
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

  for (const firstIndex of [0, 3]) {
    it(`fires it once for the mount at image ${firstIndex}, as the legacy CPU stack viewport, and once more for the finer draw at rest`, async function () {
      const series = await createSeries({ id: `cpuMount${firstIndex}` });
      const viewport = createNextViewport(renderingEngine, 'cpuMount');
      const rendered = countRendered(viewport);

      cornerstone3D.displaySetRegistry.add('cpuMountStack', {
        imageIds: series.imageIds,
        initialImageIdIndex: firstIndex,
      });
      await viewport.setDisplaySets({
        displaySetId: 'cpuMountStack',
        options: {
          orientation: OrientationAxis.ACQUISITION,
          renderBackend: 'cpu',
        },
      });
      await frames();

      expect(rendered.count).toBe(LEGACY_IMAGE_RENDERED_PER_MOUNT);
      expect(viewport.getCurrentImageIdIndex()).toBe(firstIndex);

      const mountPicture = cpuPictureOf(viewport);

      await new Promise((resolve) => setTimeout(resolve, REST_MS));

      expect(rendered.count).toBe(LEGACY_IMAGE_RENDERED_PER_MOUNT + 1);
      expect(cpuPictureOf(viewport)).not.toBe(mountPicture);
    });
  }
});
