import {
  SegmentationRepresentationConfig,
  RepresentationPublicInput,
} from '../../types/SegmentationStateTypes';

import { addSegmentationRepresentation } from './addSegmentationRepresentation';

/**
 * Set the specified segmentation representations on the viewports of the specified
 *
 * @param viewportIds - The viewportIds to add the segmentation representations to
 * @param representationInputArray - An array of segmentation representations to add to the toolGroup
 * @param segmentationRepresentationConfig - Configuration for the segmentation representations
 */
async function addSegmentationRepresentations(
  viewportId: string,
  representationInputArray: RepresentationPublicInput[],
  segmentationRepresentationConfig?: SegmentationRepresentationConfig
): Promise<string[]> {
  const promises = representationInputArray.map((representationInput) => {
    return addSegmentationRepresentation(
      viewportId,
      representationInput,
      segmentationRepresentationConfig
    );
  });

  const segmentationRepresentationUIDs = await Promise.all(promises);

  return segmentationRepresentationUIDs;
}

export default addSegmentationRepresentations;
