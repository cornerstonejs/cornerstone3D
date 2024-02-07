import type { Types } from '@cornerstonejs/core';
import { PlanarFreehandROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';

// Note: These types are internal to the drawing/editing processes of the tool.

type PlanarFreehandROIDrawData = {
  polylineIndex: number;
  canvasPoints: Types.Point2[];
  contourHoleProcessingEnabled: boolean;
};

type PlanarFreehandROIEditData = {
  prevCanvasPoints: Types.Point2[];
  editCanvasPoints: Types.Point2[];
  fusedCanvasPoints: Types.Point2[];
  startCrossingIndex?: Types.Point2;
  // The current index of the last node added to the (invisible) edit line being
  // used to calculate the edit preview.
  editIndex: number;
  // The index on the prevCanvasPoints that the edit line should snap to in the
  // edit preview.
  snapIndex?: number;
};

type PlanarFreehandROICommonData = {
  annotation: PlanarFreehandROIAnnotation;
  viewportIdsToRender: string[];
  spacing: Types.Point2;
  xDir: Types.Point3;
  yDir: Types.Point3;
  movingTextBox?: boolean;
};

export {
  PlanarFreehandROIDrawData,
  PlanarFreehandROIEditData,
  PlanarFreehandROICommonData,
};
