import type { Point3 } from '../types';

export default function clonePoint3(point: ArrayLike<number>): Point3;
export default function clonePoint3(
  point?: ArrayLike<number>
): Point3 | undefined;
export default function clonePoint3(
  point?: ArrayLike<number>
): Point3 | undefined {
  return point ? ([point[0], point[1], point[2]] as Point3) : undefined;
}
