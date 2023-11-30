import type { Types } from '@cornerstonejs/core';

import type { OperationData } from './BrushStrategy';
import BrushStrategy from './BrushStrategy';
import { SPHERE_STRATEGY } from './fillSphere';
import initializeErase from './utils/initializeErase';

const ERASE_CIRCLE_STRATEGY = new BrushStrategy(
  'EraseSphere',
  initializeErase,
  ...SPHERE_STRATEGY.initializers
);

export function eraseInsideSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  ERASE_CIRCLE_STRATEGY.fill(enabledElement, operationData);
}

ERASE_CIRCLE_STRATEGY.assignMethods(eraseInsideSphere);
