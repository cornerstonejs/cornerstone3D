import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import {
  getCanvasEllipseCorners,
  pointInEllipse,
} from '../../../utilities/math/ellipse';
import { getBoundingBoxAroundShape } from '../../../utilities/boundingBox';
import BrushStrategy from './BrushStrategy';
import type { OperationData, InitializedOperationData } from './BrushStrategy';
import dynamicWithinThreshold from './utils/initializeDynamicThreshold';
import type { CanvasCoordinates } from '../../../types';
import initializeIslandRemoval from './utils/initializeIslandRemoval';
import initializeRegionFill from './utils/initializeRegionFill';
import initializeSetValue from './utils/initializeSetValue';
import initializePreview from './utils/initializePreview';
import initializeThreshold from './utils/initializeThreshold';

const { transformWorldToIndex } = csUtils;

const initializeSphere = {
  createInitialized: function intializeSphere(
    enabledElement,
    operationData: InitializedOperationData
  ): void {
    const {
      points,
      imageVoxelValue,
      viewport,
      segmentationImageData,
      segmentationVoxelValue,
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

    segmentationVoxelValue.boundsIJK = getBoundingBoxAroundShape(
      ellipsoidCornersIJK,
      segmentationVoxelValue.dimensions
    );

    // using circle as a form of ellipse
    const ellipseObj = {
      center: center as Types.Point3,
      xRadius: Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2,
      yRadius: Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2,
      zRadius: Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2,
    };

    imageVoxelValue.isInObject = (pointLPS /*, pointIJK */) =>
      pointInEllipse(ellipseObj, pointLPS);
  },
};

const SPHERE_STRATEGY = new BrushStrategy(
  'Sphere',
  initializeRegionFill,
  initializeSetValue,
  initializeSphere
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
  initializeRegionFill,
  initializeSetValue,
  initializeSphere,
  dynamicWithinThreshold,
  initializeThreshold,
  initializePreview,
  initializeIslandRemoval
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
export function fillOutsideSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  throw new Error('fill outside sphere not implemented');
}

export {
  SPHERE_STRATEGY,
  SPHERE_THRESHOLD_STRATEGY,
  fillInsideSphere,
  thresholdInsideSphere,
};
