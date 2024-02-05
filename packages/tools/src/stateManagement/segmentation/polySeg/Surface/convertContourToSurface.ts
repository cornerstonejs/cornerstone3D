import { Types, eventTarget, triggerEvent } from '@cornerstonejs/core';
import { getWebWorkerManager } from '@cornerstonejs/core';
import { ContourSegmentationData } from '../../../../types';
import { getAnnotation } from '../../../annotation/annotationState';
import { Events } from '../../../../enums';

const workerManager = getWebWorkerManager();

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
    const { polyline } = annotation.data.contour;
    numPointsArray.push(polyline.length);
    polyline.forEach((polyline) => polylines.push(...polyline));
  }

  triggerEvent(eventTarget, Events.POLYSEG_CONVERSION, { progress: 0 });

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
          triggerEvent(eventTarget, Events.POLYSEG_CONVERSION, { progress });
        },
      ],
    }
  );

  triggerEvent(eventTarget, Events.POLYSEG_CONVERSION, { progress: 100 });

  return results;
}
