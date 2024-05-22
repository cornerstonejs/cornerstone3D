import { StrategyCallbacks } from '../../../../enums';
import type { Composition, InitializedOperationData } from '../BrushStrategy';
import { vec3 } from 'gl-matrix';
import { Types, utilities as csUtils } from '@cornerstonejs/core';
import { getBoundingBoxAroundShapeIJK } from '../../../../utilities/boundingBox';

const { transformWorldToIndex } = csUtils;

export const initializeArea = {
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
    operationData.centerIJK = center as Types.Point3;

    const [xSize, ySize, zSize] = segmentationImageData.getDimensions();

    const circleCornersIJK = points.map((world, index) => {
      if (
        viewport.options.orientation === 'axial' ||
        viewport.options.orientation === 'acquisition'
      ) {
        let worldPoint: Types.Point3;

        switch (index) {
          // Bottom center coordinate
          case 0:
            worldPoint = [0, -ySize / 2, world[2]];
            break;
          // Top center coordinate
          case 1:
            worldPoint = [0, ySize / 2, world[2]];
            break;
          // Left center coordinate
          case 2:
            worldPoint = [-xSize / 2, 0, world[2]];
            break;
          // Right center coordinate
          case 3:
            worldPoint = [xSize / 2, 0, world[2]];
            break;
        }
        return transformWorldToIndex(segmentationImageData, worldPoint);
      } else if (viewport.options.orientation === 'sagittal') {
        let worldPoint: Types.Point3;

        switch (index) {
          // Bottom center coordinate
          case 0:
            worldPoint = [world[0], 3000, -600];
            break;
          // Top center coordinate
          case 1:
            worldPoint = [world[0], -2000, 0];
            break;
          // Left center coordinate
          case 2:
            worldPoint = [world[0], 0, zSize];
            break;
          // Right center coordinate
          case 3:
            worldPoint = [world[0], 0, -zSize];
            break;
        }
        return transformWorldToIndex(segmentationImageData, worldPoint);
      } else if (viewport.options.orientation === 'coronal') {
        let worldPoint: Types.Point3;

        switch (index) {
          // Bottom center coordinate
          case 0:
            worldPoint = [0, world[1], -1000];
            break;
          // Top center coordinate
          case 1:
            worldPoint = [0, world[1], 1000];
            break;
          // Left center coordinate
          case 2:
            worldPoint = [-xSize, world[1], 0];
            break;
          // Right center coordinate
          case 3:
            worldPoint = [xSize, world[1], 0];
            break;
        }
        return transformWorldToIndex(segmentationImageData, worldPoint);
      }

      return transformWorldToIndex(segmentationImageData, world);
    });

    // get the bounds from the circle points since in oblique images the
    // circle will not be axis aligned
    segmentationVoxelManager.boundsIJK = getBoundingBoxAroundShapeIJK(
      circleCornersIJK,
      segmentationImageData.getDimensions()
    );
    imageVoxelManager.isInObject = () => true;
  },
} as Composition;
