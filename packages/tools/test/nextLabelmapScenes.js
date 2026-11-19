import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, imageLoader, cache, eventTarget } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const { segmentation, Enums: csToolsEnums } = csTools3d;

/**
 * Makes a direct next planar viewport of 400 by 400 pixels.
 * @param {object} renderingEngine - The rendering engine of the test
 * @param {string} viewportId - The id of the new viewport
 * @param {string} orientation - The orientation of the viewport options
 * @returns The viewport. It shows nothing yet.
 */
function createNextPlanarViewport(
  renderingEngine,
  viewportId,
  orientation = OrientationAxis.AXIAL
) {
  testUtils.createViewports(renderingEngine, {
    viewportType: ViewportType.PLANAR,
    orientation,
    viewportId,
  });

  return renderingEngine.getViewport(viewportId);
}

/**
 * Adds the labelmap of a segmentation to a viewport and resolves when it is
 * drawn there for the first time.
 */
function addLabelmapAndWaitForRender(viewport, segmentationId) {
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
 * Shows a volume of 64 by 64 voxels of 1 mm and 10 slices on a direct next
 * planar viewport, with an empty labelmap volume of the same grid as the
 * active segmentation.
 * @returns The id of the volume, and the voxel manager and the image data of
 * the labelmap.
 */
async function showVolumeWithLabelmap(viewport, segmentationId) {
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
  await addLabelmapAndWaitForRender(viewport, segmentationId);

  const { voxelManager, imageData } = cache.getVolume(segmentationId);

  return { volumeId, voxelManager, imageData };
}

/**
 * Shows a stack of three images of 64 by 64 pixels of 1 mm on a direct next
 * planar viewport, at the middle image, with an empty labelmap image for each
 * as the active segmentation.
 * @returns The ids of the images, the voxel manager of the labelmap of the
 * image shown, and the image data of that image.
 */
async function showStackWithLabelmap(viewport, segmentationId) {
  const imageIds = [0, 1, 2].map((sliceIndex) =>
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

  await testUtils.setStackOnNextViewport(viewport, imageIds, 1);

  const labelmapImages =
    imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: { imageIds: labelmapImages.map(({ imageId }) => imageId) },
      },
    },
  ]);
  await addLabelmapAndWaitForRender(viewport, segmentationId);

  return {
    imageIds,
    voxelManager: labelmapImages[1].voxelManager,
    imageData: viewport.getImageData().imageData,
  };
}

/** The index of the voxel that a canvas point of the viewport shows. */
function canvasToIndex(viewport, imageData, canvasPoint) {
  return imageData
    .worldToIndex(viewport.canvasToWorld(canvasPoint))
    .map(Math.round);
}

export {
  createNextPlanarViewport,
  showVolumeWithLabelmap,
  showStackWithLabelmap,
  canvasToIndex,
};
