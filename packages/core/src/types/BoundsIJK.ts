import type Point2 from './Point2';

/**
 * The bounds of the voxel manager in IJK space.
 * The bounds are an array of three arrays, each containing two numbers.
 * The first number is the minimum value and the second number is the maximum value.
 * The first array is the x-axis bounds, the second array is the y-axis bounds, and the third array is the z-axis bounds.
 */
type BoundsIJK = [Point2, Point2, Point2];

export type { BoundsIJK as default };
