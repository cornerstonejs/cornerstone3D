import type { Types } from '@cornerstonejs/core';

import { fillInsideSphere } from './fillSphere';
import { SegToolsOperationData } from '../../../types';

type OperationData = SegToolsOperationData & {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
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
