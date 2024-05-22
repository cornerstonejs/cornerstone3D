import { StrategyCallbacks } from '../../../../enums';
import type { Composition, InitializedOperationData } from '../BrushStrategy';
import { vec3 } from 'gl-matrix';
import { Types, utilities as csUtils } from '@cornerstonejs/core';
import type { CanvasCoordinates } from '../../../../utilities/math/ellipse/getCanvasEllipseCorners';
import { getCanvasEllipseCorners } from '../../../../utilities/math/ellipse';
import { getBoundingBoxAroundShapeIJK } from '../../../../utilities/boundingBox';
import { createPointInEllipse } from './createPointInEllipse';

const { transformWorldToIndex } = csUtils;

export const initializeCircle = {
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
