import { defaultSegmentationStateManager } from './SegmentationStateManager';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import labelmapDisplay from '../../tools/displayTools/Labelmap/labelmapDisplay';
import contourDisplay from '../../tools/displayTools/Contour/contourDisplay';

import { getSegmentationRepresentation } from './getSegmentationRepresentation';

/**
 * Removes specified segmentation representations from the state.
 *
 * @param segmentationRepresentationUIDs - An array of UIDs of the segmentation representations to remove.
 *
 * @remarks
 * This function iterates through the provided segmentation representation UIDs and
 * removes each one from the state using the defaultSegmentationStateManager.
 * If no UIDs are provided or the array is empty, the function returns without doing anything.
 *
 * Note that this is different from removeSegmentationRepresentationsFromViewport
 * as this will remove the representations from the state, AND from all viewports
 * that have them assigned. However, the removeSegmentationRepresentationsFromViewport
 * will only remove them from the viewport specified.
 */
function removeSegmentationRepresentations(
  segmentationRepresentationUIDs: string[]
): void {
  if (
    !segmentationRepresentationUIDs ||
    segmentationRepresentationUIDs.length === 0
  ) {
    return;
  }

  segmentationRepresentationUIDs.forEach((segmentationRepresentationUID) => {
    defaultSegmentationStateManager.removeRepresentation(
      segmentationRepresentationUID
    );
  });
}

/**
 * Removes specified segmentation representations from a given viewport.
 * But the given representations are not removed from the state, to remove that
 * completely you need to call removeSegmentationRepresentations
 *
 * @param viewportId - The ID of the viewport from which to remove the segmentation representations.
 * @param segmentationRepresentationUIDs - An array of UIDs of the segmentation representations to remove.
 * @param immediate - Optional. If true, the viewport will be updated immediately after removal.
 *
 * @remarks
 * This function iterates through the provided segmentation representation UIDs and
 * removes each one from the specified viewport. If no UIDs are provided, the function
 * returns without doing anything.
 */
function removeSegmentationRepresentationsFromViewport(
  viewportId: string,
  segmentationRepresentationUIDs: string[],
  immediate?: boolean
): void {
  if (!segmentationRepresentationUIDs) {
    return;
  }

  segmentationRepresentationUIDs.forEach((segmentationRepresentationUID) => {
    _removeRepresentation(viewportId, segmentationRepresentationUID, immediate);

    defaultSegmentationStateManager.removeRepresentationFromViewport(
      viewportId,
      segmentationRepresentationUID
    );
  });
}

function _removeRepresentation(
  viewportId,
  segmentationRepresentationUID: string,
  immediate?: boolean
): void {
  const segmentationRepresentation = getSegmentationRepresentation(
    segmentationRepresentationUID
  );

  const { type } = segmentationRepresentation;

  if (type === SegmentationRepresentations.Labelmap) {
    labelmapDisplay.removeRepresentation(
      viewportId,
      segmentationRepresentationUID,
      immediate
    );
  } else if (type === SegmentationRepresentations.Contour) {
    contourDisplay.removeRepresentation(
      viewportId,
      segmentationRepresentationUID,
      immediate
    );
  } else {
    throw new Error(`The representation ${type} is not supported yet`);
  }
}

export {
  removeSegmentationRepresentations,
  removeSegmentationRepresentationsFromViewport,
};
