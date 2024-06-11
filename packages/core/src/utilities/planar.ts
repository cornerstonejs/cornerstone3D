import { Point3, Plane } from '../types';
import { vec3, mat3 } from 'gl-matrix';

/**
 * It calculates the intersection of a line and a plane.
 * Plane equation is Ax+By+Cz=D
 * @param p0 - [x,y,z] of the first point of the line
 * @param p1 - [x,y,z] of the second point of the line
 * @param plane - [A, B, C, D] Plane parameter: Ax+By+Cz=D
 * @returns - [X,Y,Z] coordinates of the intersection
 */
function linePlaneIntersection(p0: Point3, p1: Point3, plane: Plane): Point3 {
  const [x0, y0, z0] = p0;
  const [x1, y1, z1] = p1;
  const [A, B, C, D] = plane;
  const a = x1 - x0;
  const b = y1 - y0;
  const c = z1 - z0;
  const t = (-1 * (A * x0 + B * y0 + C * z0 - D)) / (A * a + B * b + C * c);
  const X = a * t + x0;
  const Y = b * t + y0;
  const Z = c * t + z0;

  return [X, Y, Z];
}

/**
 * It returns the plane equation defined by a point and a normal vector.
 * @param normal - normal vector
 * @param point - a point on the plane
 * @param normalized - if true, the values of the plane equation will be normalized
 * @returns - [A, B,C, D] of plane equation A*X + B*Y + C*Z = D
 */
function planeEquation(
  normal: Point3,
  point: Point3 | vec3,
  normalized = false
): Plane {
  const [A, B, C] = normal;
  const D = A * point[0] + B * point[1] + C * point[2];

  if (normalized) {
    const length = Math.sqrt(A * A + B * B + C * C);
    return [A / length, B / length, C / length, D / length];
  }

  return [A, B, C, D];
}

/**
 * Computes the intersection of three planes in 3D space with equations:
 * A1*X + B1*Y + C1*Z = D1
 * A2*X + B2*Y + C2*Z = D2
 * A3*X + B3*Y + C3*Z = D3
 * @returns - [x, y, z] the intersection in the world coordinate
 */
function threePlaneIntersection(
  firstPlane: Plane,
  secondPlane: Plane,
  thirdPlane: Plane
): Point3 {
  const [A1, B1, C1, D1] = firstPlane;
  const [A2, B2, C2, D2] = secondPlane;
  const [A3, B3, C3, D3] = thirdPlane;
  const m0 = mat3.fromValues(A1, A2, A3, B1, B2, B3, C1, C2, C3);
  const m1 = mat3.fromValues(D1, D2, D3, B1, B2, B3, C1, C2, C3);
  const m2 = mat3.fromValues(A1, A2, A3, D1, D2, D3, C1, C2, C3);
  const m3 = mat3.fromValues(A1, A2, A3, B1, B2, B3, D1, D2, D3);

  // TODO: handle no intersection scenario
  const x = mat3.determinant(m1) / mat3.determinant(m0);
  const y = mat3.determinant(m2) / mat3.determinant(m0);
  const z = mat3.determinant(m3) / mat3.determinant(m0);
  return [x, y, z];
}

/**
 * Computes the distance of a point in 3D space to a plane
 * @param plane - [A, B, C, D] of plane equation A*X + B*Y + C*Z = D
 * @param point - [A, B, C] the plane in World coordinate
 * @param signed - if true, the distance is signed
 * @returns - the distance of the point to the plane
 * */
function planeDistanceToPoint(
  plane: Plane,
  point: Point3,
  signed = false
): number {
  const [A, B, C, D] = plane;
  const [x, y, z] = point;
  const numerator = A * x + B * y + C * z - D;
  const distance = Math.abs(numerator) / Math.sqrt(A * A + B * B + C * C);
  const sign = signed ? Math.sign(numerator) : 1;
  return sign * distance;
}

export {
  linePlaneIntersection,
  planeEquation,
  threePlaneIntersection,
  planeDistanceToPoint,
};
