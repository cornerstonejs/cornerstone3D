import { generateToolState as generateToolStateCornerstoneLegacy } from "../../Cornerstone/Segmentation";
import { createLabelmapsFromBufferInternal } from "./labelmapImagesFromBuffer";
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
 * Creates a segmentation tool state from a set of image IDs and a segmentation buffer.
 *
 * @param referencedImageIds - An array of referenced image IDs e.g., CT, MR etc.
 * @param arrayBuffer - The DICOM SEG array buffer containing segmentation data.
 * @param metadataProvider - The metadata provider to retrieve necessary metadata.
 * @param options - Optional parameters to customize the segmentation processing.
 *
 * @returns An object containing:
 *          - `labelMapImages`: Array of label map images for each label map.
 *          - `segMetadata`: Metadata related to the segmentation segments.
 *          - `segmentsOnFrame`: 2D array tracking segments per frame.
 *          - `segmentsOnFrameArray`: 3D array tracking segments per frame for each label map.
 *          - `centroids`: Map of centroid coordinates for each segment.
 *          - `overlappingSegments`: Boolean indicating if segments are overlapping.
 *
 * @throws Will throw an error if unsupported transfer syntax is encountered or if segmentation frames are out of plane.
 */
function createFromDICOMSegBuffer(
    referencedImageIds,
    arrayBuffer,
    { metadataProvider, tolerance = 1e-3 }
) {
    return createLabelmapsFromBufferInternal(
        referencedImageIds,
        arrayBuffer,
        metadataProvider,
        {
            tolerance
        }
    );
}

export { generateToolState, createFromDICOMSegBuffer };
