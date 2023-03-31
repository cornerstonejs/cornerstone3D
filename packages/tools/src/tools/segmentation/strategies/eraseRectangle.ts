import { ImageVolume, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { getBoundingBoxAroundShape } from '../../../utilities/boundingBox';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { pointInShapeCallback } from '../../../utilities';

const { transformWorldToIndex } = csUtils;

type EraseOperationData = {
  segmentationId: string;
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
  volume: ImageVolume;
  constraintFn: (x: [number, number, number]) => boolean;
  segmentsLocked: number[];
};

function eraseRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: EraseOperationData,
  inside = true
): void {
  const {
    volume: segmentation,
    points,
    segmentsLocked,
    segmentationId,
  } = operationData;
  const { imageData, dimensions } = segmentation;
  const scalarData = segmentation.getScalarData();

  const rectangleCornersIJK = points.map((world) => {
    return transformWorldToIndex(imageData, world);
  });

  const boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions);

  if (boundsIJK.every(([min, max]) => min !== max)) {
    throw new Error('Oblique segmentation tools are not supported yet');
  }

  // Since always all points inside the boundsIJK is inside the rectangle...
  const pointInShape = () => true;

  const callback = ({ value, index }) => {
    if (segmentsLocked.includes(value)) {
      return;
    }
    scalarData[index] = 0;
  };

  pointInShapeCallback(imageData, pointInShape, callback, boundsIJK);

  triggerSegmentationDataModified(segmentationId);
}

/**
 * Erase the rectangle region segment inside the segmentation defined by the operationData.
 * It erases the segmentation pixels inside the defined rectangle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function eraseInsideRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: EraseOperationData
): void {
  eraseRectangle(enabledElement, operationData, true);
}

/**
 * Erase the rectangle region segment inside the segmentation defined by the operationData.
 * It erases the segmentation pixels outside the defined rectangle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function eraseOutsideRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: EraseOperationData
): void {
  eraseRectangle(enabledElement, operationData, false);
}
