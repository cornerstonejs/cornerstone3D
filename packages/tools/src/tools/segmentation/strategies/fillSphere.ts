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
const { transformWorldToIndex } = csUtils;
import { getSphereBoundsInfoFromViewport } from '../../../utilities/getSphereBoundsInfo';
import type { CanvasCoordinates } from '../../../types';

const sphereComposition = {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const { points, viewport, segmentationImageData } = operationData;

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

    const { boundsIJK: newBoundsIJK } = getSphereBoundsInfoFromViewport(
      points.slice(0, 2) as [Types.Point3, Types.Point3],
      segmentationImageData,
      viewport
    );
    const canvasCoordinates = points.map((p) =>
      viewport.worldToCanvas(p)
    ) as CanvasCoordinates;

    // 1. From the drawn tool: Get the ellipse (circle) corners in canvas coordinates
    const corners = getEllipseCornersFromCanvasCoordinates(canvasCoordinates);
    const cornersInWorld = corners.map((corner) =>
      viewport.canvasToWorld(corner)
    );

    operationData.isInObjectBoundsIJK = newBoundsIJK;
    operationData.isInObject = createEllipseInPoint(cornersInWorld);
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
