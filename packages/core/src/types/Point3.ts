/**
 * This duplicates the typing established in gl-matrix for a vec3
 */
export type Point3 = [number, number, number];

/**
 * Some algorithms use separated values
 */
export interface PointsXYZ {
  x: number[];
  y: number[];
  z: number[];
}

export type { Point3 as default };
