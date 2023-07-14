import { vec3 } from 'gl-matrix';
import { metaData } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { sortImageIdsAndGetSpacing } from '../../../../streaming-image-volume-loader/src/helpers';

export default function sortImageIds(imageIds) {
  const { imagePositionPatient, rowCosines, columnCosines } = metaData.get(
    'imagePlaneModule',
    imageIds[0]
  );

  let direction, zSpacing, origin, sortedImageIds;
  const scanAxisNormal = vec3.create();
  if (rowCosines && columnCosines) {
    vec3.cross(scanAxisNormal, rowCosines, columnCosines);

    const sortInfo = sortImageIdsAndGetSpacing(imageIds, scanAxisNormal);
    direction = [
      ...rowCosines,
      ...columnCosines,
      ...scanAxisNormal,
    ] as Types.Mat3;
    zSpacing = sortInfo.zSpacing;
    origin = sortInfo.origin;
    sortedImageIds = sortInfo.sortedImageIds;
  } else {
    direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (imagePositionPatient) {
      origin = imagePositionPatient;
    } else {
      origin = [0, 0, 0];
    }
    zSpacing = 1;
    sortedImageIds = imageIds;
  }
  return { zSpacing, origin, sortedImageIds, direction };
}
