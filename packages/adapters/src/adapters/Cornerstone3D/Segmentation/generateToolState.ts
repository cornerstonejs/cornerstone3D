import { generateToolState as generateToolStateCornerstoneLegacy } from '../../Cornerstone/Segmentation';
import { createLabelmapsFromBufferInternal } from './labelmapImagesFromBuffer';

/**
 * generateToolState - Given a set of cornerstoneTools imageIds and a Segmentation buffer,
 * derive cornerstoneTools toolState and brush metadata.
 *
 * @param   imageIds - An array of the imageIds.
 * @param   arrayBuffer - The SEG arrayBuffer.
 * @param   skipOverlapping - skip checks for overlapping segs, default value false.
 * @param   tolerance - default value 1.e-3.
 *
 * @returns a list of array buffer for each labelMap
 *  an object from which the segment metadata can be derived
 *  list containing the track of segments per frame
 *  list containing the track of segments per frame for each labelMap (available only for the overlapping case).
 */
function generateToolState(
  imageIds,
  arrayBuffer,
  metadataProvider,
  skipOverlapping = false,
  tolerance = 1e-3,
  cs3dVersion = 4
) {
  return generateToolStateCornerstoneLegacy(
    imageIds,
    arrayBuffer,
    metadataProvider,
    skipOverlapping,
    tolerance,
    cs3dVersion
  );
}

/**
 * Creates a segmentation tool state from a set of image IDs and a SEG instance loaded via its imageId.
 * The naturalized SEG dataset must be available from metadataProvider.get('instance', segImageId)
 * (e.g. dataset or instanceMeta.dataset). Uncompressed pixel data is obtained via imageLoader.loadImage(segImageId).
 *
 * @param referencedImageIds - An array of referenced image IDs e.g., CT, MR etc.
 * @param segImageId - Image ID for the SEG instance (loadable via imageLoader; instance metadata must be registered).
 * @param options - { metadataProvider, tolerance }
 *
 * @returns An object containing:
 *          - `labelMapImages`: Array of label map images for each label map.
 *          - `segMetadata`: Metadata related to the segmentation segments.
 *          - `segmentsOnFrame`: 2D array tracking segments per frame.
 *          - `centroids`: Map of centroid coordinates for each segment.
 *          - `overlappingSegments`: Boolean indicating if segments are overlapping.
 *
 * @throws Will throw an error if instance metadata is missing or if the loaded image has no getPixelData().
 */
function createFromDICOMSegBuffer(
  referencedImageIds,
  segImageId,
  {
    metadataProvider,
    tolerance = 1e-3,
    parserType = 'bitmap',
    decodeImageData,
    allowLegacyDatasetDecode = false,
  }
) {
  return createLabelmapsFromBufferInternal(
    referencedImageIds,
    segImageId,
    metadataProvider,
    {
      tolerance,
      parserType,
      decodeImageData,
      allowLegacyDatasetDecode,
    }
  );
}

export { generateToolState, createFromDICOMSegBuffer };
