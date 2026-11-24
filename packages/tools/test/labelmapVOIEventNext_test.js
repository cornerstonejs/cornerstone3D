import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { createNextPlanarViewport } from './nextLabelmapScenes';

const { Enums, volumeLoader, imageLoader, eventTarget, utilities, cache } =
  cornerstone3D;
const { Events } = Enums;
const { segmentation, Enums: csToolsEnums } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'labelmapVOIEventNext';
const segmentationId = 'labelmapVOIEventNext';

/** The window that the tests set on the source, to tell its events. */
const SOURCE_RANGE = { lower: 10, upper: 90 };

const BACKENDS = [
  ['on the GPU', {}],
  ['on the CPU', { renderBackend: 'cpu' }],
];

/** Resolves after a few animation frames. */
async function frames(count = 4) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * Waits until the draws that a change asked for have come, the draw of a
 * CPU path at rest too.
 */
async function settle() {
  await frames();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await frames();
}

/** The details of the VOI_MODIFIED events of a viewport from now on. */
function recordVOIEvents(viewport) {
  const details = [];

  viewport.element.addEventListener(Events.VOI_MODIFIED, (evt) => {
    details.push({ range: evt.detail.range, volumeId: evt.detail.volumeId });
  });

  return details;
}

/**
 * Adds the labelmap of the segmentation to a viewport and resolves when it
 * is drawn there for the first time.
 */
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

/** The ids of three images of 64 by 64 pixels of the fake image loader. */
function createImageIds() {
  return [0, 1, 2].map((sliceIndex) =>
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
}

/**
 * Makes the labelmap images of a stack as the segmentation of the tests.
 * With `filled` each has a square of segment 1, as a loaded SEG has voxels.
 */
function addStackSegmentation(imageIds, filled) {
  const labelmapImages =
    imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  if (filled) {
    labelmapImages.forEach(({ voxelManager }) => {
      for (let j = 20; j < 30; j++) {
        for (let i = 20; i < 30; i++) {
          voxelManager.setAtIJK(i, j, 0, 1);
        }
      }
    });
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
}

describe('VOI_MODIFIED of a direct next planar viewport with a labelmap -- ', () => {
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
    for (const [labelmapName, filled] of [
      ['a new labelmap', false],
      ['a labelmap with voxels, as a SEG', true],
    ]) {
      it(`does not fire for ${labelmapName} that is added to a stack, nor when a scroll shows its next image, ${where}`, async function () {
        const viewport = createNextPlanarViewport(renderingEngine, 'stackVOI');
        const imageIds = createImageIds();

        await testUtils.setStackOnNextViewport(viewport, imageIds, 1, options);
        await settle();

        const details = recordVOIEvents(viewport);

        addStackSegmentation(imageIds, filled);
        await addLabelmapAndWaitForRender(viewport);
        await settle();
        viewport.setViewState({
          slice: { kind: 'stackIndex', imageIdIndex: 2 },
        });
        await settle();

        expect(viewport.getCurrentImageId()).toBe(imageIds[2]);
        expect(viewport.getDisplaySets().length).toBeGreaterThan(1);
        expect(details).toEqual([]);

        viewport.setDisplaySetPresentation(viewport.getSourceDisplaySetId(), {
          voiRange: { ...SOURCE_RANGE },
        });
        await settle();

        expect(details).toEqual([{ range: SOURCE_RANGE, volumeId: undefined }]);
      });
    }

    it(`does not fire for a labelmap that is added to a volume, nor on a scroll, ${where}`, async function () {
      const viewport = createNextPlanarViewport(renderingEngine, 'volumeVOI');
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
      await testUtils.setVolumesOnNextViewport(viewport, [volumeId], options);
      await settle();

      const details = recordVOIEvents(viewport);

      volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
        volumeId: segmentationId,
      });
      segmentation.addSegmentations([
        {
          segmentationId,
          representation: {
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
            data: { volumeId: segmentationId },
          },
        },
      ]);
      await addLabelmapAndWaitForRender(viewport);
      await settle();
      await viewport.scroll(2);
      await settle();

      expect(cache.getVolume(segmentationId)).toBeDefined();
      expect(viewport.getDisplaySets().length).toBeGreaterThan(1);
      expect(details).toEqual([]);

      viewport.setDisplaySetPresentation(viewport.getSourceDisplaySetId(), {
        voiRange: { ...SOURCE_RANGE },
      });
      await settle();

      expect(details).toEqual([{ range: SOURCE_RANGE, volumeId }]);
    });
  }
});
