import type { Types } from '@cornerstonejs/core';

import type { OperationData } from './BrushStrategy';
import { fillInsideCircle } from './fillCircle';

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
