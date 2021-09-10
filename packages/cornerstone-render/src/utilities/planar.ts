import { Point3 } from '../types'

/**
 * It calculates the intersection of a line and a plane.
 * Plane equation is Ax+By+Cz=D
 * @param p0 [x,y,z] of the first point of the line
 * @param p1 [x,y,z] of the second point of the line
 * @param plane [A, B, C, D] Plane parameter
 * @returns [X,Y,Z] coordinates of the intersection
 */
function linePlaneIntersection(
  p0: Point3,
  p1: Point3,
  plane: [number, number, number, number]
): Point3 {
  const [x0, y0, z0] = p0
  const [x1, y1, z1] = p1
  const [A, B, C, D] = plane
  const a = x1 - x0
  const b = y1 - y0
  const c = z1 - z0
  const t = (-1 * (A * x0 + B * y0 + C * z0 - D)) / (A * a + B * b + C * c)
  const X = a * t + x0
  const Y = b * t + y0
  const Z = c * t + z0

  return [X, Y, Z]
}

const planar = {
  linePlaneIntersection,
}

export default planar
