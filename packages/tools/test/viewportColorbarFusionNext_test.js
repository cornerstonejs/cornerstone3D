import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  waitFor,
} from '../../core/test/utils/planarSeriesBothModes';

const { cache, eventTarget, utilities, Enums } = cornerstone3D;
const { Events, OrientationAxis } = Enums;
const { ViewportColorbar } = csTools3d.utilities.voi.colorbar;

const renderingEngineId = utilities.uuidv4();

/** The display sets of the fusion, whose ids are not the volume ids. */
const CT_DISPLAY_SET_ID = 'colorbarFusion:ct';
const PT_DISPLAY_SET_ID = 'colorbarFusion:pt';

/** The largest pixel value that the images of the PT series say they hold. */
const PT_MAX_PIXEL_VALUE = 100;

/**
 * Shows a fusion on a direct next planar viewport: a CT volume as the source
 * and a PT volume as an overlay, each registered under a display set id that
 * is not its volume id, as an application registers a display set of its own.
 * The images of the PT series say that their pixel values end at 100, so the
 * two volumes have different image ranges. Gives the two series.
 */
async function showFusion(viewport) {
  const ct = await createSeries({ id: 'colorbarFusionCT' });
  const pt = await createSeries({ id: 'colorbarFusionPT' });

  pt.imageIds.forEach((imageId) => {
    cache.getImage(imageId).maxPixelValue = PT_MAX_PIXEL_VALUE;
  });
  cornerstone3D.displaySetRegistry.add(CT_DISPLAY_SET_ID, {
    imageIds: ct.imageIds,
    volumeId: ct.volumeId,
  });
  cornerstone3D.displaySetRegistry.add(PT_DISPLAY_SET_ID, {
    imageIds: pt.imageIds,
    volumeId: pt.volumeId,
  });
  await viewport.setDisplaySets(
    {
      displaySetId: CT_DISPLAY_SET_ID,
      options: { orientation: OrientationAxis.ACQUISITION, mode: 'volume' },
    },
    {
      displaySetId: PT_DISPLAY_SET_ID,
      options: {
        orientation: OrientationAxis.ACQUISITION,
        role: 'overlay',
        mode: 'volume',
      },
    }
  );
  await renderAndWait(viewport);
  await viewport.setImageIdIndex(2);
  await renderAndWait(viewport);

  return { ct, pt };
}

/**
 * Adds a colorbar for the data of the viewport that `volumeId` names, a
 * volume id or a display set id, and gives it with its container.
 */
function addColorbar(viewport, volumeId) {
  const container = document.createElement('div');

  container.style.width = '20px';
  container.style.height = '200px';
  document.body.appendChild(container);

  const colorbar = new ViewportColorbar({
    id: `colorbar:${volumeId}`,
    element: viewport.element,
    container,
    volumeId,
    colormaps: [
      { Name: 'Grayscale', RGBPoints: [0, 0, 0, 0, 1, 1, 1, 1] },
      { Name: 'hsv', RGBPoints: [0, 1, 0, 0, 0.5, 0, 1, 0, 1, 0, 0, 1] },
    ],
    activeColormapName: 'Grayscale',
  });

  return { colorbar, container };
}

/** Resolves at the next event of a name on an element. */
function nextEvent(element, eventName) {
  return new Promise((resolve) => {
    element.addEventListener(eventName, resolve, { once: true });
  });
}

describe('The colorbar of an overlay of a fusion on a direct next planar viewport, whose display set id is not its volume id -- ', () => {
  let renderingEngine;
  const added = [];

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    added.splice(0).forEach(({ colorbar, container }) => {
      colorbar.destroy();
      container.remove();
    });
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    cornerstone3D.displaySetRegistry.clear();
  });

  /** Adds a colorbar that the test removes after it. */
  function colorbarOf(viewport, volumeId) {
    const made = addColorbar(viewport, volumeId);

    added.push(made);

    return made.colorbar;
  }

  for (const [name, idOf] of [
    ['its volume id', (pt) => pt.volumeId],
    ['its display set id', () => PT_DISPLAY_SET_ID],
  ]) {
    it(`sets the window of the overlay when it is named by ${name}`, async function () {
      const viewport = createNextViewport(renderingEngine, 'colorbarFusion');
      const { pt } = await showFusion(viewport);
      const ctWindow =
        viewport.getDisplaySetAppearance(CT_DISPLAY_SET_ID)?.voiRange;
      const colorbar = colorbarOf(viewport, idOf(pt));

      colorbar.voiRange = { lower: 10, upper: 90 };

      expect(
        viewport.getDisplaySetAppearance(PT_DISPLAY_SET_ID).voiRange
      ).toEqual({ lower: 10, upper: 90 });
      expect(
        viewport.getDisplaySetAppearance(CT_DISPLAY_SET_ID)?.voiRange
      ).toEqual(ctWindow);
    });

    it(`follows the window, the colormap and the image volume of the overlay when it is named by ${name}`, async function () {
      const viewport = createNextViewport(renderingEngine, 'colorbarFusion');
      const { pt } = await showFusion(viewport);
      const colorbar = colorbarOf(viewport, idOf(pt));

      viewport.setDisplaySetAppearance(PT_DISPLAY_SET_ID, {
        voiRange: { lower: 20, upper: 80 },
      });

      expect(colorbar.voiRange).toEqual({ lower: 20, upper: 80 });

      viewport.setDisplaySetAppearance(CT_DISPLAY_SET_ID, {
        voiRange: { lower: 30, upper: 70 },
      });

      expect(colorbar.voiRange).toEqual({ lower: 20, upper: 80 });

      viewport.setDisplaySetAppearance(PT_DISPLAY_SET_ID, {
        colormap: { name: 'hsv' },
      });

      expect(colorbar.activeColormapName).toBe('hsv');

      colorbar.imageRange = { lower: -5, upper: 5 };
      utilities.triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, {
        volumeId: pt.volumeId,
      });

      expect(colorbar.imageRange).toEqual({
        lower: 0,
        upper: PT_MAX_PIXEL_VALUE,
      });
    });

    it(`keeps the image range of the overlay on a scroll when it is named by ${name}`, async function () {
      const viewport = createNextViewport(renderingEngine, 'colorbarFusion');
      const { pt } = await showFusion(viewport);
      const colorbar = colorbarOf(viewport, idOf(pt));
      const rangeOfMount = colorbar.imageRange;
      const newImage = nextEvent(viewport.element, Events.NEW_IMAGE);

      await viewport.scroll(1);
      await newImage;
      await waitFor(() => viewport.getCurrentImageIdIndex() === 3);

      expect(rangeOfMount).toEqual({ lower: 0, upper: PT_MAX_PIXEL_VALUE });
      expect(colorbar.imageRange).toEqual(rangeOfMount);
    });
  }
});
