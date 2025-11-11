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

    const baseExtent = getSphereBoundsInfoFromViewport(
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

    const aspectRatio = viewport?.getAspectRatio?.() || [1, 1];

    const yRadius =
      points.length >= 2
        ? vec3.distance(points[0], points[1]) / 2 / aspectRatio[1]
        : 0;

    const xRadius =
      points.length >= 2
        ? vec3.distance(points[2], points[3]) / 2 / aspectRatio[0]
        : 0;

    const strokeCenters =
      operationData.strokePointsWorld &&
      operationData.strokePointsWorld.length > 0
        ? operationData.strokePointsWorld
        : [operationData.centerWorld];

    // The original implementation recalculated the expensive sphere bounds for
    // every interpolated point. That repeats a handful of world-to-index
    // conversions per sample, which adds up quickly during fast brushes. We
    // know each stroke point simply translates the same sphere, so we can reuse
    // the base bounds and slide them by the delta in IJK space instead.
    const baseBounds = baseExtent.boundsIJK;
    const baseCenterIJK = operationData.centerIJK;
    const boundsForStroke = strokeCenters.reduce<Types.BoundsIJK | null>(
      (acc, centerPoint) => {
        if (!centerPoint) {
          return acc;
        }

        const translatedCenterIJK = transformWorldToIndex(
          segmentationImageData,
          centerPoint as Types.Point3
        );
        const deltaIJK = [
          translatedCenterIJK[0] - baseCenterIJK[0],
          translatedCenterIJK[1] - baseCenterIJK[1],
          translatedCenterIJK[2] - baseCenterIJK[2],
        ];

        const translatedBounds: Types.BoundsIJK = [
          [baseBounds[0][0] + deltaIJK[0], baseBounds[0][1] + deltaIJK[0]],
          [baseBounds[1][0] + deltaIJK[1], baseBounds[1][1] + deltaIJK[1]],
          [baseBounds[2][0] + deltaIJK[2], baseBounds[2][1] + deltaIJK[2]],
        ];

        if (!acc) {
          return translatedBounds;
        }

        return [
          [
            Math.min(acc[0][0], translatedBounds[0][0]),
            Math.max(acc[0][1], translatedBounds[0][1]),
          ],
          [
            Math.min(acc[1][0], translatedBounds[1][0]),
            Math.max(acc[1][1], translatedBounds[1][1]),
          ],
          [
            Math.min(acc[2][0], translatedBounds[2][0]),
            Math.max(acc[2][1], translatedBounds[2][1]),
          ],
        ] as Types.BoundsIJK;
      },
      null
    );

    const boundsToUse = boundsForStroke ?? baseExtent.boundsIJK;

    if (segmentationImageData) {
      const dimensions = segmentationImageData.getDimensions();
      // Clamp once at the end to keep the bounds valid for downstream
      // iteration. We were clamping each partial result previously, which was
      // redundant and still left us doing extra work when a drag crossed the
      // image edges.
      operationData.isInObjectBoundsIJK = [
        [
          Math.max(0, Math.min(boundsToUse[0][0], dimensions[0] - 1)),
          Math.max(0, Math.min(boundsToUse[0][1], dimensions[0] - 1)),
        ],
        [
          Math.max(0, Math.min(boundsToUse[1][0], dimensions[1] - 1)),
          Math.max(0, Math.min(boundsToUse[1][1], dimensions[1] - 1)),
        ],
        [
          Math.max(0, Math.min(boundsToUse[2][0], dimensions[2] - 1)),
          Math.max(0, Math.min(boundsToUse[2][1], dimensions[2] - 1)),
        ],
      ] as Types.BoundsIJK;
    } else {
      operationData.isInObjectBoundsIJK = boundsToUse;
    }

    operationData.isInObject = createEllipseInPoint(cornersInWorld, {
      strokePointsWorld: operationData.strokePointsWorld,
      segmentationImageData,
      xRadius,
      yRadius,
      aspectRatio,
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
