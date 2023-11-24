import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { getBoundingBoxAroundShape } from '../../../utilities/boundingBox';
import { pointInShapeCallback } from '../../../utilities';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { LabelmapToolOperationData } from '../../../types';
import { getStrategyData } from './utils/getStrategyData';

const { transformWorldToIndex } = csUtils;

type OperationData = LabelmapToolOperationData & {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
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
  const { points, segmentsLocked, segmentIndex, segmentationId, constraintFn } =
    operationData;

  const strategyData = getStrategyData({
    operationData,
    viewport: enabledElement.viewport,
  });

  if (!strategyData) {
    console.warn('No data found for fillRectangle');
    return;
  }

  const { segmentationImageData, segmentationScalarData } = strategyData;

  let rectangleCornersIJK = points.map((world) => {
    return transformWorldToIndex(segmentationImageData, world);
  });

  // math round
  rectangleCornersIJK = rectangleCornersIJK.map((point) => {
    return point.map((coord) => {
      return Math.round(coord);
    });
  });

  const boundsIJK = getBoundingBoxAroundShape(
    rectangleCornersIJK,
    segmentationImageData.getDimensions()
  );

  // Since always all points inside the boundsIJK is inside the rectangle...
  const pointInRectangle = () => true;

  const callback = ({ value, index, pointIJK }) => {
    if (segmentsLocked.includes(value)) {
      return;
    }

    if (!constraintFn) {
      segmentationScalarData[index] = segmentIndex;
      return;
    }

    if (constraintFn(pointIJK)) {
      segmentationScalarData[index] = segmentIndex;
    }
  };

  pointInShapeCallback(
    segmentationImageData,
    pointInRectangle,
    callback,
    boundsIJK
  );

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
