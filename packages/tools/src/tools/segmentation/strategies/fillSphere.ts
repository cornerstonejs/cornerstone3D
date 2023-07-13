import type { Types } from '@cornerstonejs/core';
import { OperationData } from './OperationalData';
import * as stackStrategy from './stack';
import * as volumeStrategy from './volume';

export function fillSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  _inside = true
): void {
  if (operationData.editData.type === 'volume') {
    volumeStrategy.fillSphere(enabledElement, operationData);
  } else {
    stackStrategy.fillSphere(enabledElement, operationData);
  }
}

/**
 * Fill inside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param enabledElement - The element that is enabled and selected.
 * @param operationData - OperationData
 */
export function fillInsideSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillSphere(enabledElement, operationData, true);
}

/**
 * Fill outside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param enabledElement - The element that is enabled and selected.
 * @param operationData - OperationData
 */
export function fillOutsideSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillSphere(enabledElement, operationData, false);
}
