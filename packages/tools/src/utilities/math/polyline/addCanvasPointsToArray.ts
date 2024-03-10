import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec2, vec3 } from 'gl-matrix';
import { PlanarFreehandROICommonData } from './planarFreehandROIInternalTypes';

/**
 * Adds one or more points to the array at a resolution defined by the underlying image.
 */
const addCanvasPointsToArray = (
  element: HTMLDivElement,
  canvasPoints: Types.Point2[],
  newCanvasPoint: Types.Point2,
  commonData: PlanarFreehandROICommonData
): number => {
  const { xDir, yDir, spacing } = commonData;
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  if (!canvasPoints.length) {
    canvasPoints.push(newCanvasPoint);
    console.log('>>>>> !canvasPoints. :: RETURN');
    return 1;
  }

  const lastWorldPos = viewport.canvasToWorld(
    canvasPoints[canvasPoints.length - 1]
  );
  const newWorldPos = viewport.canvasToWorld(newCanvasPoint);
  const worldPosDiff = vec3.create();

  vec3.subtract(worldPosDiff, newWorldPos, lastWorldPos);

  const xDist = Math.abs(vec3.dot(worldPosDiff, xDir));
  const yDist = Math.abs(vec3.dot(worldPosDiff, yDir));

  const numPointsToAdd = Math.max(
    Math.floor(xDist / spacing[0]),
    Math.floor(yDist / spacing[0])
  );

  if (numPointsToAdd > 1) {
    const lastCanvasPoint = canvasPoints[canvasPoints.length - 1];

    const canvasDist = vec2.dist(lastCanvasPoint, newCanvasPoint);

    const canvasDir = vec2.create();

    vec2.subtract(canvasDir, newCanvasPoint, lastCanvasPoint);

    vec2.set(canvasDir, canvasDir[0] / canvasDist, canvasDir[1] / canvasDist);

    const distPerPoint = canvasDist / numPointsToAdd;

    for (let i = 1; i <= numPointsToAdd; i++) {
      canvasPoints.push([
        lastCanvasPoint[0] + distPerPoint * canvasDir[0] * i,
        lastCanvasPoint[1] + distPerPoint * canvasDir[1] * i,
      ]);
    }
  } else {
    canvasPoints.push(newCanvasPoint);
  }

  return numPointsToAdd;
};

export default addCanvasPointsToArray;
