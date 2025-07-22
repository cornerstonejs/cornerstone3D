import { vec3 } from 'gl-matrix';
import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { getBoundingBoxAroundShapeIJK } from '../../../utilities/boundingBox';
import BrushStrategy from './BrushStrategy';
import type { Composition, InitializedOperationData } from './BrushStrategy';
import type { CanvasCoordinates } from '../../../types';
import { StrategyCallbacks } from '../../../enums';
import compositions from './compositions';
import { pointInSphere } from '../../../utilities/math/sphere';

const { transformWorldToIndex, isEqual } = csUtils;

/**
 * Returns the corners of an ellipse in canvas coordinates.
 * The corners are returned in the order: topLeft, bottomRight, bottomLeft, topRight.
 *
 * @param canvasCoordinates - The coordinates of the ellipse in the canvas.
 * @returns An array of four points representing the corners of the ellipse.
 */
export function getEllipseCornersFromCanvasCoordinates(
  canvasCoordinates: CanvasCoordinates
): Array<Types.Point2> {
  const [bottom, top, left, right] = canvasCoordinates;
  const topLeft = <Types.Point2>[left[0], top[1]];
  const bottomRight = <Types.Point2>[right[0], bottom[1]];
  const bottomLeft = <Types.Point2>[left[0], bottom[1]];
  const topRight = <Types.Point2>[right[0], top[1]];
  return [topLeft, bottomRight, bottomLeft, topRight];
}

const initializeCircle = {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      points, // bottom, top, left, right
      viewport,
      segmentationImageData,
    } = operationData;

    // Happens on a preview setup
    if (!points) {
      return;
    }

    // Calculate the center as the midpoint between the first two points
    // That calculation serves both for orthogonal and oblique planes
    const center = vec3.create();
    if (points.length >= 2) {
      vec3.add(center, points[0], points[1]);
      vec3.scale(center, center, 0.5);
    } else {
      // Fallback to the first point if less than 2 points are provided
      vec3.copy(center, points[0]);
    }

    operationData.centerWorld = center as Types.Point3;
    operationData.centerIJK = transformWorldToIndex(
      segmentationImageData,
      center as Types.Point3
    );

    const canvasCoordinates = points.map((p) =>
      viewport.worldToCanvas(p)
    ) as CanvasCoordinates;

    // 1. From the drawn tool: Get the ellipse (circle) corners in canvas coordinates
    const corners = getEllipseCornersFromCanvasCoordinates(canvasCoordinates);
    const cornersInWorld = corners.map((corner) =>
      viewport.canvasToWorld(corner)
    );
    // 2. Find the extent of the ellipse (circle) in IJK index space of the image
    const circleCornersIJK = points.map((world) => {
      return transformWorldToIndex(segmentationImageData, world);
    });

    // get the bounds from the circle points since in oblique images the
    // circle will not be axis aligned
    const boundsIJK = getBoundingBoxAroundShapeIJK(
      circleCornersIJK,
      segmentationImageData.getDimensions()
    );

    // 3. Derives the ellipse function from the corners
    operationData.isInObject = createPointInEllipse(cornersInWorld);

    operationData.isInObjectBoundsIJK = boundsIJK;
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
function createPointInEllipse(cornersInWorld: Types.Point3[] = []) {
  if (!cornersInWorld || cornersInWorld.length !== 4) {
    throw new Error('createPointInEllipse: cornersInWorld must have 4 points');
  }
  const [topLeft, bottomRight, bottomLeft, topRight] = cornersInWorld;

  // Center is the midpoint of the diagonal
  const center = vec3.create();
  vec3.add(center, topLeft, bottomRight);
  vec3.scale(center, center, 0.5);

  // Major axis: from topLeft to topRight
  const majorAxisVec = vec3.create();
  vec3.subtract(majorAxisVec, topRight, topLeft);
  const xRadius = vec3.length(majorAxisVec) / 2;
  vec3.normalize(majorAxisVec, majorAxisVec);

  // Minor axis: from topLeft to bottomLeft
  const minorAxisVec = vec3.create();
  vec3.subtract(minorAxisVec, bottomLeft, topLeft);
  const yRadius = vec3.length(minorAxisVec) / 2;
  vec3.normalize(minorAxisVec, minorAxisVec);

  // Plane normal
  const normal = vec3.create();
  vec3.cross(normal, majorAxisVec, minorAxisVec);
  vec3.normalize(normal, normal);

  // If radii are equal, treat as sphere
  if (isEqual(xRadius, yRadius)) {
    const radius = xRadius;
    const sphereObj = {
      center,
      radius,
      radius2: radius * radius,
    };
    return (pointLPS) => pointInSphere(sphereObj, pointLPS);
  }

  // Otherwise, treat as ellipse in oblique plane
  return (pointLPS: Types.Point3) => {
    // Project point onto the plane
    const pointVec = vec3.create();
    vec3.subtract(pointVec, pointLPS, center);
    // Remove component along normal
    const distToPlane = vec3.dot(pointVec, normal);
    const proj = vec3.create();
    vec3.scaleAndAdd(proj, pointVec, normal, -distToPlane);

    // Express proj in (majorAxis, minorAxis) coordinates
    // Project from center, so shift origin to topLeft
    const fromTopLeft = vec3.create();
    const centerToTopLeft = vec3.create();
    vec3.subtract(centerToTopLeft, center, topLeft);
    vec3.subtract(fromTopLeft, proj, centerToTopLeft);
    const x = vec3.dot(fromTopLeft, majorAxisVec);
    const y = vec3.dot(fromTopLeft, minorAxisVec);

    // Ellipse equation: (x/xRadius)^2 + (y/yRadius)^2 <= 1
    return (x * x) / (xRadius * xRadius) + (y * y) / (yRadius * yRadius) <= 1;
  };
}

const CIRCLE_STRATEGY = new BrushStrategy(
  'Circle',
  compositions.regionFill,
  compositions.setValue,
  initializeCircle,
  compositions.determineSegmentIndex,
  compositions.preview,
  compositions.labelmapStatistics
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
  compositions.islandRemoval,
  compositions.labelmapStatistics
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
