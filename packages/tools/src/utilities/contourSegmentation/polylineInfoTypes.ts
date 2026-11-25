import type { Types } from '@cornerstonejs/core';

export type PolylineInfoWorld = {
  polyline: Types.Point3[];
  viewReference: Types.ViewReference;
  /** Hole polylines in world space (child contours with opposite winding). */
  holePolylines?: Types.Point3[][];
};

export type PolylineInfoCanvas = {
  polyline: Types.Point2[];
  viewReference: Types.ViewReference;
  /** Hole polylines in canvas space (child contours with opposite winding). */
  holePolylines?: Types.Point2[][];
};
