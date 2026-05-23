import { vec3 } from 'gl-matrix';
import type { Point3 } from '../../../types';

export function getSafeCanvasDimension(value: number): number {
  return Math.max(value || 0, 1);
}

export function normalizePoint3(point: Point3, fallback?: Point3): Point3 {
  const normalized = vec3.normalize(
    vec3.create(),
    point as unknown as vec3
  ) as Point3;

  if (
    fallback &&
    (!Number.isFinite(normalized[0]) ||
      !Number.isFinite(normalized[1]) ||
      !Number.isFinite(normalized[2]) ||
      vec3.length(normalized as unknown as vec3) === 0)
  ) {
    return vec3.clone(fallback as unknown as vec3) as Point3;
  }

  return normalized;
}
