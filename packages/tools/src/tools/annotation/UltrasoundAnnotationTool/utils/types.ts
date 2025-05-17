import type { Types } from '@cornerstonejs/core';

/**
 * Array of points representing a contour
 */
export type FanShapeContour = Types.Point2[];

/**
 * Fan geometry parameters
 */
export interface FanGeometry {
  center: Types.Point2;
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
}

/**
 * Options for contour export
 */
export interface ContourExportOptions {
  strokeStyle?: string;
  lineWidth?: number;
  quality?: number;
}

/**
 * Options for fan export
 */
export interface FanExportOptions {
  strokeStyle?: string;
  lineWidth?: number;
  quality?: number;
}

/**
 * Four corner points of the fan shape
 */
export interface FanShapeCorners {
  P1: Types.Point2;
  P2: Types.Point2;
  P3: Types.Point2;
  P4: Types.Point2;
}

/**
 * Result of image buffer extraction
 */
export interface ImageBufferResult {
  imageBuffer: Types.PixelDataTypedArray;
  width: number;
  height: number;
}

/**
 * Options for corner refinement
 */
export interface RefinementOptions {
  maxDist?: number;
  step?: number;
}
