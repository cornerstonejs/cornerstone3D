import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  eventTarget,
  triggerEvent,
  getWebWorkerManager,
} from '@cornerstonejs/core';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { runPolySegTask } from '../utilities/runPolySegTask';

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
 * Converts a contour representation to a surface representation. The closed
 * contours of at least 3 points of the segment are converted; an open
 * contour, a point or a line encloses nothing. A segment without such a
 * contour gives no surface. The conversion is sent to the worker when an
 * instance of it is free (`runPolySegTask`), in the order of the calls.
 *
 * @param contourRepresentationData - The contour segmentation data.
 * @param segmentIndex - The index of the segment to convert.
 * @returns A promise that resolves to the surface data.
 */
export async function convertContourToSurface(
  contourRepresentationData: ToolsTypes.ContourSegmentationData,
  segmentIndex: number
): Promise<Types.SurfaceData> {
  const { annotationUIDsMap } = contourRepresentationData;

  // loop over all annotations in the segment and flatten their polylines
  const polylines = [];
  const numPointsArray = [];
  const annotationUIDs = annotationUIDsMap.get(segmentIndex);
  if (!annotationUIDs) {
    return;
  }

  for (const annotationUID of annotationUIDs) {
    const annotation = getAnnotation(
      annotationUID
    ) as ToolsTypes.ContourSegmentationAnnotation;
    const contour = annotation?.data.contour;

    if (!contour || contour.closed === false || contour.polyline.length < 3) {
      continue;
    }

    numPointsArray.push(contour.polyline.length);
    contour.polyline.forEach((point) => polylines.push(...point));
  }

  if (!numPointsArray.length) {
    return;
  }

  const results = await runPolySegTask(() => {
    triggerWorkerProgress(eventTarget, 0, segmentIndex);

    return workerManager.executeTask(
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
  });

  triggerWorkerProgress(eventTarget, 100, segmentIndex);

  return results;
}
