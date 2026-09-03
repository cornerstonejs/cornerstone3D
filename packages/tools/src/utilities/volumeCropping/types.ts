import type { Types } from '@cornerstonejs/core';

/**
 * ClippingPlane represents a plane used for volume cropping.
 * It consists of an origin point and a normal vector.
 */
export type ClippingPlane = {
  origin: Types.Point3;
  normal: Types.Point3;
};
