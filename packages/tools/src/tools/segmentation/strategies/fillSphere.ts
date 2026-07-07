import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import BrushStrategy from './BrushStrategy';
import type { InitializedOperationData, Composition } from './BrushStrategy';
import compositions from './compositions';
import StrategyCallbacks from '../../../enums/StrategyCallbacks';
import {
  createEllipseInPoint,
  getEllipseCornersFromCanvasCoordinates,
} from './fillCircle';
import { createSphereObliqueIntegerFill } from './utils/obliqueIntegerFill';
const { transformWorldToIndex, getNormalizedAspectRatio } = csUtils;
import { getSphereBoundsInfoFromViewport } from '../../../utilities/getSphereBoundsInfo';
import type { CanvasCoordinates } from '../../../types';

const sphereComposition = {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const { points, viewport, segmentationImageData, viewUp, viewPlaneNormal } =
      operationData;

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

    const aspectRatio = getNormalizedAspectRatio(viewport.getAspectRatio());

    const yRadius =
      points.length >= 2
        ? vec3.distance(points[0], points[1]) / 2 / aspectRatio[1]
        : 0;

    const xRadius =
      points.length >= 2
        ? vec3.distance(points[2], points[3]) / 2 / aspectRatio[0]
        : 0;

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

    // Calculate radius in world units
    const radiusWorld = vec3.distance(points[0], points[1]) / 2;

    // Get the center in IJK
    const centerIJK = transformWorldToIndex(
      segmentationImageData,
      center as Types.Point3
    );

    // Get the spacing of the volume to convert world radius to IJK "radius"
    const spacing = segmentationImageData.getSpacing();
    const radiusIJK = [
      radiusWorld / spacing[0],
      radiusWorld / spacing[1],
      radiusWorld / spacing[2],
    ];

    // Define bounds that always encompass the sphere
    const boundsIJK = [
      [
        Math.floor(centerIJK[0] - radiusIJK[0]),
        Math.ceil(centerIJK[0] + radiusIJK[0]),
      ],
      [
        Math.floor(centerIJK[1] - radiusIJK[1]),
        Math.ceil(centerIJK[1] + radiusIJK[1]),
      ],
      [
        Math.floor(centerIJK[2] - radiusIJK[2]),
        Math.ceil(centerIJK[2] + radiusIJK[2]),
      ],
    ];

    operationData.isInObjectBoundsIJK = boundsIJK as Types.BoundsIJK;

    operationData.isInObject = createEllipseInPoint(cornersInWorld, {
      strokePointsWorld: operationData.strokePointsWorld,
      segmentationImageData,
      xRadius,
      yRadius,
      aspectRatio,
      viewRight,
      viewUp: normalizedViewUp,
      viewNormal: normalizedPlaneNormal,
    });

    operationData.obliqueIntegerFill = createSphereObliqueIntegerFill({
      viewUp: normalizedViewUp as Types.Point3,
      viewPlaneNormal: normalizedPlaneNormal as Types.Point3,
      centerIJK,
      segmentationImageData,
      radiusWorld,
    });
    // }
  },
} as Composition;

const SPHERE_STRATEGY = new BrushStrategy(
  'Sphere',
  compositions.regionFill,
  compositions.setValue,
  sphereComposition,
  compositions.determineSegmentIndex,
  compositions.preview,
  compositions.labelmapStatistics,
  compositions.ensureSegmentationVolumeFor3DManipulation
);

/**
 * Fill inside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param enabledElement - The element that is enabled and selected.
 * @param operationData - OperationData
 */
const fillInsideSphere = SPHERE_STRATEGY.strategyFunction;

const SPHERE_THRESHOLD_STRATEGY = new BrushStrategy(
  'SphereThreshold',
  ...SPHERE_STRATEGY.compositions,
  compositions.dynamicThreshold,
  compositions.threshold,
  compositions.ensureSegmentationVolumeFor3DManipulation,
  compositions.ensureImageVolumeFor3DManipulation
);

const SPHERE_THRESHOLD_STRATEGY_ISLAND = new BrushStrategy(
  'SphereThreshold',
  ...SPHERE_STRATEGY.compositions,
  compositions.dynamicThreshold,
  compositions.threshold,
  compositions.islandRemoval,
  compositions.ensureSegmentationVolumeFor3DManipulation,
  compositions.ensureImageVolumeFor3DManipulation
);

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being filled.
 * @param operationData - EraseOperationData
 */

const thresholdInsideSphere = SPHERE_THRESHOLD_STRATEGY.strategyFunction;
const thresholdInsideSphereIsland =
  SPHERE_THRESHOLD_STRATEGY_ISLAND.strategyFunction;

/**
 * Fill outside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param enabledElement - The element that is enabled and selected.
 * @param operationData - OperationData
 */
export function fillOutsideSphere(): void {
  throw new Error('fill outside sphere not implemented');
}

export {
  fillInsideSphere,
  thresholdInsideSphere,
  SPHERE_STRATEGY,
  thresholdInsideSphereIsland,
};
