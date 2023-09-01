import type { Types } from '@cornerstonejs/core';

import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { pointInSurroundingSphereCallback } from '../../../utilities';

type OperationData = {
  points: Types.Point3[];
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

  if (points.length % 4 !== 0) {
    throw new Error('The length of the points array must be a multiple of 4.');
  }

  const { imageData, dimensions } = segmentation;
  const scalarData = segmentation.getScalarData();
  const modifiedSlicesToUse = new Set<number>();

  // Previously fillSphere and fillCircle (used in brushes) were acting on a
  // single circle or sphere. However, that meant that we were modifying the
  // segmentation scalar data on each drag (can be often +100 transactions). Lazy
  // calculation allows us to only modify the segmentation scalar data once the
  // user has finished drawing the circle or sphere. This is done by splitting
  // the points into chunks and only triggering the segmentation data modified
  // event once all the points have been processed. The tool need to provide the points
  // in the correct order to be chunked here. Todo: Maybe we should move the chunk
  // logic to the tool itself.
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
