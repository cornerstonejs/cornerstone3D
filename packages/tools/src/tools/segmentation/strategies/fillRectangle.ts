import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { getBoundingBoxAroundShape } from '../../../utilities/boundingBox';
import { pointInShapeCallback } from '../../../utilities';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';

const { transformWorldToIndex } = csUtils;
import {
  OperationData,
  EditDataStack,
  EditDataVolume,
} from './OperationalData';
import { cache } from '@cornerstonejs/core';
import { createVTKImageDataFromImageId } from '../../../../../core/src/RenderingEngine/helpers/createVTKImageDataFromImage';

/**
 * For each point in the bounding box around the rectangle, if the point is inside
 * the rectangle, set the scalar value to the segmentIndex
 * @param toolGroupId - string
 * @param operationData - OperationData
 * @param inside - boolean
 */
// Todo: why we have another constraintFn? in addition to the one in the operationData?
/**
 * For each point in the bounding box around the rectangle, if the point is inside
 * the rectangle, set the scalar value to the segmentIndex
 * @param toolGroupId - string
 * @param operationData - OperationData
 * @param inside - boolean
 */
// Todo: why we have another constraintFn? in addition to the one in the operationData?
export function fillRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  inside = true
): void {
  const { points, segmentsLocked, segmentIndex, segmentationId, constraintFn } =
    operationData;
  let imageData, scalarData, dimensions;
  if (operationData.editData.type === 'volume') {
    const { segmentation: segmentationVolume } =
      operationData.editData as EditDataVolume;

    imageData = segmentationVolume.imageData;
    scalarData = segmentationVolume.getScalarData();
  } else {
    const { currentSegmentationImageId } =
      operationData.editData as EditDataStack;
    imageData = createVTKImageDataFromImageId(currentSegmentationImageId);
    scalarData = cache.getImage(currentSegmentationImageId).getPixelData();
    dimensions = imageData.getDimensions();
  }

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
