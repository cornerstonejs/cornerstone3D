import { generateToolState as generateToolStateCornerstoneLegacy } from '../../Cornerstone/Segmentation';
import {
  createLabelmapsFromDICOMBuffer,
  createLabelmapsFromSegImageIds,
} from './labelmapImagesFromBuffer';

/**
 * generateToolState - Given a set of cornerstoneTools imageIds and a Segmentation buffer,
 * derive cornerstoneTools toolState and brush metadata.
 *
 * Legacy API: parses the Part 10 buffer and decodes pixels from dataset PixelData,
 * then delegates to createLabelmapsFromSegImageIds with synthetic frame imageIds.
 */
function generateToolState(
  imageIds,
  arrayBuffer,
  metadataProvider,
  skipOverlapping = false,
  tolerance = 1e-3,
  cs3dVersion = 4
) {
  if (cs3dVersion !== 4) {
    return generateToolStateCornerstoneLegacy(
      imageIds,
      arrayBuffer,
      metadataProvider,
      skipOverlapping,
      tolerance,
      cs3dVersion
    );
  }

  return createLabelmapsFromDICOMBuffer(
    imageIds,
    arrayBuffer,
    metadataProvider,
    {
      tolerance,
      parserType: 'bitmap',
    }
  );
}

/**
 * Creates labelmap images from a SEG instance via per-frame imageIds (OHIF / imageLoader path).
 *
 * @param referencedImageIds - Referenced CT/MR imageIds
 * @param segImageId - SEG instance imageId for metadata (base or frame-qualified)
 * @param options.metadataProvider - Required metadata provider
 * @param options.frameImageIds - Per-frame loadable SEG imageIds
 * @param options.getFrameImageId - Optional (baseSegImageId, frameNumber) => frame imageId
 * @param options.decodeImageData - Optional (frameImageId, frameNumber) => pixel data; defaults to imageLoader
 *
 * Pixel encoding uses only the provided frame imageIds and decoder (no dataset PixelData shortcut).
 */
function createFromDICOMSegBuffer(
  referencedImageIds,
  segImageId,
  {
    metadataProvider,
    tolerance = 1e-3,
    parserType = 'bitmap',
    frameImageIds = undefined,
    getFrameImageId = undefined,
    decodeImageData = undefined,
  }
) {
  return createLabelmapsFromSegImageIds(
    referencedImageIds,
    segImageId,
    metadataProvider,
    {
      tolerance,
      parserType,
      frameImageIds,
      getFrameImageId,
      decodeImageData,
    }
  );
}

export {
  generateToolState,
  createFromDICOMSegBuffer,
  createLabelmapsFromSegImageIds,
  createLabelmapsFromDICOMBuffer,
};
