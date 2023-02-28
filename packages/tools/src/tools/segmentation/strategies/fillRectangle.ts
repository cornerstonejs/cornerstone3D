import { ImageVolume, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { getBoundingBoxAroundShape } from '../../../utilities/boundingBox';
import { pointInShapeCallback } from '../../../utilities';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';

const { transformWorldToIndex } = csUtils;

type OperationData = {
  segmentationId: string;
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
  volume: ImageVolume;
  constraintFn: (x: [number, number, number]) => boolean;
  segmentIndex: number;
  segmentsLocked: number[];
};

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
  const {
    volume: segmentation,
    points,
    segmentsLocked,
    segmentIndex,
    segmentationId,
    constraintFn,
  } = operationData;
  const { imageData, dimensions } = segmentation;
  const scalarData = segmentation.getScalarData();

  let rectangleCornersIJK = points.map((world) => {
    return transformWorldToIndex(imageData, world);
  });

  // math round
  rectangleCornersIJK = rectangleCornersIJK.map((point) => {
    return point.map((coord) => {
      return Math.round(coord);
    });
  });

  const boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions);

  if (boundsIJK.every(([min, max]) => min !== max)) {
    throw new Error('Oblique segmentation tools are not supported yet');
  }

  // Since always all points inside the boundsIJK is inside the rectangle...
  const pointInRectangle = () => true;

  const callback = ({ value, index, pointIJK }) => {
    if (segmentsLocked.includes(value)) {
      return;
    }

    if (!constraintFn) {
      scalarData[index] = segmentIndex;
      return;
    }

    if (constraintFn(pointIJK)) {
      scalarData[index] = segmentIndex;
    }
  };

  pointInShapeCallback(imageData, pointInRectangle, callback, boundsIJK);

  triggerSegmentationDataModified(segmentationId);
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
