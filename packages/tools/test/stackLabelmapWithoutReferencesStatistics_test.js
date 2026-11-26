import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  encodeImageIdInfo,
  createViewports,
  setupTestEnvironment,
  cleanupTestEnvironment,
} from '../../../utils/test/testUtils';

const { Enums, imageLoader, metaData, cache } = cornerstone3D;
const { ViewportType } = Enums;
const {
  segmentation,
  Enums: csToolsEnums,
  utilities: toolsUtilities,
} = csTools3d;

const renderingEngineId = 'renderingEngine-stackLabelmapWithoutReferences';
const toolGroupId = 'toolGroup-stackLabelmapWithoutReferences';
const viewportId = 'STACK_WITHOUT_REFERENCES';
const SIZE = 16;

/** The image ids of a stack of two images with a bar of 255 at x 4 to 7. */
function stackImageIds() {
  return [0, 1].map((sliceIndex) =>
    encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'withoutReferences',
      rows: SIZE,
      columns: SIZE,
      barStart: 4,
      barWidth: 4,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );
}

/**
 * Makes a labelmap image for each stack image with `createAndCacheLocalImage`
 * and no `referencedImageId`, on the plane of its stack image, as an
 * application does that knows the geometry and not the image.
 */
function createLabelmapImages(imageIds, name) {
  return imageIds.map((imageId, index) => {
    const plane = metaData.get('imagePlaneModule', imageId);

    return imageLoader.createAndCacheLocalImage(`${name}:${index}`, {
      dimensions: [plane.columns, plane.rows],
      spacing: [plane.columnPixelSpacing, plane.rowPixelSpacing],
      origin: plane.imagePositionPatient,
      direction: [...plane.rowCosines, ...plane.columnCosines],
      frameOfReferenceUID: plane.frameOfReferenceUID,
      scalarData: new Uint8Array(plane.columns * plane.rows),
    });
  });
}

/** Mounts the stack and a labelmap of local images over it. */
async function mountStackWithLabelmap(renderingEngine, segmentationId, name) {
  createViewports(renderingEngine, {
    viewportType: ViewportType.PLANAR,
    viewportId,
    width: 128,
    height: 128,
  });

  const viewport = renderingEngine.getViewport(viewportId);
  const imageIds = stackImageIds();

  await testUtils.setStackOnNextViewport(viewport, imageIds, 0);
  await Promise.all(
    imageIds.map((imageId) => imageLoader.loadAndCacheImage(imageId))
  );

  const labelmapImages = createLabelmapImages(imageIds, name);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: { imageIds: labelmapImages.map(({ imageId }) => imageId) },
      },
    },
  ]);
  segmentation.addSegmentationRepresentations(viewportId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  return { viewport, imageIds, labelmapImages };
}

/** Settles a promise with its value or its error, or gives 'pending'. */
function outcomeOf(promise, ms) {
  return Promise.race([
    promise.then(
      (value) => ({ value }),
      (error) => ({ error })
    ),
    new Promise((resolve) => setTimeout(() => resolve('pending'), ms)),
  ]);
}

describe('getStatistics of a stack labelmap whose images reference no image -- ', () => {
  let renderingEngine;

  beforeEach(() => {
    renderingEngine = setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      viewportIds: [viewportId],
    }).renderingEngine;
  });

  afterEach(() => {
    segmentation.removeAllSegmentations?.();
    cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      cleanupDOMElements: true,
    });
  });

  it('gives the statistics of a segment over the stack images on the planes of the labelmap images', async function () {
    const segmentationId = 'withoutReferences-statistics';
    const { labelmapImages } = await mountStackWithLabelmap(
      renderingEngine,
      segmentationId,
      'withoutReferencesLabelmap'
    );
    const labelmap = labelmapImages[1].voxelManager;

    for (let j = 2; j < 6; j++) {
      for (let i = 3; i < 7; i++) {
        labelmap.setAtIJK(i, j, 0, 1);
      }
    }

    const outcome = await outcomeOf(
      toolsUtilities.segmentation.getStatistics({
        segmentationId,
        segmentIndices: 1,
      }),
      8000
    );

    expect(outcome.error).toBeUndefined();

    const stats = outcome.value;

    expect(stats.count.value).toBe(16);
    expect(stats.max.value).toBe(255);
    expect(stats.min.value).toBe(0);
    expect(stats.mean.value).toBeCloseTo((12 * 255) / 16, 6);
  }, 20000);

  it('says that a labelmap image needs an image on its plane when no stack image of the viewports is there', async function () {
    const segmentationId = 'withoutReferences-otherPlane';
    const { labelmapImages } = await mountStackWithLabelmap(
      renderingEngine,
      segmentationId,
      'withoutReferencesOtherPlane'
    );
    const moved = imageLoader.createAndCacheLocalImage(
      'withoutReferencesOtherPlane:moved',
      {
        dimensions: [SIZE, SIZE],
        spacing: [1, 1],
        origin: [0, 0, 50],
        direction: [1, 0, 0, 0, 1, 0],
        scalarData: new Uint8Array(SIZE * SIZE),
      }
    );

    moved.voxelManager.setAtIJK(5, 5, 0, 1);
    segmentation.state.getSegmentation(
      segmentationId
    ).representationData.Labelmap.imageIds = [
      labelmapImages[0].imageId,
      moved.imageId,
    ];

    const outcome = await outcomeOf(
      toolsUtilities.segmentation.getStatistics({
        segmentationId,
        segmentIndices: 1,
      }),
      8000
    );

    expect(outcome).not.toBe('pending');
    expect(String(outcome.error?.message)).toContain(moved.imageId);
    expect(String(outcome.error?.message)).toContain('plane');
    expect(cache.getImage(moved.imageId)).toBeDefined();
  }, 20000);
});
