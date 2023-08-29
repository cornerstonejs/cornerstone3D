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
  lazyCalculation?: boolean;
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
    lazyCalculation,
  } = operationData;
  const { imageData, dimensions } = segmentation;
  const scalarData = segmentation.getScalarData();
  const modifiedSlicesToUse = new Set<number>();

  let pointsChunks;
  if (lazyCalculation) {
    pointsChunks = [];
    for (let i = 0; i < points.length; i += 4) {
      pointsChunks.push(points.slice(i, i + 4));
    }
  } else {
    pointsChunks = [points];
  }

  for (let i = 0; i < pointsChunks.length; i++) {
    const pointsChunk = pointsChunks[i];

    const callback = ({ index, value, pointIJK }) => {
      if (segmentsLocked.includes(value)) {
        return;
      }
      scalarData[index] = segmentIndex;
      modifiedSlicesToUse.add(
        Math.floor(index / (dimensions[0] * dimensions[1]))
      );
    };

    pointInSurroundingSphereCallback(
      imageData,
      pointsChunk.slice(0, 2),
      callback,
      viewport as Types.IVolumeViewport
    );
  }

  const sliceArray = Array.from(modifiedSlicesToUse);

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
