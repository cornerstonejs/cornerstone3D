import type { Types } from '@cornerstonejs/core';

import { fillInsideSphere } from './fillSphere';

type OperationData = {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
  volume: Types.IImageVolume;
  segmentIndex: number;
  segmentationId: string;
  segmentsLocked: number[];
  viewPlaneNormal: Types.Point3;
  viewUp: Types.Point3;
  constraintFn: () => boolean;
};

export function eraseInsideSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  // Take the arguments and set the segmentIndex to 0,
  // Then use existing fillInsideCircle functionality.
  const eraseOperationData = Object.assign({}, operationData, {
    segmentIndex: 0,
  });

  fillInsideSphere(enabledElement, eraseOperationData);
}
