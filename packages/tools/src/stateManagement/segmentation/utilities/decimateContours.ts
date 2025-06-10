import type { Types } from '@cornerstonejs/core';
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
    return;
  }
  if (!segmentation.representationData.Contour) {
    return;
  }
  const viewport = getViewportAssociatedToSegmentation(segmentationId);
  if (!viewport) {
    return viewport;
  }

  const polylinesCanvasMap = extractSegmentPolylines(
    segmentationId,
    segmentIndex
  );
  if (!polylinesCanvasMap) {
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
    console.log('Number of points before decimation: ', polylineCanvas.length);

    // Decimate the polyline
    const decimatedPolyline2D = decimate(polylineCanvas, options.epsilon);

    // Convert back to 3D points, preserving the Z coordinate from original points
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
