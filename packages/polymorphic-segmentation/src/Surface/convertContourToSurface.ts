import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  eventTarget,
  triggerEvent,
  getWebWorkerManager,
} from '@cornerstonejs/core';
import type {
  ContourSegmentationAnnotation,
  ContourSegmentationData,
} from '@cornerstonejs/tools/types';
import * as cornerstoneTools from '@cornerstonejs/tools';

const { WorkerTypes } = cornerstoneTools.Enums;
const { getAnnotation } = cornerstoneTools.annotation.state;

const workerManager = getWebWorkerManager();

const triggerWorkerProgress = (eventTarget, progress, id) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.POLYSEG_CONTOUR_TO_SURFACE,
    id,
  });
};

/**
 * Converts a contour representation to a surface representation.
 *
 * @param contourRepresentationData - The contour segmentation data.
 * @param segmentIndex - The index of the segment to convert.
 * @returns A promise that resolves to the surface data.
 */
export async function convertContourToSurface(
  contourRepresentationData: ContourSegmentationData,
  segmentIndex: number
): Promise<Types.SurfaceData> {
  const { annotationUIDsMap } = contourRepresentationData;

  // loop over all annotations in the segment and flatten their polylines
  const polylines = [];
  const numPointsArray = [];
  const annotationUIDs = annotationUIDsMap.get(segmentIndex);

  for (const annotationUID of annotationUIDs) {
    const annotation = getAnnotation(annotationUID);
    const { polyline } = (annotation as ContourSegmentationAnnotation).data
      .contour;
    numPointsArray.push(polyline.length);
    polyline.forEach((polyline) => polylines.push(...polyline));
  }

  triggerWorkerProgress(eventTarget, 0, segmentIndex);

  const results = await workerManager.executeTask(
    'polySeg',
    'convertContourToSurface',
    {
      polylines,
      numPointsArray,
    },
    {
      callbacks: [
        (progress) => {
          triggerWorkerProgress(eventTarget, progress, segmentIndex);
        },
      ],
    }
  );

  triggerWorkerProgress(eventTarget, 100, segmentIndex);

  return results;
}
