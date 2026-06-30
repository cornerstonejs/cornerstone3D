import { vec3 } from 'gl-matrix';
import type { ReadonlyVec3 } from 'gl-matrix';
import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

import { getBoundingBoxAroundShapeIJK } from '../../../utilities/boundingBox';
import BrushStrategy from './BrushStrategy';
import type { Composition, InitializedOperationData } from './BrushStrategy';
import type { CanvasCoordinates } from '../../../types';
import { StrategyCallbacks } from '../../../enums';
import compositions from './compositions';
import { pointInSphere } from '../../../utilities/math/sphere';

const {
  transformWorldToIndex,
  transformIndexToWorld,
  isEqual,
  getNormalizedAspectRatio,
} = csUtils;

const VOXEL_CENTER_OFFSET = 0.5;

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

function createCircleCornersForCenter(
  center: Types.Point3,
  viewUp: ReadonlyVec3,
  viewRight: ReadonlyVec3,
  yRadius: number,
  xRadius: number
): Types.Point3[] {
  const centerVec = vec3.fromValues(center[0], center[1], center[2]);

  // Top-Right
  const topRight = vec3.create();
  vec3.scaleAndAdd(topRight, centerVec, viewUp, yRadius);
  vec3.scaleAndAdd(topRight, topRight, viewRight, xRadius);

  // Top-Left
  const topLeft = vec3.create();
  vec3.scaleAndAdd(topLeft, centerVec, viewUp, yRadius);
  vec3.scaleAndAdd(topLeft, topLeft, viewRight, -xRadius);

  // Bottom-Right
  const bottomRight = vec3.create();
  vec3.scaleAndAdd(bottomRight, centerVec, viewUp, -yRadius);
  vec3.scaleAndAdd(bottomRight, bottomRight, viewRight, xRadius);

  // Bottom-Left
  const bottomLeft = vec3.create();
  vec3.scaleAndAdd(bottomLeft, centerVec, viewUp, -yRadius);
  vec3.scaleAndAdd(bottomLeft, bottomLeft, viewRight, -xRadius);

  return [
    topRight as Types.Point3,
    topLeft as Types.Point3,
    bottomRight as Types.Point3,
    bottomLeft as Types.Point3,
  ];
}

// Build a lightweight capsule predicate that covers every sampled point and
// the straight segment in between. The previous approach re-ran the brush
// strategy for many intermediate samples, which was unnecessarily expensive
// and still missed fast mouse moves. This predicate lets us describe the full
// swept volume in constant time per segment when the strategy runs.
function createStrokePredicate(
  centers: Types.Point3[],
  xRadius: number,
  yRadius: number
) {
  if (!centers.length || xRadius <= 0 || yRadius <= 0) {
    return null;
  }

  const xRadiusSquared = xRadius * xRadius;
  const yRadiusSquared = yRadius * yRadius;
  const centerVecs = centers.map(
    (point) => [point[0], point[1], point[2]] as Types.Point3
  );
  const segments = [] as Array<{
    start: Types.Point3;
    vector: [number, number, number];
    lengthSquared: number;
  }>;

  for (let i = 1; i < centerVecs.length; i++) {
    const start = centerVecs[i - 1];
    const end = centerVecs[i];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const lengthSquared = dx * dx + dy * dy + dz * dz;

    segments.push({ start, vector: [dx, dy, dz], lengthSquared });
  }

  return (worldPoint: Types.Point3) => {
    if (!worldPoint) {
      return false;
    }

    for (const centerVec of centerVecs) {
      const dx = worldPoint[0] - centerVec[0];
      const dy = worldPoint[1] - centerVec[1];
      const dz = worldPoint[2] - centerVec[2];
      if (
        (dx * dx) / xRadiusSquared + (dy * dy) / yRadiusSquared + dz * dz <=
        1
      ) {
        return true;
      }
    }

    for (const { start, vector, lengthSquared } of segments) {
      if (lengthSquared === 0) {
        const dx = worldPoint[0] - start[0];
        const dy = worldPoint[1] - start[1];
        const dz = worldPoint[2] - start[2];
        if (
          (dx * dx) / xRadiusSquared + (dy * dy) / yRadiusSquared + dz * dz <=
          1
        ) {
          return true;
        }
        continue;
      }

      const dx = worldPoint[0] - start[0];
      const dy = worldPoint[1] - start[1];
      const dz = worldPoint[2] - start[2];
      const dot = dx * vector[0] + dy * vector[1] + dz * vector[2];
      const t = Math.max(0, Math.min(1, dot / lengthSquared));

      const projX = start[0] + vector[0] * t;
      const projY = start[1] + vector[1] * t;
      const projZ = start[2] + vector[2] * t;
      const distX = worldPoint[0] - projX;
      const distY = worldPoint[1] - projY;
      const distZ = worldPoint[2] - projZ;

      if (
        (distX * distX) / xRadiusSquared +
          (distY * distY) / yRadiusSquared +
          distZ * distZ <=
        1
      ) {
        return true;
      }
    }

    return false;
  };
}

const initializeCircle = {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      points, // bottom, top, left, right
      viewport,
      segmentationImageData,
      viewUp,
      viewPlaneNormal,
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

    // Get your aspect ratio values
    const aspectRatio = getNormalizedAspectRatio(viewport.getAspectRatio());

    const yRadius =
      points.length >= 2
        ? vec3.distance(points[0], points[1]) / 2 / aspectRatio[1]
        : 0;

    const xRadius =
      points.length >= 2
        ? vec3.distance(points[2], points[3]) / 2 / aspectRatio[0]
        : 0;

    const canvasCoordinates = points.map((p) =>
      viewport.worldToCanvas(p)
    ) as CanvasCoordinates;

    // 1. From the drawn tool: Get the ellipse (circle) corners in canvas coordinates
    const corners = getEllipseCornersFromCanvasCoordinates(canvasCoordinates);
    const cornersInWorld = corners.map((corner) =>
      viewport.canvasToWorld(corner)
    );

    const normalizedViewUp = vec3.fromValues(viewUp[0], viewUp[1], viewUp[2]);
    vec3.normalize(normalizedViewUp, normalizedViewUp);

    const normalizedPlaneNormal = vec3.fromValues(
      viewPlaneNormal[0],
      viewPlaneNormal[1],
      viewPlaneNormal[2]
    );
    vec3.normalize(normalizedPlaneNormal, normalizedPlaneNormal);

    const viewRight = vec3.create();
    vec3.cross(viewRight, normalizedViewUp, normalizedPlaneNormal);
    vec3.normalize(viewRight, viewRight);

    // Build a set of explicit stroke centers. When we only looked at the last
    // sample, quick cursor moves left holes behind. Feeding the full segment
    // gives us deterministic coverage regardless of device speed.
    const strokeCentersSource =
      operationData.strokePointsWorld &&
      operationData.strokePointsWorld.length > 0
        ? operationData.strokePointsWorld
        : [operationData.centerWorld];

    const strokeCenters = strokeCentersSource.map(
      (point) => vec3.clone(point) as Types.Point3
    );

    const strokeCornersWorld = strokeCenters.flatMap((centerPoint) =>
      createCircleCornersForCenter(
        centerPoint,
        normalizedViewUp,
        viewRight,
        yRadius,
        xRadius
      )
    );

    const circleCornersIJK = strokeCornersWorld.map((world) =>
      transformWorldToIndex(segmentationImageData, world)
    );

    const boundsIJK = getBoundingBoxAroundShapeIJK(
      circleCornersIJK,
      segmentationImageData.getDimensions()
    );

    operationData.strokePointsWorld = strokeCenters;
    operationData.isInObject = createPointInEllipse(cornersInWorld, {
      strokePointsWorld: strokeCenters,
      segmentationImageData,
      xRadius,
      yRadius,
      aspectRatio,
      viewRight,
      viewUp: normalizedViewUp,
      viewNormal: normalizedPlaneNormal,
    });

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
function createPointInEllipse(
  cornersInWorld: Types.Point3[] = [],
  options: {
    strokePointsWorld?: Types.Point3[];
    segmentationImageData?: vtkImageData;
    xRadius?: number;
    yRadius?: number;
    aspectRatio?: [number, number];
    viewRight?: vec3;
    viewUp?: vec3;
    viewNormal?: vec3;
  } = {}
) {
  if (!cornersInWorld || cornersInWorld.length !== 4) {
    throw new Error('createPointInEllipse: cornersInWorld must have 4 points');
  }
  const [topLeft, bottomRight, , topRight] = cornersInWorld;

  const aspectRatio = options.aspectRatio || [1, 1];
  const segmentationImageData = options.segmentationImageData;
  const { viewRight, viewUp, viewNormal } = options;

  const toVoxelCenterIJK = (pointIJK: Types.Point3): Types.Point3 =>
    [
      pointIJK[0] + VOXEL_CENTER_OFFSET,
      pointIJK[1] + VOXEL_CENTER_OFFSET,
      pointIJK[2] + VOXEL_CENTER_OFFSET,
    ] as Types.Point3;

  const spacing = segmentationImageData?.getSpacing?.();
  const direction = segmentationImageData?.getDirection?.();

  const spacingInNormal =
    spacing && direction
      ? csUtils.getSpacingInNormalDirection(
          { spacing, direction },
          viewNormal as Types.Point3
        )
      : Math.max(spacing?.[2] ?? 1, Number.EPSILON);

  const planeTolerance = Math.max(spacingInNormal / 2, Number.EPSILON);

  // Center is the midpoint of the diagonal
  const center = vec3.create();
  vec3.add(center, topLeft, bottomRight);
  vec3.scale(center, center, 0.5);

  // Calculate a SINGLE original radius to ensure the base shape is a circle.
  // We'll use the width (major axis) as the definitive diameter. Only the
  // length is needed here; the in-plane directions come from viewRight/viewUp.
  const majorAxisVec = vec3.create();
  vec3.subtract(majorAxisVec, topRight, topLeft);
  const originalRadius = vec3.length(majorAxisVec) / 2;

  //Apply the inverse aspect ratio stretch CORRECTLY and ALWAYS the same way.
  // To counteract the viewport's stretching and make the shape appear circular,
  // we must "pre-squash" it in world space.
  const xRadius = originalRadius / aspectRatio[0];
  const yRadius = originalRadius / aspectRatio[1];
  const invXRadiusSquared = 1 / (xRadius * xRadius);
  const invYRadiusSquared = 1 / (yRadius * yRadius);

  // If radii are equal, treat as sphere
  const xRadiusForStroke = options.xRadius ?? xRadius;
  const yRadiusForStroke = options.yRadius ?? yRadius;
  const strokePredicate = createStrokePredicate(
    options.strokePointsWorld || [],
    xRadiusForStroke,
    yRadiusForStroke
  );

  if (isEqual(xRadius, yRadius)) {
    const radius = xRadius;
    const sphereObj = {
      center,
      radius,
      radius2: radius * radius,
    };
    return (pointLPS: Types.Point3 | null, pointIJK?: Types.Point3) => {
      let worldPoint: Types.Point3 | null = pointLPS;

      // When the iterator only supplies IJK coordinates we reconstruct the
      // world position once here instead of forcing callers to do the
      // conversion (the previous code re-did this work on every sample).
      if (!worldPoint && pointIJK && options.segmentationImageData) {
        worldPoint = transformIndexToWorld(
          options.segmentationImageData,
          toVoxelCenterIJK(pointIJK as Types.Point3)
        ) as Types.Point3;
      }

      if (!worldPoint) {
        return false;
      }

      if (strokePredicate?.(worldPoint)) {
        return true;
      }

      return pointInSphere(sphereObj, worldPoint);
    };
  }

  // Otherwise, treat as ellipse in oblique plane
  return (pointLPS: Types.Point3 | null, pointIJK?: Types.Point3) => {
    let worldPoint: Types.Point3 | null = pointLPS;

    if (!worldPoint && pointIJK && options.segmentationImageData) {
      worldPoint = transformIndexToWorld(
        options.segmentationImageData,
        toVoxelCenterIJK(pointIJK as Types.Point3)
      ) as Types.Point3;
    }

    if (!worldPoint) {
      return false;
    }

    // Get the vector from the center of the brush to the current voxel
    const pointVec = vec3.create();
    vec3.subtract(pointVec, worldPoint, center);

    // Project that vector onto the screen's Right and Up axes
    // This tells us how far 'left/right' and 'up/down' the voxel is on the screen
    const xDist = vec3.dot(pointVec, viewRight);
    const yDist = vec3.dot(pointVec, viewUp);

    // Use the Ellipse Equation with the specific xRadius and yRadius
    // Ellipse equation: (x/xRadius)^2 + (y/yRadius)^2 <= 1
    const xTerm = xDist * xDist * invXRadiusSquared;
    const yTerm = yDist * yDist * invYRadiusSquared;

    if (xTerm + yTerm <= 1) {
      // Depth Check (Z-axis)
      // Ensure the voxel is physically close to the plane we are looking at
      const zDist = Math.abs(vec3.dot(pointVec, viewNormal));

      return zDist <= planeTolerance;
    }

    return false;
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
  createPointInEllipse,
  createPointInEllipse as createEllipseInPoint,
};
