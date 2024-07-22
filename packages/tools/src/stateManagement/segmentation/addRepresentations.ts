import {
  SegmentationRepresentationConfig,
  RepresentationPublicInput,
} from '../../types/SegmentationStateTypes';

import { addRepresentation } from './addRepresentation';

/**
 * Set the specified segmentation representations on the viewports of the specified
 *
 * @param viewportIds - The viewportIds to add the segmentation representations to
 * @param representationInputArray - An array of segmentation representations to add to the toolGroup
 * @param segmentationRepresentationConfig - Configuration for the segmentation representations
 */
async function addRepresentations(
  viewportId: string,
  representationInputArray: RepresentationPublicInput[],
  segmentationRepresentationConfig?: SegmentationRepresentationConfig
): Promise<string[]> {
  const promises = representationInputArray.map((representationInput) => {
    return addRepresentation(
      viewportId,
      representationInput,
      segmentationRepresentationConfig
    );
  });

  const segmentationRepresentationUIDs = await Promise.all(promises);

  return segmentationRepresentationUIDs;
}

export default addRepresentations;
