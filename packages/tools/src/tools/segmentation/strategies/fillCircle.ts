import { vec3 } from 'gl-matrix';
import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  getCanvasEllipseCorners,
  pointInEllipse,
} from '../../../utilities/math/ellipse';
import pointInSphere from '../../../utilities/math/sphere/pointInSphere';
import { getBoundingBoxAroundShape } from '../../../utilities/boundingBox';
import BrushStrategy from './BrushStrategy';
import type { Composition, InitializedOperationData } from './BrushStrategy';
import type { CanvasCoordinates } from '../../../types';
import { StrategyCallbacks } from '../../../enums';
import compositions from './compositions';

const { transformWorldToIndex } = csUtils;
const EPSILON = 1e-4;
const nearOrZero = (testValue, nearValue) =>
  Math.abs(testValue) < EPSILON || Math.abs(testValue - nearValue) < EPSILON;

const initializeCircle = {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      points,
      imageVoxelManager: imageVoxelManager,
      viewport,
      segmentationImageData,
      segmentationVoxelManager: segmentationVoxelManager,
    } = operationData;

    // Happens on a preview setup
    if (!points) {
      return;
    }
    // Average the points to get the center of the ellipse
    const center = vec3.fromValues(0, 0, 0);
    points.forEach((point) => {
      vec3.add(center, center, point);
    });
    vec3.scale(center, center, 1 / points.length);

    operationData.centerWorld = center as Types.Point3;
    operationData.centerIJK = transformWorldToIndex(
      segmentationImageData,
      center as Types.Point3
    );
    const canvasCoordinates = points.map((p) =>
      viewport.worldToCanvas(p)
    ) as CanvasCoordinates;

    // 1. From the drawn tool: Get the ellipse (circle) topLeft and bottomRight
    // corners in canvas coordinates
    const [topLeftCanvas, bottomRightCanvas] =
      getCanvasEllipseCorners(canvasCoordinates);

    // 2. Find the extent of the ellipse (circle) in IJK index space of the image
    const topLeftWorld = viewport.canvasToWorld(topLeftCanvas);
    const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas);

    const ellipsoidCornersIJK = [
      <Types.Point3>transformWorldToIndex(segmentationImageData, topLeftWorld),
      <Types.Point3>(
        transformWorldToIndex(segmentationImageData, bottomRightWorld)
      ),
    ];

    segmentationVoxelManager.boundsIJK = getBoundingBoxAroundShape(
      ellipsoidCornersIJK,
      segmentationVoxelManager.dimensions
    );
    imageVoxelManager.isInObject = createEllipseInPoint({
      topLeftWorld,
      bottomRightWorld,
      center,
    });
  },
} as Composition;

function createEllipseInPoint(worldInfo) {
  const { topLeftWorld, bottomRightWorld, center } = worldInfo;

  const xRadius = Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2;
  const yRadius = Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2;
  const zRadius = Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2;

  const radius = Math.max(xRadius, yRadius, zRadius);
  if (
    nearOrZero(xRadius, radius) &&
    nearOrZero(yRadius, radius) &&
    nearOrZero(zRadius, radius)
  ) {
    const sphereObj = {
      center,
      radius,
      radius2: radius * radius,
    };
    return (pointLPS) => pointInSphere(sphereObj, pointLPS);
  }
  // using circle as a form of ellipse
  const ellipseObj = {
    center: center as Types.Point3,
    xRadius,
    yRadius,
    zRadius,
  };
  const inverts = pointInEllipse.precalculateInverts(ellipseObj);
  const { precalculated } = pointInEllipse;

  return (pointLPS /*, pointIJK */) =>
    precalculated(ellipseObj, pointLPS, inverts);
}

const CIRCLE_STRATEGY = new BrushStrategy(
  'Circle',
  compositions.regionFill,
  compositions.setValue,
  initializeCircle,
  compositions.determineSegmentIndex,
  compositions.preview
);

const CIRCLE_THRESHOLD_STRATEGY = new BrushStrategy(
  'CircleThreshold',
  compositions.regionFill,
  compositions.setValue,
  initializeCircle,
  compositions.determineSegmentIndex,
  compositions.dynamicThreshold,
  compositions.threshold,
  compositions.preview,
  compositions.islandRemoval
);

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
const fillInsideCircle = CIRCLE_STRATEGY.strategyFunction;

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
const thresholdInsideCircle = CIRCLE_THRESHOLD_STRATEGY.strategyFunction;

/**
 * Fill outside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels outside the  defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function fillOutsideCircle(): void {
  throw new Error('Not yet implemented');
}

export {
  CIRCLE_STRATEGY,
  CIRCLE_THRESHOLD_STRATEGY,
  fillInsideCircle,
  thresholdInsideCircle,
  createEllipseInPoint,
};
