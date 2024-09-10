import type { SegmentationRepresentations } from '../../enums';
import type { RepresentationStyle } from './SegmentationStyle';
import { segmentationStyle } from './SegmentationStyle';

/**
 * It returns the global segmentation config.
 * @returns The global segmentation configuration for all segmentations.
 */
export function getGlobalStyle(
  representationType: SegmentationRepresentations
): RepresentationStyle {
  return segmentationStyle.getGlobalStyle(representationType);
}
