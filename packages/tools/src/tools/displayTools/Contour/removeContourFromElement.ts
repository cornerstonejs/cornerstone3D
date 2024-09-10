import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';

import { removeAnnotation } from '../../../stateManagement';

/**
 * Remove the contour representation from the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param removeFromCache - boolean
 *
 * @internal
 */
function removeContourFromElement(
  viewportId: string,
  segmentationId: string,
  removeFromCache = false // Todo
): void {
  const segmentation = getSegmentation(segmentationId);

  const { annotationUIDsMap } = segmentation.representationData.Contour;

  annotationUIDsMap.forEach((annotationSet) => {
    annotationSet.forEach((annotationUID) => {
      removeAnnotation(annotationUID);
    });
  });
}

export default removeContourFromElement;
