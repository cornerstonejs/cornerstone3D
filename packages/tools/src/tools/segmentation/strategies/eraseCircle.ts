import type { Types } from '@cornerstonejs/core';

import type { OperationData } from './BrushStrategy';
import BrushStrategy from './BrushStrategy';
import { CIRCLE_STRATEGY } from './fillCircle';
import initializeErase from './utils/initializeErase';

const ERASE_CIRCLE_STRATEGY = new BrushStrategy(
  'EraseCircle',
  initializeErase,
  ...CIRCLE_STRATEGY.initializers
);

export function eraseInsideCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  ERASE_CIRCLE_STRATEGY.fill(enabledElement, operationData);
}

ERASE_CIRCLE_STRATEGY.assignMethods(eraseInsideCircle);
