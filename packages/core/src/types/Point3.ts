/**
 * This duplicates the typing established in gl-matrix for a vec3
 */
export type Point3 = [number, number, number];

/**
 * Some algorithms use separated values
 */
export type PointsXYZ = {
  x: number[];
  y: number[];
  z: number[];
};

export default Point3;
