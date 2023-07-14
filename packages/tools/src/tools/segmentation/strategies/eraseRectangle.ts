import type { Types } from '@cornerstonejs/core';
import { OperationData } from './OperationalData';
import { fillRectangle } from './fillRectangle';

function eraseRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  inside = true
): void {
  // Take the arguments and set the segmentIndex to 0,
  // Then use existing fillRectangle functionality.
  const eraseOperationData = Object.assign({}, operationData, {
    segmentIndex: 0,
  });

  fillRectangle(enabledElement, eraseOperationData, inside);
}

/**
 * Erase the rectangle region segment inside the segmentation defined by the operationData.
 * It erases the segmentation pixels inside the defined rectangle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function eraseInsideRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  eraseRectangle(enabledElement, operationData, true);
}

/**
 * Erase the rectangle region segment inside the segmentation defined by the operationData.
 * It erases the segmentation pixels outside the defined rectangle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function eraseOutsideRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  eraseRectangle(enabledElement, operationData, false);
}
