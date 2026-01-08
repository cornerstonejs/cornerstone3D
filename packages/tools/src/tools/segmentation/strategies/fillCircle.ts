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

  const top = vec3.create();
  vec3.scaleAndAdd(top, centerVec, viewUp, yRadius);

  const bottom = vec3.create();
  vec3.scaleAndAdd(bottom, centerVec, viewUp, -yRadius);

  const right = vec3.create();
  vec3.scaleAndAdd(right, centerVec, viewRight, xRadius);

  const left = vec3.create();
  vec3.scaleAndAdd(left, centerVec, viewRight, -xRadius);

  return [
    bottom as Types.Point3,
    top as Types.Point3,
    left as Types.Point3,
    right as Types.Point3,
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
      if ((dx * dx) / xRadiusSquared + (dy * dy) / yRadiusSquared <= 1) {
        return true;
      }
    }

    for (const { start, vector, lengthSquared } of segments) {
      if (lengthSquared === 0) {
        const dx = worldPoint[0] - start[0];
        const dy = worldPoint[1] - start[1];
        const dz = worldPoint[2] - start[2];
        if ((dx * dx) / xRadiusSquared + (dy * dy) / yRadiusSquared <= 1) {
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
        (distX * distX) / xRadiusSquared + (distY * distY) / yRadiusSquared <=
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
  } = {}
) {
  if (!cornersInWorld || cornersInWorld.length !== 4) {
    throw new Error('createPointInEllipse: cornersInWorld must have 4 points');
  }
  const [topLeft, bottomRight, bottomLeft, topRight] = cornersInWorld;

  const aspectRatio = options.aspectRatio || [1, 1];

  // Center is the midpoint of the diagonal
  const center = vec3.create();
  vec3.add(center, topLeft, bottomRight);
  vec3.scale(center, center, 0.5);

  //Calculate a SINGLE original radius to ensure the base shape is a circle.
  // We'll use the width (major axis) as the definitive diameter.
  const majorAxisVec = vec3.create();
  vec3.subtract(majorAxisVec, topRight, topLeft);
  const originalRadius = vec3.length(majorAxisVec) / 2;
  vec3.normalize(majorAxisVec, majorAxisVec); // This is the 'X' direction vector

  // We still need the minor axis for its direction, but not its length.
  const minorAxisVec = vec3.create();
  vec3.subtract(minorAxisVec, bottomLeft, topLeft);
  vec3.normalize(minorAxisVec, minorAxisVec); // This is the 'Y' direction vector

  //Apply the inverse aspect ratio stretch CORRECTLY and ALWAYS the same way.
  // To counteract the viewport's stretching and make the shape appear circular,
  // we must "pre-squash" it in world space.
  const xRadius = originalRadius / aspectRatio[0];
  const yRadius = originalRadius / aspectRatio[1];

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
          pointIJK as Types.Point3
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
        pointIJK as Types.Point3
      ) as Types.Point3;
    }

    if (!worldPoint) {
      return false;
    }

    if (strokePredicate?.(worldPoint)) {
      return true;
    }

    // Project point onto the plane so we can evaluate the ellipse equation in
    // plane coordinates. We do this once per sample; previously the repeated
    // conversions happened on callers for every interpolated point.
    const pointVec = vec3.create();
    vec3.subtract(pointVec, worldPoint, center);
    const x = vec3.dot(pointVec, majorAxisVec);
    const y = vec3.dot(pointVec, minorAxisVec);

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
  createPointInEllipse,
  createPointInEllipse as createEllipseInPoint,
};
