import { utilities as csUtils, StackViewport } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
} from '../../../utilities/boundingBox';
import { pointInShapeCallback } from '../../../utilities';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { LabelmapToolOperationData } from '../../../types';
import { getStrategyData } from './utils/getStrategyData';
import { isAxisAlignedRectangle } from '../../../utilities/rectangleROITool/isAxisAlignedRectangle';

const { transformWorldToIndex } = csUtils;

type OperationData = LabelmapToolOperationData & {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
};

/**
 * For each point in the bounding box around the rectangle, if the point is inside
 * the rectangle, set the scalar value to the segmentIndex
 * @param toolGroupId - string
 * @param operationData - OperationData
 * @param inside - boolean
 */
// Todo: why we have another constraintFn? in addition to the one in the operationData?
function fillRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  inside = true
): void {
  const { points, segmentsLocked, segmentIndex, segmentationId } =
    operationData;

  const { viewport } = enabledElement;
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

  const boundsIJK = getBoundingBoxAroundShapeIJK(
    rectangleCornersIJK,
    segmentationImageData.getDimensions()
  );

  const isStackViewport = viewport instanceof StackViewport;

  // Are we working with 2D rectangle in axis aligned viewport view or not
  const isAligned =
    isStackViewport || isAxisAlignedRectangle(rectangleCornersIJK);

  const direction = segmentationImageData.getDirection();
  const spacing = segmentationImageData.getSpacing();
  const { viewPlaneNormal } = viewport.getCamera();

  // In case that we are working on oblique, our EPS is really the spacing in the
  // normal direction, since we can't really test each voxel against a 2D rectangle
  // we need some tolerance in the normal direction.
  const EPS = csUtils.getSpacingInNormalDirection(
    {
      direction,
      spacing,
    },
    viewPlaneNormal
  );

  const pointsBoundsLPS = getBoundingBoxAroundShapeWorld(points);
  let [[xMin, xMax], [yMin, yMax], [zMin, zMax]] = pointsBoundsLPS;

  // Update the bounds with +/- EPS
  xMin -= EPS;
  xMax += EPS;
  yMin -= EPS;
  yMax += EPS;
  zMin -= EPS;
  zMax += EPS;

  const pointInShapeFn = isAligned
    ? () => true
    : (pointLPS) => {
        const [x, y, z] = pointLPS;
        const xInside = x >= xMin && x <= xMax;
        const yInside = y >= yMin && y <= yMax;
        const zInside = z >= zMin && z <= zMax;

        return xInside && yInside && zInside;
      };

  const callback = ({ value, index }) => {
    if (segmentsLocked.includes(value)) {
      return;
    }

    segmentationScalarData[index] = segmentIndex;
  };

  pointInShapeCallback(
    segmentationImageData,
    pointInShapeFn,
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
 */
export function fillOutsideRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillRectangle(enabledElement, operationData, false);
}
