import type { ContourSegmentationAnnotation } from '../../../types';
import {
  getAnnotation,
  invalidateAnnotation,
} from '../../annotation/annotationState';
import { getSegmentation } from '../getSegmentation';
import {
  extractSegmentPolylines,
  getViewportAssociatedToSegmentation,
} from './extractSegmentPolylines';
import decimate from '../../../utilities/math/polyline/decimate';

/**
 * Decimates contour polylines for a given segmentation and segment using the Ramer-Douglas-Peucker algorithm.
 * This reduces the number of points in the contour while preserving the overall shape within a specified tolerance.
 *
 * @param segmentationId - The unique identifier of the segmentation
 * @param segmentIndex - The index of the segment within the segmentation
 * @param options - Configuration options for decimation
 * @param options.epsilon - The maximum distance tolerance for point removal (default: 0.1)
 */
export default function decimateContours(
  segmentationId: string,
  segmentIndex: number,
  options: { epsilon: number } = { epsilon: 0.1 }
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
  const viewport = getViewportAssociatedToSegmentation(segmentationId);
  if (!viewport) {
    console.warn('No viewport associated to the segmentation found');
    return;
  }

  const polylinesCanvasMap = extractSegmentPolylines(
    segmentationId,
    segmentIndex
  );
  if (!polylinesCanvasMap) {
    console.warn(
      `Error extracting contour data from segment ${segmentIndex} in segmentation ${segmentationId}`
    );
    return;
  }

  const keys = Array.from(polylinesCanvasMap?.keys());

  keys.forEach((annotationUID) => {
    const annotation = getAnnotation(
      annotationUID
    ) as ContourSegmentationAnnotation;
    if (!annotation) {
      return;
    }

    const polylineCanvas = polylinesCanvasMap.get(annotationUID);
    console.log(
      'Number of points before decimation: ',
      annotation.data.contour.polyline.length
    );

    // Decimate the polyline
    const decimatedPolyline2D = decimate(polylineCanvas, options.epsilon);

    // Convert back to 3D points
    annotation.data.contour.polyline = decimatedPolyline2D.map((point2D) =>
      viewport.canvasToWorld(point2D)
    );
    console.log(
      'Number of points after decimation: ',
      annotation.data.contour.polyline.length
    );
    invalidateAnnotation(annotation);
  });
}
