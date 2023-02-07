import {
  cache,
  getEnabledElement,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { BaseTool } from '../base';
import { PublicToolProps, ToolProps, EventTypes } from '../../types';

import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import {
  segmentLocking,
  activeSegmentation,
  segmentIndex as segmentIndexController,
} from '../../stateManagement/segmentation';
import floodFill from '../../utilities/segmentation/floodFill';
import { getSegmentation } from '../../stateManagement/segmentation/segmentationState';
import { FloodFillResult, FloodFillGetter } from '../../types';
import { LabelmapSegmentationData } from '../../types/LabelmapTypes';

const { transformWorldToIndex, isEqual } = csUtils;

type PaintFillToolHelpers = {
  getScalarDataPositionFromPlane: (x: number, y: number) => number;
  getLabelValue: (x: number, y: number, z: number) => number;
  floodFillGetter: FloodFillGetter;
  inPlaneSeedPoint: Types.Point2;
  fixedDimensionValue: number;
};

/**
 * Tool for manipulating segmentation data by filling in regions. It acts on the
 * active Segmentation on the viewport (enabled element) and requires an active
 * segmentation to be already present. By default it will fill a given labelled
 * or empty region with the the activeSegmentIndex label. You can use the
 * SegmentationModule to set the active segmentation and segmentIndex.
 */
class PaintFillTool extends BaseTool {
  static toolName;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Based on the current position of the mouse and the enabledElement, it
   * finds the active segmentation info and use it for the current tool.
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  preMouseDownCallback = (evt: EventTypes.InteractionEventType): boolean => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const camera = viewport.getCamera();
    const { viewPlaneNormal } = camera;
    const toolGroupId = this.toolGroupId;

    const activeSegmentationRepresentation =
      activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
    if (!activeSegmentationRepresentation) {
      throw new Error(
        'No active segmentation detected, create one before using scissors tool'
      );
    }

    const { segmentationId, type } = activeSegmentationRepresentation;
    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(segmentationId);
    const segmentsLocked: number[] =
      segmentLocking.getLockedSegments(segmentationId);
    const { representationData } = getSegmentation(segmentationId);

    const { volumeId } = representationData[type] as LabelmapSegmentationData;
    const segmentation = cache.getVolume(volumeId);
    const { scalarData, dimensions, direction } = segmentation;

    const index = transformWorldToIndex(segmentation.imageData, worldPos);

    const fixedDimension = this.getFixedDimension(viewPlaneNormal, direction);

    if (fixedDimension === undefined) {
      console.warn('Oblique paint fill not yet supported');
      return;
    }

    const {
      floodFillGetter,
      getLabelValue,
      getScalarDataPositionFromPlane,
      inPlaneSeedPoint,
      fixedDimensionValue,
    } = this.generateHelpers(scalarData, dimensions, index, fixedDimension);

    // Check if within volume
    if (
      index[0] < 0 ||
      index[0] >= dimensions[0] ||
      index[1] < 0 ||
      index[1] >= dimensions[1] ||
      index[2] < 0 ||
      index[2] >= dimensions[2]
    ) {
      // Clicked outside segmentation volume, no good way to fill.
      return;
    }
    //@ts-ignore // todo type
    const clickedLabelValue = getLabelValue(index[0], index[1], index[2]);

    if (segmentsLocked.includes(clickedLabelValue)) {
      // Label is locked, cannot fill.
      return;
    }

    const floodFillResult = floodFill(floodFillGetter, inPlaneSeedPoint);

    const { flooded } = floodFillResult;

    flooded.forEach((index) => {
      const scalarDataPosition = getScalarDataPositionFromPlane(
        index[0],
        index[1]
      );

      scalarData[scalarDataPosition] = segmentIndex;
    });

    const framesModified = this.getFramesModified(
      fixedDimension,
      fixedDimensionValue,
      floodFillResult
    );

    triggerSegmentationDataModified(segmentationId, framesModified);

    return true;
  };

  private getFramesModified = (
    fixedDimension: number,
    fixedDimensionValue: number,
    floodFillResult: FloodFillResult
  ): number[] => {
    const { boundaries } = floodFillResult;

    if (fixedDimension === 2) {
      return [fixedDimensionValue];
    }

    // For both the fixedDimensions being 0 and 1, the Z (stack) direction is j,
    // so we don't need to find min/max i.

    let minJ = Infinity;
    let maxJ = -Infinity;

    for (let b = 0; b < boundaries.length; b++) {
      const j = boundaries[b][1];

      if (j < minJ) minJ = j;
      if (j > maxJ) maxJ = j;
    }

    const framesModified = [];

    for (let frame = minJ; frame <= maxJ; frame++) {
      framesModified.push(frame);
    }

    return framesModified;
  };

  private generateHelpers = (
    scalarData: Float32Array | Uint8Array,
    dimensions: Types.Point3,
    seedIndex3D: Types.Point3,
    fixedDimension = 2
  ): PaintFillToolHelpers => {
    let fixedDimensionValue: number;
    let inPlaneSeedPoint: Types.Point2;

    switch (fixedDimension) {
      case 0:
        fixedDimensionValue = seedIndex3D[0]; // X
        inPlaneSeedPoint = [seedIndex3D[1], seedIndex3D[2]]; // Y,Z
        break;
      case 1:
        fixedDimensionValue = seedIndex3D[1]; // Y
        inPlaneSeedPoint = [seedIndex3D[0], seedIndex3D[2]]; // X,Z
        break;
      case 2:
        fixedDimensionValue = seedIndex3D[2]; // Z
        inPlaneSeedPoint = [seedIndex3D[0], seedIndex3D[1]]; // X, Y
        break;
      default:
        throw new Error(`Invalid fixedDimension: ${fixedDimension}`);
    }

    const getScalarDataPosition = (x: number, y: number, z: number): number => {
      return z * dimensions[1] * dimensions[0] + y * dimensions[0] + x;
    };

    const getLabelValue = (x: number, y: number, z: number): number => {
      return scalarData[getScalarDataPosition(x, y, z)];
    };

    const floodFillGetter = this.generateFloodFillGetter(
      dimensions,
      fixedDimension,
      fixedDimensionValue,
      getLabelValue
    );

    const getScalarDataPositionFromPlane =
      this.generateGetScalarDataPositionFromPlane(
        getScalarDataPosition,
        fixedDimension,
        fixedDimensionValue
      );

    return {
      getScalarDataPositionFromPlane,
      getLabelValue,
      floodFillGetter,
      inPlaneSeedPoint,
      fixedDimensionValue,
    };
  };

  private getFixedDimension(
    viewPlaneNormal: Types.Point3,
    direction: number[]
  ): number | undefined {
    const xDirection = direction.slice(0, 3);
    const yDirection = direction.slice(3, 6);
    const zDirection = direction.slice(6, 9);

    const absoluteOfViewPlaneNormal = [
      Math.abs(viewPlaneNormal[0]),
      Math.abs(viewPlaneNormal[1]),
      Math.abs(viewPlaneNormal[2]),
    ];

    const absoluteOfXDirection = [
      Math.abs(xDirection[0]),
      Math.abs(xDirection[1]),
      Math.abs(xDirection[2]),
    ];

    if (isEqual(absoluteOfViewPlaneNormal, absoluteOfXDirection)) {
      return 0;
    }

    const absoluteOfYDirection = [
      Math.abs(yDirection[0]),
      Math.abs(yDirection[1]),
      Math.abs(yDirection[2]),
    ];

    if (isEqual(absoluteOfViewPlaneNormal, absoluteOfYDirection)) {
      return 1;
    }

    const absoluteOfZDirection = [
      Math.abs(zDirection[0]),
      Math.abs(zDirection[1]),
      Math.abs(zDirection[2]),
    ];

    if (isEqual(absoluteOfViewPlaneNormal, absoluteOfZDirection)) {
      return 2;
    }
  }

  // Define a getter for the fill routine to access the working label map.
  private generateFloodFillGetter = (
    dimensions: Types.Point3,
    fixedDimension: number,
    fixedDimensionValue: number,
    getLabelValue: PaintFillToolHelpers['getLabelValue']
  ): FloodFillGetter => {
    let floodFillGetter;

    // In each helper we first check if out of bounds, as the flood filler
    // doesn't know about the dimensions of the data structure that sits on top
    // of the scalarData. E.g. if cols is 10, (0,1) and (10, 0) would point to
    // the same position in these getters.

    switch (fixedDimension) {
      case 0:
        floodFillGetter = (y, z) => {
          if (y >= dimensions[1] || y < 0 || z >= dimensions[2] || z < 0) {
            return;
          }

          return getLabelValue(fixedDimensionValue, y, z);
        };
        break;

      case 1:
        floodFillGetter = (x, z) => {
          if (x >= dimensions[0] || x < 0 || z >= dimensions[2] || z < 0) {
            return;
          }

          return getLabelValue(x, fixedDimensionValue, z);
        };
        break;

      case 2:
        floodFillGetter = (x, y) => {
          if (x >= dimensions[0] || x < 0 || y >= dimensions[1] || y < 0) {
            return;
          }

          return getLabelValue(x, y, fixedDimensionValue);
        };
        break;
      default:
        throw new Error(`Invalid fixedDimension: ${fixedDimension}`);
    }

    return floodFillGetter;
  };

  private generateGetScalarDataPositionFromPlane = (
    getScalarDataPosition: (x: number, y: number, z: number) => number,
    fixedDimension: number,
    fixedDimensionValue: number
  ): PaintFillToolHelpers['getScalarDataPositionFromPlane'] => {
    let getScalarDataPositionFromPlane;

    switch (fixedDimension) {
      case 0:
        getScalarDataPositionFromPlane = (y, z) => {
          return getScalarDataPosition(fixedDimensionValue, y, z);
        };
        break;
      case 1:
        getScalarDataPositionFromPlane = (x, z) => {
          return getScalarDataPosition(x, fixedDimensionValue, z);
        };
        break;
      case 2:
        getScalarDataPositionFromPlane = (x, y) => {
          return getScalarDataPosition(x, y, fixedDimensionValue);
        };
        break;
      default:
        throw new Error(`Invalid fixedDimension: ${fixedDimension}`);
    }

    return getScalarDataPositionFromPlane;
  };
}

PaintFillTool.toolName = 'PaintFill';
export default PaintFillTool;
