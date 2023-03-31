import type { Types } from '@cornerstonejs/core';

import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { pointInSurroundingSphereCallback } from '../../../utilities';

type OperationData = {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
  volume: Types.IImageVolume;
  segmentIndex: number;
  segmentationId: string;
  segmentsLocked: number[];
  viewPlaneNormal: Types.Point3;
  viewUp: Types.Point3;
  constraintFn: () => boolean;
};

function fillSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  _inside = true
): void {
  const { viewport } = enabledElement;
  const {
    volume: segmentation,
    segmentsLocked,
    segmentIndex,
    segmentationId,
    points,
  } = operationData;

  const { imageData, dimensions } = segmentation;
  const scalarData = segmentation.getScalarData();
  const scalarIndex = [];

  const callback = ({ index, value }) => {
    if (segmentsLocked.includes(value)) {
      return;
    }
    scalarData[index] = segmentIndex;
    scalarIndex.push(index);
  };

  pointInSurroundingSphereCallback(
    imageData,
    [points[0], points[1]],
    callback,
    viewport as Types.IVolumeViewport
  );

  // Since the scalar indexes start from the top left corner of the cube, the first
  // slice that needs to be rendered can be calculated from the first mask coordinate
  // divided by the zMultiple, as well as the last slice for the last coordinate
  const zMultiple = dimensions[0] * dimensions[1];
  const minSlice = Math.floor(scalarIndex[0] / zMultiple);
  const maxSlice = Math.floor(scalarIndex[scalarIndex.length - 1] / zMultiple);
  const sliceArray = Array.from(
    { length: maxSlice - minSlice + 1 },
    (v, k) => k + minSlice
  );

  triggerSegmentationDataModified(segmentationId, sliceArray);
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
