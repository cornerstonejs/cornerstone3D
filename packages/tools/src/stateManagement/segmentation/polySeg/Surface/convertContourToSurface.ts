import { Types } from '@cornerstonejs/core';
import { getWebWorkerManager } from '@cornerstonejs/core';
import { ContourSegmentationData } from '../../../../types';
import { getAnnotation } from '../../../annotation/annotationState';

const workerManager = getWebWorkerManager();

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
    const polyline = annotation.data.contour.polyline;
    numPointsArray.push(polyline.length);
    polyline.forEach((polyline) => polylines.push(...polyline));
  }

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
          console.debug('progress', progress);
        },
      ],
    }
  );

  return results;
}
