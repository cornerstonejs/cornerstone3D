import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { NumberVoxelManager } from '@cornerstonejs/core/utilities';
import type { ViewportVoiMappingForTool } from '../getViewportVoiMappingForVolume';
import type { FloodFillIntensityRangeResult } from '../floodFillIntensityRangeTypes';

const { transformWorldToIndex, mapMappedBandToRawRange } = csUtils;
const { growCutLog } = csUtils.logger;

/** Display-byte tolerance: fallbacks and “near disk end” use ±this many levels (not % of span). */
const DISPLAY_BAND_FALLBACK_ABS = 5;

/**
 * Display-intensity byte 0…255 from canvas `ImageData` RGBA at offset `i` (red channel index).
 * Uses BT.601 luma on 8-bit channels (for R=G=B grayscale this equals that channel).
 */
function renderedDisplayByte255(data: Uint8ClampedArray, i: number): number {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const y = r * 0.299 + g * 0.587 + b * 0.114;
  return Math.max(0, Math.min(255, Math.round(y)));
}

/** Debug: sorted rendered display bytes; remove or gate when done debugging. */
function logCanvasDiskSampledPixelValues(
  sortedDisplayBytes: number[],
  detail: Record<string, unknown>
): void {
  const uniqueSorted = [...new Set(sortedDisplayBytes)].sort((a, b) => a - b);
  growCutLog.debug('canvasDisk rendered display bytes (sorted 0–255)', {
    sortedLength: sortedDisplayBytes.length,
    sortedDisplayBytes,
    uniqueSorted,
    uniqueCount: uniqueSorted.length,
    ...detail,
  });
  console.info(
    '[cornerstone-tools] canvasDiskIntensityRange sorted display bytes 0..255',
    sortedDisplayBytes
  );
  console.info(
    '[cornerstone-tools] canvasDiskIntensityRange unique display bytes',
    uniqueSorted
  );
  console.info('[cornerstone-tools] canvasDiskIntensityRange detail', detail);
}

type CanvasDiskOptions = {
  viewport: Types.IViewport;
  canvasPoint: { x: number; y: number };
  canvasDiskRadiusPx: number;
  voi: ViewportVoiMappingForTool;
  worldPosition: Types.Point3;
};

/** Tri-class runs on normalized display intensity in [0, 1] (rendered byte ÷ 255). */
/**
 * A forward (or backward) step must exceed this multiple of the mean prior non-zero
 * step to count as leaving the “within” cluster (large first derivative / elbow).
 */
const ELBOW_SLOPE_MULTIPLIER = 2.75;
/** Require this many prior non-zero gaps before an elbow can fire. */
const ELBOW_MIN_PRIOR_STEPS = 2;

/**
 * Elbows can sit on adjacent quantized luma levels → tiny mapped width → one voxel after
 * inverse VOI. Widen to at least this absolute width in [0,1] and this fraction of the
 * disk luma span so flood fill tolerates real scalar variation under the disk.
 */
const MIN_MAPPED_BAND_ABS = 0.022;
const MIN_MAPPED_BAND_REL_SPAN = 0.16;

/**
 * After inverse VOI, ensure raw band is at least this fraction of global volume span
 * (secondary guard if mapping is very steep).
 */
const MIN_RAW_BAND_FRAC_VOL_SPAN = 0.0035;

function widenMappedBandForFloodFill(
  dLoIn: number,
  dHiIn: number,
  center: number,
  vmin: number,
  vmax: number
): { dLo: number; dHi: number } {
  let lo = Math.min(dLoIn, dHiIn, center);
  let hi = Math.max(dLoIn, dHiIn, center);
  const span = vmax - vmin || 1;
  const minW = Math.max(
    MIN_MAPPED_BAND_ABS,
    span * MIN_MAPPED_BAND_REL_SPAN,
    DISPLAY_BAND_FALLBACK_ABS / 255
  );

  if (hi - lo >= minW) {
    return { dLo: lo, dHi: hi };
  }

  const mid = (lo + hi) / 2;
  lo = mid - minW / 2;
  hi = mid + minW / 2;
  if (lo < vmin) {
    hi += vmin - lo;
    lo = vmin;
  }
  if (hi > vmax) {
    lo -= hi - vmax;
    hi = vmax;
  }
  lo = Math.max(vmin, lo);
  hi = Math.min(vmax, hi);
  lo = Math.min(lo, center);
  hi = Math.max(hi, center);
  if (hi - lo < minW) {
    const deficit = minW - (hi - lo);
    lo = Math.max(vmin, lo - deficit / 2);
    hi = Math.min(vmax, hi + deficit / 2);
  }

  if (lo > hi) {
    const t = lo;
    lo = hi;
    hi = t;
  }
  return { dLo: lo, dHi: hi };
}

/** Six consecutive unique levels centered on `iu` (index into `uniqueSorted`). */
function computeSeedMeanGapFromSixUniques(
  uniqueSorted: number[],
  iu: number
): number {
  const n = uniqueSorted.length;
  if (n < 2) {
    return 1;
  }
  const iC = Math.min(Math.max(iu, 0), n - 1);
  const loIx = Math.max(0, iC - 2);
  const hiIx = Math.min(n - 1, iC + 3);
  const gaps: number[] = [];
  for (let j = loIx; j < hiIx; j++) {
    const g = uniqueSorted[j + 1] - uniqueSorted[j];
    if (g > 0) {
      gaps.push(g);
    }
  }
  if (gaps.length === 0) {
    return 1;
  }
  return gaps.reduce((a, b) => a + b, 0) / gaps.length;
}

function elbowLowByteInUnique(
  uniqueSorted: number[],
  iu: number,
  seedMeanGap: number,
  vmin: number,
  vmax: number,
  centerByte: number
): number {
  const n = uniqueSorted.length;
  let cntG = 0;
  const startI = Math.min(Math.max(iu, 0), n - 1);
  for (let i = startI; i >= 1; i--) {
    const g = uniqueSorted[i] - uniqueSorted[i - 1];
    if (g <= 0) {
      continue;
    }
    if (
      cntG >= ELBOW_MIN_PRIOR_STEPS &&
      g > seedMeanGap * ELBOW_SLOPE_MULTIPLIER
    ) {
      return uniqueSorted[i];
    }
    cntG += 1;
  }
  return Math.max(vmin, centerByte - DISPLAY_BAND_FALLBACK_ABS);
}

function elbowHighByteInUnique(
  uniqueSorted: number[],
  iu: number,
  seedMeanGap: number,
  vmin: number,
  vmax: number,
  centerByte: number
): number {
  const n = uniqueSorted.length;
  let cntG = 0;
  const startI = Math.min(Math.max(iu, 0), n - 1);
  for (let i = startI; i < n - 1; i++) {
    const g = uniqueSorted[i + 1] - uniqueSorted[i];
    if (g <= 0) {
      continue;
    }
    if (
      cntG >= ELBOW_MIN_PRIOR_STEPS &&
      g > seedMeanGap * ELBOW_SLOPE_MULTIPLIER
    ) {
      return uniqueSorted[i];
    }
    cntG += 1;
  }
  return Math.min(vmax, centerByte + DISPLAY_BAND_FALLBACK_ABS);
}

function toMapped01(b: number): number {
  return Math.min(1, Math.max(0, b / 255));
}

/**
 * Tri-class band on **sorted unique** display bytes. Seed slope = mean gap across six consecutive
 * unique levels around the click; elbows compare walks along uniques to that seed. Clicks at
 * display white (255) / black (0) or at the disk max/min pin the band to that entire display end.
 */
function mappedTriClassBandFromUniqueDisplayValues(
  uniqueSorted: number[],
  centerByte: number
): { dLo: number; dHi: number } {
  const n = uniqueSorted.length;
  const vminU = uniqueSorted[0];
  const vmaxU = uniqueSorted[n - 1];

  if (n === 1) {
    const b = uniqueSorted[0];
    if (b >= 255) {
      return { dLo: toMapped01(255 - DISPLAY_BAND_FALLBACK_ABS), dHi: 1 };
    }
    if (b <= 0) {
      return { dLo: 0, dHi: toMapped01(DISPLAY_BAND_FALLBACK_ABS) };
    }
    return {
      dLo: toMapped01(b - DISPLAY_BAND_FALLBACK_ABS),
      dHi: toMapped01(b + DISPLAY_BAND_FALLBACK_ABS),
    };
  }

  let iu = -1;
  for (let i = 0; i < n; i++) {
    if (uniqueSorted[i] <= centerByte) {
      iu = i;
    } else {
      break;
    }
  }
  const iuSeed = iu < 0 ? 0 : iu >= n ? n - 1 : iu;
  const seedMean = computeSeedMeanGapFromSixUniques(uniqueSorted, iuSeed);

  const atDisplayWhite = centerByte >= 255;
  const atDisplayBlack = centerByte <= 0;
  const atDiskMax =
    centerByte === vmaxU || vmaxU - centerByte <= DISPLAY_BAND_FALLBACK_ABS;
  const atDiskMin =
    centerByte === vminU || centerByte - vminU <= DISPLAY_BAND_FALLBACK_ABS;

  const atHighEnd = atDisplayWhite || atDiskMax;
  const atLowEnd = atDisplayBlack || atDiskMin;

  let dLoByte: number;
  let dHiByte: number;

  if (atHighEnd && atLowEnd) {
    return {
      dLo: toMapped01(Math.max(0, centerByte - DISPLAY_BAND_FALLBACK_ABS)),
      dHi: toMapped01(Math.min(255, centerByte + DISPLAY_BAND_FALLBACK_ABS)),
    };
  }
  if (atHighEnd) {
    dHiByte = 255;
    dLoByte = elbowLowByteInUnique(
      uniqueSorted,
      iuSeed,
      seedMean,
      vminU,
      vmaxU,
      centerByte
    );
  } else if (atLowEnd) {
    dLoByte = 0;
    dHiByte = elbowHighByteInUnique(
      uniqueSorted,
      iuSeed,
      seedMean,
      vminU,
      vmaxU,
      centerByte
    );
  } else {
    dLoByte = elbowLowByteInUnique(
      uniqueSorted,
      iuSeed,
      seedMean,
      vminU,
      vmaxU,
      centerByte
    );
    dHiByte = elbowHighByteInUnique(
      uniqueSorted,
      iuSeed,
      seedMean,
      vminU,
      vmaxU,
      centerByte
    );
  }

  dLoByte = Math.min(dLoByte, centerByte);
  dHiByte = Math.max(dHiByte, centerByte);
  if (atHighEnd) {
    dHiByte = 255;
  }
  if (atLowEnd) {
    dLoByte = 0;
  }
  if (dLoByte > dHiByte) {
    const t = dLoByte;
    dLoByte = dHiByte;
    dHiByte = t;
  }

  return { dLo: toMapped01(dLoByte), dHi: toMapped01(dHiByte) };
}

/**
 * Samples the **rendered** viewport canvas (`getImageData`): each disk pixel becomes a display
 * byte 0…255 (BT.601 luma of RGB — matches the grayscale channel when R=G=B). Window/colormap
 * changes therefore match what the user sees. That [0,1] band is converted to stored scalars via
 * the viewport VOI inverse (`mapMappedBandToRawRange`) for flood fill.
 */
export function getCanvasDiskIntensityRange(
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  opts: CanvasDiskOptions
): FloodFillIntensityRangeResult | null {
  const { dimensions, imageData: refImageData } = referencedVolume;
  const [width, height, numSlices] = dimensions;
  const vm = referencedVolume.voxelManager as NumberVoxelManager;

  const ijkStart = transformWorldToIndex(refImageData, worldPosition).map(
    Math.round
  ) as Types.Point3;

  if (
    ijkStart[0] < 0 ||
    ijkStart[0] >= width ||
    ijkStart[1] < 0 ||
    ijkStart[1] >= height ||
    ijkStart[2] < 0 ||
    ijkStart[2] >= numSlices
  ) {
    return null;
  }

  const startValue = Number(vm.getAtIJKPoint(ijkStart));
  if (!Number.isFinite(startValue)) {
    return null;
  }

  const canvas = opts.viewport.canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  const cw = canvas.width;
  const ch = canvas.height;
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, cw, ch);
  } catch {
    return null;
  }
  const { data } = imageData;
  /** Bitmap vs CSS: sampling matches on-screen disk when radius is in CSS px. */
  const clientW = canvas.clientWidth || cw;
  const clientH = canvas.clientHeight || ch;
  const scaleX = cw / clientW;
  const scaleY = ch / clientH;
  const scaleR = Math.max(scaleX, scaleY);
  const R = Math.max(0, Math.round(opts.canvasDiskRadiusPx * scaleR));
  const px = opts.canvasPoint.x * scaleX;
  const py = opts.canvasPoint.y * scaleY;
  const cx = Math.round(Math.min(Math.max(0, px), cw - 1));
  const cy = Math.round(Math.min(Math.max(0, py), ch - 1));

  const samples255: number[] = [];
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) {
        continue;
      }
      const bx = cx + dx;
      const by = cy + dy;
      if (bx < 0 || bx >= cw || by < 0 || by >= ch) {
        continue;
      }
      const j = (by * cw + bx) * 4;
      samples255.push(renderedDisplayByte255(data, j));
    }
  }

  if (samples255.length === 0) {
    return null;
  }

  samples255.sort((a, b) => a - b);
  const samples = samples255.map((v) => v / 255);
  const spread = samples[samples.length - 1] - samples[0];

  const ci = (cy * cw + cx) * 4;
  const centerByte = renderedDisplayByte255(data, ci);
  const centerSample = centerByte / 255;

  let dLo: number;
  let dHi: number;

  if (spread < 1e-12) {
    if (centerByte >= 255) {
      dLo = toMapped01(255 - DISPLAY_BAND_FALLBACK_ABS);
      dHi = 1;
    } else if (centerByte <= 0) {
      dLo = 0;
      dHi = toMapped01(DISPLAY_BAND_FALLBACK_ABS);
    } else {
      dLo = toMapped01(centerByte - DISPLAY_BAND_FALLBACK_ABS);
      dHi = toMapped01(centerByte + DISPLAY_BAND_FALLBACK_ABS);
    }
  } else if (samples.length < 8 || spread < 0.02) {
    const loB = Math.max(0, centerByte - DISPLAY_BAND_FALLBACK_ABS);
    const hiB = Math.min(255, centerByte + DISPLAY_BAND_FALLBACK_ABS);
    dLo = toMapped01(loB);
    dHi = toMapped01(hiB);
  } else {
    const uniqueSorted = [...new Set(samples255)].sort((a, b) => a - b);
    ({ dLo, dHi } = mappedTriClassBandFromUniqueDisplayValues(
      uniqueSorted,
      centerByte
    ));
  }

  {
    const smin = samples[0];
    const smax = samples[samples.length - 1];
    ({ dLo, dHi } = widenMappedBandForFloodFill(
      dLo,
      dHi,
      centerSample,
      smin,
      smax
    ));
  }

  const { rawMin, rawMax } = mapMappedBandToRawRange(dLo, dHi, opts.voi);
  let bandLo = Math.min(rawMin, rawMax);
  let bandHi = Math.max(rawMin, rawMax);
  const [volMin, volMax] = vm.getRange();
  /** Display 255 / 0: include all stored values that saturate to white / black on screen. */
  const bandHiByte = Math.min(255, Math.max(0, Math.round(dHi * 255)));
  const bandLoByte = Math.min(255, Math.max(0, Math.round(dLo * 255)));
  if (bandHiByte >= 255) {
    bandHi = volMax;
  }
  if (bandLoByte <= 0) {
    bandLo = volMin;
  }
  const volSpan = Math.abs(volMax - volMin) || 1;
  const eps = Math.max(1e-9, volSpan * 1e-12);
  const minRawW = Math.max(volSpan * MIN_RAW_BAND_FRAC_VOL_SPAN, 1e-12);
  if (bandHi - bandLo < minRawW) {
    const c = Number.isFinite(startValue) ? startValue : (bandLo + bandHi) / 2;
    const half = minRawW / 2;
    bandLo = c - half;
    bandHi = c + half;
    bandLo = Math.max(volMin, bandLo);
    bandHi = Math.min(volMax, bandHi);
  }
  const bandWidth = bandHi - bandLo;

  let min: number;
  let max: number;
  let canvasDiskBandCenteredOnSeed = false;

  if (startValue >= bandLo - eps && startValue <= bandHi + eps) {
    // Sigmoid Y_EPS / numeric: guarantee the scalar under the cursor is inside [min,max].
    min = Math.min(bandLo, startValue);
    max = Math.max(bandHi, startValue);
  } else {
    // Rendered display band can inverse-map to a raw interval that misses the seed voxel;
    // keep band width and center on the stored scalar.
    canvasDiskBandCenteredOnSeed = true;
    const half = Math.max(bandWidth / 2, volSpan * 0.0015);
    min = startValue - half;
    max = startValue + half;
  }

  min = Math.max(volMin, Math.min(volMax, min));
  max = Math.max(volMin, Math.min(volMax, max));
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  // Independent min/max clamp can drop the seed (e.g. cached getRange() tighter than slice data).
  min = Math.min(min, startValue);
  max = Math.max(max, startValue);
  min = Math.max(volMin, min);
  max = Math.min(volMax, max);
  if (min > max) {
    min = max = Math.max(volMin, Math.min(volMax, startValue));
  }

  logCanvasDiskSampledPixelValues(samples255, {
    centerDisplayByte255: centerByte,
    centerSample01: centerSample,
    spread,
    diskRadiusBitmapPx: R,
    centerBitmap: { cx, cy },
    canvasBitmapSize: { cw, ch },
    cssDiskRadiusPx: opts.canvasDiskRadiusPx,
    dLo,
    dHi,
    bandLo,
    bandHi,
    startValue,
    finalMin: min,
    finalMax: max,
    bandWidthRaw: max - min,
    canvasDiskBandCenteredOnSeed,
    volSpan,
  });

  return {
    min,
    max,
    ijkStart,
    diagnostics: {
      neighborhoodMean: (min + max) / 2,
      neighborhoodStdDev: (max - min) / 4,
      clickedVoxelValue: startValue,
      positiveStdDevMultiplier: 0,
      neighborhoodRadius: R,
      strategy: 'canvasDiskTriClass',
      canvasSampleCount: samples255.length,
      mappedBand: { min: dLo, max: dHi },
      canvasDiskBandCenteredOnSeed,
    },
  };
}
