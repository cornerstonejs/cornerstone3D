import VOILUTFunctionType from '../enums/VOILUTFunctionType';
import { logit } from './logit';
import * as windowLevelUtil from './windowLevel';

const Y_EPS = 1e-6;

export type ViewportVoiMappingProps = {
  voiRange: { lower: number; upper: number };
  VOILUTFunction?: string | VOILUTFunctionType;
};

/**
 * Maps a stored scalar to a normalized display intensity in [0, 1] using the same
 * convention as VTK RGB transfer functions (linear) or DICOM sigmoid (sampled).
 */
export function mapScalarToViewportVoiIntensity(
  value: number,
  props: ViewportVoiMappingProps
): number {
  const { lower, upper } = props.voiRange;
  const span = upper - lower;
  const fn = props.VOILUTFunction as string | undefined;

  if (fn === VOILUTFunctionType.SAMPLED_SIGMOID || fn === 'SIGMOID') {
    const { windowCenter, windowWidth } = windowLevelUtil.toWindowLevel(
      lower,
      upper
    );
    const w = Math.max(Math.abs(windowWidth), 1e-12);
    return 1 / (1 + Math.exp((-4 * (value - windowCenter)) / w));
  }

  if (span === 0 || !Number.isFinite(span)) {
    return 0;
  }
  return clamp01((value - lower) / span);
}

/**
 * Inverse map: normalized intensity Y in (0, 1) back to stored scalar.
 * Endpoints Y=0 and Y=1 map to lower and upper for linear modes.
 */
export function mapViewportVoiIntensityToScalar(
  mapped01: number,
  props: ViewportVoiMappingProps
): number {
  const { lower, upper } = props.voiRange;
  const fn = props.VOILUTFunction as string | undefined;
  const y = clamp01(mapped01);

  if (fn === VOILUTFunctionType.SAMPLED_SIGMOID || fn === 'SIGMOID') {
    const { windowCenter, windowWidth } = windowLevelUtil.toWindowLevel(
      lower,
      upper
    );
    const yy = clamp(y, Y_EPS, 1 - Y_EPS);
    return logit(yy, windowCenter, windowWidth);
  }

  const span = upper - lower;
  if (span === 0 || !Number.isFinite(span)) {
    return lower;
  }
  return lower + y * span;
}

/**
 * Converts a tolerance band in mapped [0,1] space to raw [rawMin, rawMax] (ordered).
 */
export function mapMappedBandToRawRange(
  mappedMin: number,
  mappedMax: number,
  props: ViewportVoiMappingProps
): { rawMin: number; rawMax: number } {
  const a = Math.min(mappedMin, mappedMax);
  const b = Math.max(mappedMin, mappedMax);
  const rawAtA = mapViewportVoiIntensityToScalar(a, props);
  const rawAtB = mapViewportVoiIntensityToScalar(b, props);
  return {
    rawMin: Math.min(rawAtA, rawAtB),
    rawMax: Math.max(rawAtA, rawAtB),
  };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) {
    return 0;
  }
  return clamp(x, 0, 1);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
