import type {
  RepresentationPublicInput,
  RepresentationConfig,
} from '../../types/SegmentationStateTypes';

import { internalAddSegmentationRepresentation } from './internalAddSegmentationRepresentation';

/**
 * Set the specified segmentation representations on multiple viewports
 *
 * @param viewportIds - The viewportIds to add the segmentation representations to
 * @param representationInputArray - An array of segmentation representations to add to each viewport
 */
async function addSegmentationRepresentations(
  viewportIds: string[],
  representationInputArray: RepresentationPublicInput[]
): Promise<{ [viewportId: string]: string[] }> {
  const results = {};

  for (const viewportId of viewportIds) {
    const promises = representationInputArray.map((representationInput) => {
      return internalAddSegmentationRepresentation(
        viewportId,
        representationInput
      );
    });

    const uids = await Promise.all(promises);
    results[viewportId] = uids;
  }

  return results;
}

/**
 * Set specific segmentation representations for each viewport
 *
 * @param viewportInputMap - A map of viewportIds to their respective representation input arrays
 */
async function addSegmentationRepresentationsMap(viewportInputMap: {
  [viewportId: string]: RepresentationPublicInput[];
}): Promise<{ [viewportId: string]: string[] }> {
  const results = {};

  for (const [viewportId, inputArray] of Object.entries(viewportInputMap)) {
    const promises = inputArray.map((representationInput) => {
      return internalAddSegmentationRepresentation(
        viewportId,
        representationInput
      );
    });

    results[viewportId] = await Promise.all(promises);
  }

  return results;
}

export { addSegmentationRepresentations, addSegmentationRepresentationsMap };
