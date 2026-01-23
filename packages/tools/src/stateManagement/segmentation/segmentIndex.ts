import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import { invalidateBrushCursor } from '../../utilities/segmentation/invalidateBrushCursor';
import { getSegmentation } from './getSegmentation';
import { getViewportIdsWithSegmentation } from './getViewportIdsWithSegmentation';
import { triggerSegmentationModified } from './triggerSegmentationEvents';
import { getActiveSegmentIndex } from './getActiveSegmentIndex';
import { getSegmentationRepresentations } from './getSegmentationRepresentation';

/**
 * Set the active segment index for a segmentation Id. It fires a global state
 * modified event. Also it invalidates the brush cursor for all toolGroups that
 * has the segmentationId as active segment (since the brush cursor color
 * should change as well)
 *
 * @triggers SEGMENTATION_MODIFIED
 * @param segmentationId - The id of the segmentation that the segment belongs to.
 * @param segmentIndex - The index of the segment to be activated.
 */
function setActiveSegmentIndex(
  segmentationId: string,
  segmentIndex: number
): void {
  const segmentation = getSegmentation(segmentationId);

  if (typeof segmentIndex === 'string') {
    console.warn('segmentIndex is a string, converting to number');
    segmentIndex = Number(segmentIndex);
  }

  // set all other segments to inactive
  Object.values(segmentation.segments).forEach((segment) => {
    segment.active = false;
  });

  if (!segmentation.segments[segmentIndex]) {
    segmentation.segments[segmentIndex] = {
      segmentIndex,
      label: '',
      locked: false,
      cachedStats: {},
      active: false,
    };
  }

  if (segmentation.segments[segmentIndex].active !== true) {
    segmentation.segments[segmentIndex].active = true;

    triggerSegmentationModified(segmentationId);
  }

  // get all toolGroups that has the segmentationId as active
  // segment and call invalidateBrushCursor on them
  const viewportIds = getViewportIdsWithSegmentation(segmentationId);

  // check if the viewportId does not have a segment in representations
  viewportIds.forEach((viewportId) => {
    const representations = getSegmentationRepresentations(viewportId, {
      segmentationId,
    });

    representations.forEach((representation) => {
      if (!representation.segments[segmentIndex]) {
        representation.segments[segmentIndex] = {
          visible: true,
        };
      }
    });
  });

  viewportIds.forEach((viewportId) => {
    const toolGroup = getToolGroupForViewport(viewportId);
    if (!toolGroup) {
      return;
    }
    invalidateBrushCursor(toolGroup.id);
  });
}

export { setActiveSegmentIndex, getActiveSegmentIndex };
