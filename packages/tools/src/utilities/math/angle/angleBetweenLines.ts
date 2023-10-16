import type { Types } from '@cornerstonejs/core';
import { vec2, vec3 } from 'gl-matrix';

type Line2D = [Types.Point2, Types.Point2];
type Line3D = [Types.Point3, Types.Point3];
type Line = Line2D | Line3D;

/**
 * Calculates the angle between two 3D lines.
 */
function angleBetween3DLines(line1: Line3D, line2: Line3D): number {
  const [p1, p2] = line1;
  const [p3, p4] = line2;

  const v1 = vec3.sub(vec3.create(), p2, p1);
  const v2 = vec3.sub(vec3.create(), p3, p4);

  const dot = vec3.dot(v1, v2);

  const v1Length = vec3.length(v1);
  const v2Length = vec3.length(v2);

  const cos = dot / (v1Length * v2Length);

  const radian = Math.acos(cos);

  return (radian * 180) / Math.PI;
}

/**
 * Calculates the angle between two 2D lines.
 */
function angleBetween2DLines(line1: Line2D, line2: Line2D): number {
  const [p1, p2] = line1;
  const [p3, p4] = line2;

  const v1 = vec2.sub(vec2.create(), p2, p1);
  const v2 = vec2.sub(vec2.create(), p3, p4);

  const dot = vec2.dot(v1, v2);
  const v1Length = vec2.length(v1);
  const v2Length = vec2.length(v2);

  const cos = dot / (v1Length * v2Length);
  return Math.acos(cos) * (180 / Math.PI);
}

/**
 * Returns the angle between two lines in degrees.
 * The angle measured is that between the vectors
 * line1[1]->line1[0] AND line2[0]->line2[1].
 * @param line1 - Line = [p1, p2]
 * @param line2 - Line = [p3, p4]
 * @returns The angle between two lines in degrees.
 */
export default function angleBetweenLines(line1: Line, line2: Line): number {
  const is3D = line1[0].length === 3;
  return is3D
    ? angleBetween3DLines(line1 as Line3D, line2 as Line3D)
    : angleBetween2DLines(line1 as Line2D, line2 as Line2D);
}
