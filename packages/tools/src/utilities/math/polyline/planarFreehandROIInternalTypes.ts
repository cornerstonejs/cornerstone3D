import type { Types } from '@cornerstonejs/core';
import { PlanarFreehandROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';

// Note: These types are internal to the drawing/editing processes of the tool.

type PlanarFreehandROIDrawData = {
  polylineIndex: number;
  canvasPoints: Types.Point2[];
};

type PlanarFreehandROICommonEditData = {
  prevCanvasPoints: Types.Point2[];
  editCanvasPoints: Types.Point2[];
  fusedCanvasPoints: Types.Point2[];
  startCrossingIndex?: Types.Point2;
  editIndex: number;
  snapIndex?: number;
};

type PlanarFreehandROICommonData = {
  annotation: PlanarFreehandROIAnnotation;
  viewportIdsToRender: string[];
  spacing: Types.Point2;
  xDir: Types.Point3;
  yDir: Types.Point3;
};

export {
  PlanarFreehandROIDrawData,
  PlanarFreehandROICommonEditData,
  PlanarFreehandROICommonData,
};
