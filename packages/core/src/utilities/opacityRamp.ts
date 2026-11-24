import type { OpacityMapping } from '../types/Colormap';

/**
 * What decides the alpha of a value on every render path: the scalar
 * `opacity` of the appearance, the `opacityMapping` and the `threshold` of
 * its colormap.
 */
export interface OpacityRamp {
  opacity?: number;
  opacityMapping?: readonly OpacityMapping[];
  threshold?: number | null;
}

/**
 * The points, value and alpha, of the opacity function of a layer, by the
 * one rule of every render path: the alpha of a value is
 * `opacity * ramp(value)`, where `ramp` is the opacity mapping (1 everywhere
 * without one), and 0 below the threshold. Between two points the function is
 * linear and past the first and the last it is constant, as a vtk.js
 * piecewise function and its texture.
 *
 * The points of a mapping keep their values, so a window level change keeps
 * them. Without a mapping the function is flat over `range`, the range of the
 * data (0 to 1 when not given). A threshold steps from 0 to
 * `opacity * ramp(threshold)` over a thousandth of the span of the function,
 * so that a texture of the function keeps the step.
 *
 * @param ramp - The opacity, the mapping and the threshold.
 * @param range - The range of the data, the domain of a function without a mapping.
 * @returns The points, sorted by value.
 */
export function getOpacityRampPoints(
  ramp: OpacityRamp,
  range?: [number, number]
): Array<[number, number]> {
  const opacity = clampToUnit(ramp.opacity ?? 1);
  const mapping = ramp.opacityMapping?.length
    ? [...ramp.opacityMapping].sort((a, b) => a.value - b.value)
    : undefined;
  const lower = mapping ? mapping[0].value : (range?.[0] ?? 0);
  const upper = mapping
    ? mapping[mapping.length - 1].value
    : (range?.[1] ?? Math.max(lower, 1));
  const points: Array<[number, number]> = mapping
    ? mapping.map(({ value, opacity: alpha }) => [
        value,
        opacity * clampToUnit(alpha),
      ])
    : [
        [lower, opacity],
        [upper, opacity],
      ];
  const { threshold } = ramp;

  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
    return points;
  }

  const step = Math.abs(upper - lower) * 0.001 || 0.001;
  const below: Array<[number, number]> =
    lower < threshold - step ? [[lower, 0]] : [];

  return [
    ...below,
    [threshold - step, 0],
    [threshold, getOpacityRampValue(points, threshold)],
    ...points.filter(([value]) => value > threshold),
  ];
}

/**
 * The alpha of a value by points of `getOpacityRampPoints`: linear between
 * two points, constant past the first and the last.
 */
export function getOpacityRampValue(
  points: ReadonlyArray<[number, number]>,
  value: number
): number {
  if (!points.length) {
    return 1;
  }

  if (value <= points[0][0]) {
    return points[0][1];
  }

  for (let index = 1; index < points.length; index++) {
    const [previousValue, previousAlpha] = points[index - 1];
    const [nextValue, nextAlpha] = points[index];

    if (value <= nextValue) {
      const span = nextValue - previousValue;
      const t = span > 0 ? (value - previousValue) / span : 1;

      return previousAlpha + (nextAlpha - previousAlpha) * t;
    }
  }

  return points[points.length - 1][1];
}

/**
 * Whether a ramp makes the alpha depend on the value: a mapping or a
 * threshold.
 */
export function hasOpacityRamp(ramp: OpacityRamp | undefined): boolean {
  return Boolean(
    ramp?.opacityMapping?.length ||
      (typeof ramp?.threshold === 'number' && Number.isFinite(ramp.threshold))
  );
}

function clampToUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}
