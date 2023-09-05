import type { Types } from '@cornerstonejs/core';

import { fillInsideCircle } from './fillCircle';

type OperationData = {
  segmentationId: string;
  imageVolume: Types.IImageVolume;
  points: any; // Todo:fix
  volume: Types.IImageVolume;
  segmentIndex: number;
  segmentsLocked: number[];
  viewPlaneNormal: number[];
  viewUp: number[];
  strategySpecificConfiguration: any;
  constraintFn: () => boolean;
};

export function eraseInsideCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  // Take the arguments and set the segmentIndex to 0,
  // Then use existing fillInsideCircle functionality.
  const eraseOperationData = {
    ...operationData,
    segmentIndex: 0,
  };

  fillInsideCircle(enabledElement, eraseOperationData);
}
