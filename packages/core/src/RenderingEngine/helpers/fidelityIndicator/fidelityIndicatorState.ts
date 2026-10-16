import ImageQualityStatus from '../../../enums/ImageQualityStatus';
import type {
  Point3,
  VoxelGrid,
  VoxelQualityRecord,
  VoxelQualityVerdict,
} from '../../../types';
import { isAliasingReduction } from '../../../utilities/voxelGrid';

/**
 * One source that the viewport draws: a volume quality record and/or a stack
 * image summary, how that data compares with full fidelity, and whether ray
 * sample distance is raised (e.g. TrackballRotateTool during drag).
 */
export type FidelityLine = {
  label: string;
  record?: VoxelQualityRecord;
  /**
   * Stack / progressive image summary when no volume record exists
   * (FIDELITY-RECORD-5, FIDELITY-SCOPE-2).
   */
  imageQualityStatus?: ImageQualityStatus;
  /**
   * Magnification-aware verdict from `compareVoxelQuality` when a volume
   * record and display spacing are available (FIDELITY-NOTIFY-7).
   */
  verdict?: VoxelQualityVerdict;
  /**
   * Per-axis ratio of drawn spacing / full-volume spacing (e.g. `[2, 2, 10]`).
   * Each value is 1 when that axis matches the full volume.
   */
  reductionFactors: Point3;
  /** True when drawn spacing matches the full volume (dims/origin ignored). */
  fullResolution: boolean;
  /**
   * Current mapper sample distance / idle baseline. 1 when idle; ~2 during
   * TrackballRotateTool drag (rotateSampleDistanceFactor).
   */
  sampleDistanceLod: number;
};

export type SvgFidelityState = 'loading' | 'done' | 'lossy' | 'lod';

/** Derived fidelity state of one viewport (FIDELITY-EVENT-3 / EVENT-5). */
export type ViewportFidelityState = {
  state: SvgFidelityState | 'hidden';
  lines: FidelityLine[];
};

/**
 * Worst-case SVG state across lines: loading > lod > lossy > done.
 * No volume / no quality record yet stays hidden (blank), so the page does not
 * flash the loading glyph before the user starts a load. Once one line has a
 * record or stack image status, a line without one is loading, and not full
 * resolution.
 */
export function svgStateOf(lines: FidelityLine[]): SvgFidelityState | 'hidden' {
  if (!lines.length) {
    return 'hidden';
  }

  let anyLoading = false;
  let anyLod = false;
  let anyLossy = false;
  let anyWithRecord = false;

  for (const line of lines) {
    anyWithRecord ||= !!line.record || line.imageQualityStatus !== undefined;
    const kind = lineKind(line);

    if (kind === 'loading') {
      anyLoading = true;
    } else if (kind === 'lod') {
      anyLod = true;
    } else if (kind === 'lossy') {
      anyLossy = true;
    }
  }

  if (!anyWithRecord) {
    return 'hidden';
  }

  if (anyLoading) {
    return 'loading';
  }

  if (anyLod) {
    return 'lod';
  }

  if (anyLossy) {
    return 'lossy';
  }

  return 'done';
}

/** What the data of one line holds, apart from the sample distance. */
export type FidelityDataKind = 'loading' | 'decimated' | 'reduced' | 'full';

export function dataKindOf(line: FidelityLine): FidelityDataKind {
  const {
    record,
    reductionFactors,
    fullResolution,
    verdict,
    imageQualityStatus,
  } = line;

  if (!record && imageQualityStatus !== undefined) {
    return dataKindOfImageQuality(imageQualityStatus);
  }

  if (!record || record.missing > 0) {
    return 'loading';
  }

  if (isAliasingReduction(record.reduction)) {
    return 'decimated';
  }

  // Unreduced grids are full fidelity regardless of display spacing.
  // compareVoxelQuality may still push `resolution` when voxels exceed a
  // display pixel (small study fitted large); that must not invent a warning
  // (FIDELITY-NOTIFY-7 only clears warnings for reduced data).
  const spatiallyReduced = !fullResolution || isReduced(reductionFactors);

  if (!spatiallyReduced) {
    return 'full';
  }

  // Magnification-aware path for actually reduced data (FIDELITY-NOTIFY-7).
  if (verdict) {
    if (verdict.lossless) {
      return 'full';
    }

    if (verdict.causes.includes('aliasing')) {
      return 'decimated';
    }

    return 'reduced';
  }

  return 'reduced';
}

/** Maps a stack ImageQualityStatus to a data kind (FIDELITY-SCOPE-2). */
export function dataKindOfImageQuality(
  status: ImageQualityStatus
): FidelityDataKind {
  if (status >= ImageQualityStatus.FULL_RESOLUTION) {
    return 'full';
  }

  // SUBRESOLUTION and LOSSY are standing reduced qualities.
  if (status >= ImageQualityStatus.SUBRESOLUTION) {
    return 'reduced';
  }

  // Replicates are placeholders that improve as neighbours arrive.
  return 'loading';
}

export function lineKind(line: FidelityLine): SvgFidelityState {
  const dataKind = dataKindOf(line);

  if (dataKind === 'loading') {
    return 'loading';
  }

  if (isInteractiveLod(line.sampleDistanceLod)) {
    return 'lod';
  }

  return dataKind === 'full' ? 'done' : 'lossy';
}

/**
 * How much coarser the drawn grid is than the full volume, on each axis.
 * A value of 1 means that axis matches the full volume spacing.
 */
export function reductionFactorsOf(drawn: VoxelGrid, full: VoxelGrid): Point3 {
  const factors = [1, 1, 1] as Point3;

  for (let axis = 0; axis < 3; axis++) {
    const fullSpacing = full.spacing[axis];

    if (!(fullSpacing > 0)) {
      continue;
    }

    factors[axis] = drawn.spacing[axis] / fullSpacing;
  }

  return factors;
}

export function isReduced(factors: Point3): boolean {
  return factors.some((factor) => factor > 1 + 1e-6);
}

/** Formats per-axis factors as `2×2×10`. */
export function formatFactors(factors: Point3): string {
  return factors.map(formatFactor).join('×');
}

export function isInteractiveLod(sampleDistanceLod: number): boolean {
  return sampleDistanceLod > 1 + 1e-2;
}

export function formatFactor(value: number): string {
  const rounded = Math.round(value);

  if (Math.abs(value - rounded) < 1e-6) {
    return String(rounded);
  }

  return value.toFixed(1);
}
