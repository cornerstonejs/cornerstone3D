import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { createNextPlanarViewport } from './nextLabelmapScenes';

const { Enums, imageLoader, eventTarget, utilities } = cornerstone3D;
const { Events } = Enums;
const { segmentation, Enums: csToolsEnums } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'stackLabelmapScroll';
const segmentationId = 'stackLabelmapScroll';

/** The slice whose labelmap image holds a square of segment 1. */
const LABELLED_SLICE = 2;

/** The voxels of the square, away from the bar of the fake images. */
const SQUARE = { from: 36, to: 52 };

const BACKENDS = [
  ['on the GPU', { renderBackend: 'gpu' }],
  ['on the CPU', { renderBackend: 'cpu' }],
];

/** Resolves after a few animation frames. */
async function frames(count = 4) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Waits until the draws that a change asked for have come. */
async function settle() {
  await frames();
  await new Promise((resolve) => setTimeout(resolve, 200));
  await frames();
}

/** The ids of five images of 64 by 64 pixels of the fake image loader. */
function createImageIds() {
  return [0, 1, 2, 3, 4].map((sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'stackLabelmapScroll',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );
}

/**
 * Makes the labelmap images of the stack, with the square of segment 1 on
 * `LABELLED_SLICE` only, as the segmentation of the tests.
 */
function addStackSegmentation(imageIds) {
  const labelmapImages =
    imageLoader.createAndCacheDerivedLabelmapImages(imageIds);
  const { voxelManager } = labelmapImages[LABELLED_SLICE];

  for (let j = SQUARE.from; j < SQUARE.to; j++) {
    for (let i = SQUARE.from; i < SQUARE.to; i++) {
      voxelManager.setAtIJK(i, j, 0, 1);
    }
  }

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: { imageIds: labelmapImages.map(({ imageId }) => imageId) },
      },
    },
  ]);

  return labelmapImages.map(({ imageId }) => imageId);
}

/** Adds the labelmap to the viewport and resolves when it is drawn. */
function addLabelmapAndWaitForRender(viewport) {
  const rendered = new Promise((resolve) => {
    eventTarget.addEventListenerOnce(
      csToolsEnums.Events.SEGMENTATION_RENDERED,
      resolve
    );
  });

  segmentation.addLabelmapRepresentationToViewportMap({
    [viewport.id]: [{ segmentationId }],
  });

  return rendered;
}

/**
 * The colour of the canvas of the viewport at the centre of the square. The
 * image is grey there, so a colour that is not grey is the labelmap.
 */
function colourAtSquare(viewport) {
  const { imageData } = viewport.getImageData();
  const centre = (SQUARE.from + SQUARE.to) / 2;
  const [x, y] = viewport.worldToCanvas(
    imageData.indexToWorld([centre, centre, 0])
  );
  const canvas = viewport.getCanvas();
  const scale = canvas.width / canvas.clientWidth;
  const copy = document.createElement('canvas');

  copy.width = canvas.width;
  copy.height = canvas.height;

  const context = copy.getContext('2d');

  context.drawImage(canvas, 0, 0);

  return Array.from(
    context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1)
      .data
  ).slice(0, 3);
}

/** The labelmap actor entries of the viewport. */
function labelmapActors(viewport) {
  return viewport
    .getActors()
    .filter((entry) => entry.reference?.kind === 'segmentation');
}

describe('The labelmap of a stack on a direct next planar viewport, while the stack scrolls -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  for (const [where, options] of BACKENDS) {
    it(`is one display set whose image follows the slice: a scroll fires no DISPLAY_SETS_CHANGED, the getters name the labelmap image of the slice, and the labelmap of each slice is drawn, ${where}`, async function () {
      const viewport = createNextPlanarViewport(
        renderingEngine,
        'stackLabelmapScroll'
      );
      const imageIds = createImageIds();

      await testUtils.setStackOnNextViewport(viewport, imageIds, 0, options);
      await settle();

      const labelmapImageIds = addStackSegmentation(imageIds);

      await addLabelmapAndWaitForRender(viewport);
      await settle();

      const sourceId = viewport.getSourceDisplaySetId();
      const displaySets = viewport.getDisplaySets();
      const events = [];

      expect(displaySets.length).toBe(2);
      expect(displaySets[0].displaySetId).toBe(sourceId);

      const labelmapId = displaySets[1].displaySetId;

      viewport.element.addEventListener(Events.DISPLAY_SETS_CHANGED, (evt) =>
        events.push(evt.detail)
      );

      const colours = [];

      for (let sliceIndex = 1; sliceIndex < imageIds.length; sliceIndex++) {
        await viewport.scroll(1);
        await settle();

        expect(viewport.getCurrentImageId()).toBe(imageIds[sliceIndex]);
        expect(viewport.getDisplaySets()).toEqual(displaySets);
        expect(
          labelmapActors(viewport).map(({ displaySetId, referencedId }) => [
            displaySetId,
            referencedId,
          ])
        ).toEqual([[labelmapId, labelmapImageIds[sliceIndex]]]);
        expect(viewport.getVolumeIds()).toEqual([]);
        expect(viewport.getVolumeIds({ includeSegmentations: true })).toEqual(
          []
        );
        colours.push(colourAtSquare(viewport));
      }

      expect(events).toEqual([]);
      colours.forEach((colour, index) => {
        const tinted = colour[0] !== colour[1] || colour[1] !== colour[2];

        expect(tinted)
          .withContext(`slice ${index + 1}: ${colour}`)
          .toBe(index + 1 === LABELLED_SLICE);
      });

      segmentation.removeLabelmapRepresentation(viewport.id, segmentationId);
      await settle();

      expect(events.map(({ added, removed }) => ({ added, removed }))).toEqual([
        { added: [], removed: [labelmapId] },
      ]);
      expect(
        viewport.getDisplaySets().map(({ displaySetId }) => displaySetId)
      ).toEqual([sourceId]);
    });
  }
});
