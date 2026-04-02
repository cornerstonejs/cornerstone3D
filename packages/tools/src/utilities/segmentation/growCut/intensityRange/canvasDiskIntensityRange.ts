import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { NumberVoxelManager } from '@cornerstonejs/core/utilities';
import type { ViewportVoiMappingForTool } from '../getViewportVoiMappingForVolume';
import type { FloodFillIntensityRangeResult } from '../floodFillIntensityRangeTypes';

const { transformWorldToIndex, mapMappedBandToRawRange } = csUtils;

type CanvasDiskOptions = {
  viewport: Types.IViewport;
  canvasPoint: { x: number; y: number };
  canvasDiskRadiusPx: number;
  voi: ViewportVoiMappingForTool;
  worldPosition: Types.Point3;
};

/**
 * Samples rendered canvas luminance in a disk, derives a mapped [0,1] band, then inverses to raw bounds.
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
  /** `canvasPoint` is in CSS / element space; bitmap may use higher backing resolution. */
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

  const samples: number[] = [];
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) {
        continue;
      }
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= cw || py < 0 || py >= ch) {
        continue;
      }
      const i = (py * cw + px) * 4;
      const luma =
        (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      samples.push(Math.min(1, Math.max(0, luma)));
    }
  }

  if (samples.length === 0) {
    return null;
  }

  samples.sort((a, b) => a - b);
  const spread = samples[samples.length - 1] - samples[0];
  const ci = (cy * cw + cx) * 4;
  const centerSample = Math.min(
    1,
    Math.max(
      0,
      (data[ci] * 0.299 + data[ci + 1] * 0.587 + data[ci + 2] * 0.114) / 255
    )
  );

  let dLo: number;
  let dHi: number;

  if (spread < 0.04) {
    dLo = Math.max(0, centerSample - 0.05);
    dHi = Math.min(1, centerSample + 0.05);
  } else {
    const p10 = samples[Math.floor(samples.length * 0.1)];
    const p90 =
      samples[
        Math.min(samples.length - 1, Math.ceil(samples.length * 0.9) - 1)
      ];
    dLo = p10;
    dHi = p90;
    if (dHi - dLo > 0.08) {
      const gapPad = 0.02 * (dHi - dLo);
      dLo = Math.min(dLo + gapPad, centerSample);
      dHi = Math.max(dHi - gapPad, centerSample);
    }
  }

  if (dLo > dHi) {
    const t = dLo;
    dLo = dHi;
    dHi = t;
  }

  const { rawMin, rawMax } = mapMappedBandToRawRange(dLo, dHi, opts.voi);
  const bandLo = Math.min(rawMin, rawMax);
  const bandHi = Math.max(rawMin, rawMax);
  const startValue = Number(vm.getAtIJKPoint(ijkStart));
  const [volMin, volMax] = vm.getRange();
  const volSpan = Math.abs(volMax - volMin) || 1;
  const eps = Math.max(1e-9, volSpan * 1e-12);
  const bandWidth = bandHi - bandLo;

  let min: number;
  let max: number;
  let canvasDiskBandCenteredOnSeed = false;

  if (startValue >= bandLo - eps && startValue <= bandHi + eps) {
    // Sigmoid Y_EPS / numeric: guarantee the scalar under the cursor is inside [min,max].
    min = Math.min(bandLo, startValue);
    max = Math.max(bandHi, startValue);
  } else {
    // Screen luma (incl. colormaps) can invert to a raw band that does not contain the seed.
    // Bridging [bandLo, bandHi] to startValue (old: min/max of both) spans e.g. [0, SUV] and
    // floods the whole volume; instead keep the disk band *width*, centered on the voxel.
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
      canvasSampleCount: samples.length,
      mappedBand: { min: dLo, max: dHi },
      canvasDiskBandCenteredOnSeed,
    },
  };
}
