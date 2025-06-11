import type { Types } from '@cornerstonejs/core';
import type {
  ContourSegmentationAnnotation,
  ContourSegmentationData,
  ToolSpecificAnnotationTypes,
} from '../../../types';
import { getAnnotation } from '../../annotation/annotationState';
import { getSegmentation } from '../getSegmentation';
import interpolateSegmentPoints from '../../../utilities/planarFreehandROITool/interpolation/interpolateSegmentPoints';
import { smoothAnnotation } from '../../../utilities/planarFreehandROITool';

/**
 * Smooths contour polylines for a given segmentation and segment using B-spline interpolation.
 * This function applies smoothing to reduce jagged edges and create more natural-looking contours
 * while preserving the overall shape and important features.
 *
 * @param segmentationId - The unique identifier of the segmentation
 * @param segmentIndex - The index of the segment within the segmentation
 * @param options - Configuration options for smoothing
 * @param options.knotsRatioPercentage - The percentage of points to use as knots for interpolation (default: 30)
 */
export default function smoothContours(
  segmentationId: string,
  segmentIndex: number,
  options: { knotsRatioPercentage: number } = { knotsRatioPercentage: 30 }
) {
  const segmentation = getSegmentation(segmentationId);
  if (!segmentation) {
    console.warn(`Invalid segmentation given ${segmentationId}`);
    return;
  }
  if (!segmentation.representationData.Contour) {
    console.warn(
      `No contour representation found for segmentation ${segmentationId}`
    );
    return;
  }

  const contourRepresentationData = segmentation.representationData
    .Contour as ContourSegmentationData;

  const { annotationUIDsMap } = contourRepresentationData;
  if (!annotationUIDsMap) {
    console.warn(`No contours found for segmentation ${segmentationId}`);
    return;
  }

  if (!annotationUIDsMap.has(segmentIndex)) {
    console.warn(
      `Error extracting contour data from segment ${segmentIndex} in segmentation ${segmentationId}`
    );
    return;
  }

  const annotationList = annotationUIDsMap.get(segmentIndex);

  annotationList.forEach((annotationUID) => {
    const annotation = getAnnotation(
      annotationUID
    ) as ContourSegmentationAnnotation;
    if (!annotation) {
      return;
    }

    const polyline = annotation.data.contour.polyline;

    // Check if we have enough points to smooth
    if (!polyline || polyline.length < 3) {
      return;
    }

    // Smooth the polyline using interpolateSegmentPoints
    const smoothedPolyline = interpolateSegmentPoints(
      polyline,
      0,
      polyline.length - 1,
      options.knotsRatioPercentage
    ) as Types.Point3[];

    // Update the polyline in the annotation
    annotation.data.contour.polyline = smoothedPolyline;
  });
}
