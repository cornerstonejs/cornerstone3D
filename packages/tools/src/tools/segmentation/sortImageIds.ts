import { vec3 } from 'gl-matrix';
import { metaData } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { sortImageIdsAndGetSpacing } from '../../../../streaming-image-volume-loader/src/helpers';

export default function sortImageIds(imageIds) {
  const { rowCosines, columnCosines } = metaData.get(
    'imagePlaneModule',
    imageIds[0]
  );
  const scanAxisNormal = vec3.create();

  vec3.cross(scanAxisNormal, rowCosines, columnCosines);

  const { zSpacing, origin, sortedImageIds } = sortImageIdsAndGetSpacing(
    imageIds,
    scanAxisNormal
  );
  const direction = [
    ...rowCosines,
    ...columnCosines,
    ...scanAxisNormal,
  ] as Types.Mat3;

  return { zSpacing, origin, sortedImageIds, direction };
}
