import type { Point2 } from '../../../types';
import type { CameraScaleMode } from '../ViewportCameraTypes';

export type PlanarScaleInput = number | Point2;
export type PlanarScale = Point2;

export const MIN_PLANAR_SCALE = 0.001;

const PLANAR_SCALE_MODES = new Set<string>([
  'fit',
  'fitAspect',
  'fitWidth',
  'fitHeight',
  'absolute',
]);

function normalizeScaleValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(value, MIN_PLANAR_SCALE)
    : 1;
}

export function normalizePlanarScale(scale?: PlanarScaleInput): PlanarScale {
  if (Array.isArray(scale)) {
    return [normalizeScaleValue(scale[0]), normalizeScaleValue(scale[1])];
  }

  const scalarScale = normalizeScaleValue(scale);

  return [scalarScale, scalarScale];
}

export function clonePlanarScale(scale?: PlanarScaleInput): PlanarScale {
  return normalizePlanarScale(scale);
}

export function getPlanarScaleZoom(scale?: PlanarScaleInput): number {
  return normalizePlanarScale(scale)[1];
}

export function normalizePlanarScaleMode(scaleMode?: string): CameraScaleMode {
  return PLANAR_SCALE_MODES.has(scaleMode || '')
    ? (scaleMode as CameraScaleMode)
    : 'fit';
}

export function getPlanarScaleRatio(scale?: PlanarScaleInput): number {
  const [scaleX, scaleY] = normalizePlanarScale(scale);

  return scaleX / scaleY;
}
