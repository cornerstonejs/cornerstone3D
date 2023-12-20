import interpolate from './freehandInterpolate/interpolate';
import type { InterpolationViewportData } from './InterpolationTypes';
import deleteRelatedAnnotations from './deleteRelatedAnnotations';

/**
 * updatedRelatedContours - Update the same roi contour id contours on modifying
 * one of them .
 *
 * @param eventData - Object.
 * @returns null
 */
export default function updateRelatedAnnotations(
  viewportData: InterpolationViewportData,
  isLabelUpdate = true
) {
  const { annotation } = viewportData;

  if (isLabelUpdate) {
    delete annotation.interpolationUID;
    deleteRelatedAnnotations(viewportData);
  } else {
    interpolate(viewportData);
  }
}
