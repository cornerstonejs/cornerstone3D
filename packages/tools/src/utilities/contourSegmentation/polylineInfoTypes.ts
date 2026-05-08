import type { Types } from '@cornerstonejs/core';

export type PolylineInfoWorld = {
  polyline: Types.Point3[];
  viewReference: Types.ViewReference;
};

export type PolylineInfoCanvas = {
  polyline: Types.Point2[];
  viewReference: Types.ViewReference;
};
