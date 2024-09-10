import type { Segmentation } from '../../types/SegmentationStateTypes';
import { getActiveSegmentation as _getActiveSegmentation } from './getActiveSegmentation';
import { setActiveSegmentation as _setActiveSegmentation } from './setActiveSegmentation';

/**
 * Get the active segmentation representation for viewportId
 * @param viewportId - The id of the viewport to get the active segmentation for.
 * @returns The active segmentation representation for the tool group.
 */
function getActiveSegmentation(viewportId: string): Segmentation {
  return _getActiveSegmentation(viewportId);
}

/**
 * Set the active segmentation for viewportId
 * @param viewportId - The id of the viewport to set the active segmentation for.
 * @param segmentationId - The id of the segmentation to set as active.
 * @param suppressEvent - Whether to suppress the event triggered by the change - default false.
 */
function setActiveSegmentation(
  viewportId: string,
  segmentationId: string,
  suppressEvent: boolean = false
): void {
  _setActiveSegmentation(viewportId, segmentationId, suppressEvent);
}

export {
  // get
  getActiveSegmentation,
  // set
  setActiveSegmentation,
};
