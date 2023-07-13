import type { Types } from '@cornerstonejs/core';
import { OperationData } from './OperationalData';
import * as stackStrategy from './stack';
import * as volumeStrategy from './volume';

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function fillInsideCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  if (operationData.editData.type === 'volume') {
    volumeStrategy.fillInsideCircle(enabledElement, operationData);
  } else {
    stackStrategy.fillInsideCircle(enabledElement, operationData);
  }
}

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function thresholdInsideCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  if (operationData.editData.type === 'volume') {
    volumeStrategy.thresholdInsideCircle(enabledElement, operationData);
  } else {
    stackStrategy.thresholdInsideCircle(enabledElement, operationData);
  }
}

/**
 * Fill outside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels outside the  defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function fillOutsideCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  throw new Error('Not yet implemented');
}
