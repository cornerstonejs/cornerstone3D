import type { Point3, VoxelQualityRecord, VoxelGrid } from '../../../types';
import { isAliasingReduction } from '../../../utilities/voxelGrid';

/**
 * One volume that the viewport draws: the quality record of the texture grid,
 * how that grid compares with the full volume, and whether ray sample distance
 * is raised (e.g. TrackballRotateTool during drag).
 */
export type FidelityLine = {
  label: string;
  record?: VoxelQualityRecord;
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

/**
 * Worst-case SVG state across lines: loading > lod > lossy > done.
 * No volume / no quality record yet stays hidden (blank), so the page does not
 * flash the loading glyph before the user starts a load. Once one line has a
 * record, a line without one is loading, and not full resolution.
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
    anyWithRecord ||= !!line.record;
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
  const { record, reductionFactors, fullResolution } = line;

  if (!record || record.missing > 0) {
    return 'loading';
  }

  if (isAliasingReduction(record.reduction)) {
    return 'decimated';
  }

  // Spacing only — dims/origin differences must not sticky-flag lossy.
  if (!fullResolution || isReduced(reductionFactors)) {
    return 'reduced';
  }

  return 'full';
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
