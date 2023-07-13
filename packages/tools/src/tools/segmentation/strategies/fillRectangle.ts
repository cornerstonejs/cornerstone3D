import type { Types } from '@cornerstonejs/core';
import { OperationData } from './OperationalData';
import * as stackStrategy from './stack';
import * as volumeStrategy from './volume';

/**
 * For each point in the bounding box around the rectangle, if the point is inside
 * the rectangle, set the scalar value to the segmentIndex
 * @param toolGroupId - string
 * @param operationData - OperationData
 * @param constraintFn - can be used to perform threshold segmentation
 * @param inside - boolean
 */
// Todo: why we have another constraintFn? in addition to the one in the operationData?
function fillRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  inside = true
): void {
  if (operationData.editData.type === 'volume') {
    volumeStrategy.fillRectangle(enabledElement, operationData);
  } else {
    stackStrategy.fillRectangle(enabledElement, operationData);
  }
}

/**
 * Fill the inside of a rectangle
 * @param toolGroupId - The unique identifier of the tool group.
 * @param operationData - The data that will be used to create the
 * new rectangle.
 * @param constraintFn - can be used to perform threshold segmentation
 */
export function fillInsideRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillRectangle(enabledElement, operationData, true);
}

/**
 * Fill the area outside of a rectangle for the toolGroupId and segmentationRepresentationUID.
 * @param toolGroupId - The unique identifier of the tool group.
 * @param operationData - The data that will be used to create the
 * new rectangle.
 * @param constraintFn - can be used to perform threshold segmentation
 */
export function fillOutsideRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillRectangle(enabledElement, operationData, false);
}
