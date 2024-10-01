import type { SegmentationRepresentations } from '../../enums';
import type { RepresentationStyle } from './SegmentationStyle';
import { segmentationStyle } from './SegmentationStyle';

/**
 * Retrieves the global style for a given segmentation representation type.
 * @param type - The type of segmentation representation.
 * @returns The global style for the given representation type.
 */
export function getGlobalStyle(
  type: SegmentationRepresentations
): RepresentationStyle {
  return segmentationStyle.getStyle({ type });
}
