import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

type Line = [Types.Point3, Types.Point3];

/**
 * It returns the angle between two lines in degrees.
 * @param line1 - Line = [p1, p2]
 * @param line2 - Line = [p3, p4]
 * @returns The angle between two lines in degrees.
 */
export default function angleBetweenLines(line1: Line, line2: Line): number {
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
