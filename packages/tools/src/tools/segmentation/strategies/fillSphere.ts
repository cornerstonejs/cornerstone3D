import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import {
  getCanvasEllipseCorners,
  pointInEllipse,
} from '../../../utilities/math/ellipse';
import { getBoundingBoxAroundShape } from '../../../utilities/boundingBox';
import BrushStrategy from './BrushStrategy';
import type { InitializedOperationData, Composition } from './BrushStrategy';
import type { CanvasCoordinates } from '../../../types';
import compositions from './compositions';
import StrategyCallbacks from '../../../enums/StrategyCallbacks';

const { transformWorldToIndex } = csUtils;

const sphereComposition = {
  [StrategyCallbacks.initialize]: function intializeSphere(
    operationData: InitializedOperationData
  ): void {
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
    // This will be 2d, now expand to 3d
    const diameters = topLeftWorld.map((left, index) =>
      Math.abs(bottomRightWorld[index] - left)
    );
    const radius = Math.max(...diameters) / 2;
    // Make 3d sphere
    topLeftWorld.forEach((left, index) => {
      const right = bottomRightWorld[index];
      if (left === right) {
        topLeftWorld[index] = left - radius;
        bottomRightWorld[index] = left + radius;
      }
    });

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

    // using circle as a form of ellipse
    const ellipseObj = {
      center: center as Types.Point3,
      xRadius: Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2,
      yRadius: Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2,
      zRadius: Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2,
    };

    imageVoxelManager.isInObject = (pointLPS /*, pointIJK */) =>
      pointInEllipse(ellipseObj, pointLPS);
  },
} as Composition;

const SPHERE_STRATEGY = new BrushStrategy(
  'Sphere',
  compositions.regionFill,
  compositions.setValue,
  sphereComposition,
  compositions.determineSegmentIndex,
  compositions.preview
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
  compositions.islandRemoval
);

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being filled.
 * @param operationData - EraseOperationData
 */

const thresholdInsideSphere = SPHERE_THRESHOLD_STRATEGY.strategyFunction;

/**
 * Fill outside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param enabledElement - The element that is enabled and selected.
 * @param operationData - OperationData
 */
export function fillOutsideSphere(): void {
  throw new Error('fill outside sphere not implemented');
}

export { fillInsideSphere, thresholdInsideSphere, SPHERE_STRATEGY };
