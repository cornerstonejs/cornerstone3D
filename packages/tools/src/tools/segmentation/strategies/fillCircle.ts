import { vec3 } from 'gl-matrix';
import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  getCanvasEllipseCorners,
  precalculatePointInEllipse,
} from '../../../utilities/math/ellipse';
import { getBoundingBoxAroundShapeIJK } from '../../../utilities/boundingBox';
import BrushStrategy from './BrushStrategy';
import type { Composition, InitializedOperationData } from './BrushStrategy';
import type { CanvasCoordinates } from '../../../types';
import { StrategyCallbacks } from '../../../enums';
import compositions from './compositions';
import { pointInSphere } from '../../../utilities/math/sphere';

const { transformWorldToIndex, isEqual } = csUtils;

const initializeCircle = {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      points, // bottom, top, left, right
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

    const circleCornersIJK = points.map((world) => {
      return transformWorldToIndex(segmentationImageData, world);
    });

    // get the bounds from the circle points since in oblique images the
    // circle will not be axis aligned
    const boundsIJK = getBoundingBoxAroundShapeIJK(
      circleCornersIJK,
      segmentationImageData.getDimensions()
    );

    segmentationVoxelManager.boundsIJK = boundsIJK;
    imageVoxelManager.isInObject = createPointInEllipse({
      topLeftWorld,
      bottomRightWorld,
      center,
    });
  },
} as Composition;

/**
 * Creates a function that tells the user if the provided point in LPS space
 * is inside the ellipse.
 *
 * This will return a sphere test function if the bounds are a circle or
 * sphere shape (same radius in two or three dimensions), or an elliptical shape
 * if they differ.
 */
function createPointInEllipse(worldInfo: {
  topLeftWorld: Types.Point3;
  bottomRightWorld: Types.Point3;
  center: Types.Point3 | vec3;
}) {
  const { topLeftWorld, bottomRightWorld, center } = worldInfo;

  const xRadius = Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2;
  const yRadius = Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2;
  const zRadius = Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2;

  const radius = Math.max(xRadius, yRadius, zRadius);
  if (
    isEqual(xRadius, radius) &&
    isEqual(yRadius, radius) &&
    isEqual(zRadius, radius)
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

  const { precalculated } = precalculatePointInEllipse(ellipseObj, {});
  return precalculated;
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
  createPointInEllipse as createEllipseInPoint,
};
