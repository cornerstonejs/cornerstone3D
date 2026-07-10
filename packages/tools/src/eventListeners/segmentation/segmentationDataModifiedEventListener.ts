import type { SegmentationDataModifiedEventType } from '../../types/EventTypes';
import { triggerSegmentationRenderForModified } from '../../stateManagement/segmentation/SegmentationRenderingEngine';
import onLabelmapSegmentationDataModified from './labelmap/onLabelmapSegmentationDataModified';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';

/** A callback function that is called when the segmentation data is modified which
 *  often is as a result of tool interactions e.g., scissors, eraser, etc.
 */
const onSegmentationDataModified = function (
  evt: SegmentationDataModifiedEventType
): void {
  const { segmentationId } = evt.detail;
  const { representationData } = getSegmentation(segmentationId);

  if (representationData.Labelmap) {
    onLabelmapSegmentationDataModified(evt);
  }

  // Data modifications stream in at brush-stroke frequency; this trigger
  // renders cheap viewports live and defers projection-heavy ones (labelmap
  // over MIP) until the stream goes quiet.
  triggerSegmentationRenderForModified(segmentationId);
};

export default onSegmentationDataModified;
