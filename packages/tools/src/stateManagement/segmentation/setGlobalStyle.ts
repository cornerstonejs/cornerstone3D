import type { SegmentationRepresentations } from '../../enums';
import type { RepresentationStyle } from './SegmentationStyle';
import { segmentationStyle } from './SegmentationStyle';
import { triggerSegmentationModified } from './triggerSegmentationEvents';

/**
 * Sets the global configuration for a specific segmentation representation type.
 *
 * @param representationType - The type of segmentation representation.
 * @param config - The global configuration to be set.
 * @param suppressEvents - Optional. If true, suppresses triggering of segmentation modified events.
 *
 * @remarks
 * This function updates the global style for the specified representation type
 * using the segmentationStyle object. If suppressEvents is not set to true,
 * it triggers a segmentation modified event after updating the style.
 */
export function setGlobalStyle(
  representationType: SegmentationRepresentations,
  styles: RepresentationStyle,
  suppressEvents?: boolean
): void {
  segmentationStyle.setGlobalStyle(representationType, styles);

  if (!suppressEvents) {
    triggerSegmentationModified();
  }
}
