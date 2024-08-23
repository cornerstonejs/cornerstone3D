import type { RepresentationPublicInput } from '../../types/SegmentationStateTypes';

import { internalAddSegmentationRepresentation } from './internalAddSegmentationRepresentation';

/**
 * Set the specified segmentation representations on multiple viewports
 *
 * @param viewportIds - The viewportIds to add the segmentation representations to
 * @param representationInputArray - An array of segmentation representations to add to each viewport
 */
async function addSegmentationRepresentations(
  viewportId: string,
  representationInputArray: RepresentationPublicInput[]
): Promise<string[]> {
  const promises = representationInputArray.map((representationInput) => {
    return internalAddSegmentationRepresentation(
      viewportId,
      representationInput
    );
  });

  const segmentationRepresentationUIDs = await Promise.all(promises);

  return segmentationRepresentationUIDs;
}

/**
 * Set specific segmentation representations for each viewport
 *
 * @param viewportInputMap - A map of viewportIds to their respective representation input arrays
 */
async function addMultiViewportSegmentationRepresentations(viewportInputMap: {
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

export {
  addSegmentationRepresentations,
  addMultiViewportSegmentationRepresentations,
};
