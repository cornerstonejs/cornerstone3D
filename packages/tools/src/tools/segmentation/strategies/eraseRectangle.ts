import type { Types } from '@cornerstonejs/core';

import { LabelmapToolOperationData } from '../../../types';
import { fillInsideRectangle } from './fillRectangle';

type OperationData = LabelmapToolOperationData & {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
};

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

  fillInsideRectangle(enabledElement, eraseOperationData);
}

/**
 * Erase the rectangle region segment inside the segmentation defined by the operationData.
 * It erases the segmentation pixels inside the defined rectangle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - OperationData
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
 * @param operationData - OperationData
 */
export function eraseOutsideRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  eraseRectangle(enabledElement, operationData, false);
}
