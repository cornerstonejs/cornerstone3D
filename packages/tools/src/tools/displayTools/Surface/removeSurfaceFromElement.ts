import { getEnabledElement } from '@cornerstonejs/core';
import {
  removeSurfaceDisplaySets,
  showsSurfacesAsDisplaySets,
} from './surfaceDisplaySet';
import {
  removeSurfaceSliceProps,
  showsSurfacesAsSliceProps,
} from './surfaceSliceProps';
import { getSurfaceRepresentationUID } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';

/**
 * Remove the surface representation from the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param element - The element that the segmentation is being added to.
 * @param segmentationId - The id of the segmentation to remove.
 *
 * @internal
 */
function removeSurfaceFromElement(
  element: HTMLDivElement,
  segmentationId: string
): void {
  const enabledElement = getEnabledElement(element);

  const { viewport } = enabledElement;

  if (showsSurfacesAsDisplaySets(viewport)) {
    removeSurfaceDisplaySets(viewport, segmentationId);

    return;
  }

  if (showsSurfacesAsSliceProps(viewport)) {
    removeSurfaceSliceProps(
      viewport,
      getSurfaceRepresentationUID(segmentationId, '')
    );
  }
}

export default removeSurfaceFromElement;
