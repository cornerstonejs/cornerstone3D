import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { pointInSurroundingSphereCallback } from '../../../utilities';
import isWithinThreshold from './utils/isWithinThreshold';

type OperationData = {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
  volume: Types.IImageVolume;
  imageVolume: Types.IImageVolume;
  segmentIndex: number;
  segmentationId: string;
  segmentsLocked: number[];
  viewPlaneNormal: Types.Point3;
  viewUp: Types.Point3;
  strategySpecificConfiguration: any;
  constraintFn: () => boolean;
};

function fillSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  _inside = true,
  threshold = false
): void {
  const { viewport } = enabledElement;
  const {
    volume: segmentation,
    segmentsLocked,
    segmentIndex,
    imageVolume,
    strategySpecificConfiguration,
    segmentationId,
    points,
  } = operationData;

  const { imageData, dimensions } = segmentation;
  const scalarData = segmentation.getScalarData();
  const scalarIndex = [];

  let callback;

  if (threshold) {
    callback = ({ value, index, pointIJK }) => {
      if (segmentsLocked.includes(value)) {
        return;
      }

      if (
        isWithinThreshold(index, imageVolume, strategySpecificConfiguration)
      ) {
        scalarData[index] = segmentIndex;
        scalarIndex.push(index);
      }
    };
  } else {
    callback = ({ index, value }) => {
      if (segmentsLocked.includes(value)) {
        return;
      }
      scalarData[index] = segmentIndex;
      scalarIndex.push(index);
    };
  }

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
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being filled.
 * @param operationData - EraseOperationData
 */
export function thresholdInsideSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  const { volume, imageVolume } = operationData;

  if (
    !csUtils.isEqual(volume.dimensions, imageVolume.dimensions) ||
    !csUtils.isEqual(volume.direction, imageVolume.direction)
  ) {
    throw new Error(
      'Only source data the same dimensions/size/orientation as the segmentation currently supported.'
    );
  }

  fillSphere(enabledElement, operationData, true, true);
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
