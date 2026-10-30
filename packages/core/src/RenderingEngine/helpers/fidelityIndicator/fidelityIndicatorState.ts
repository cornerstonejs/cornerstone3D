import ImageQualityStatus from '../../../enums/ImageQualityStatus';
import type {
  Point3,
  ViewportFidelityCause,
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
   * (FIDELITY-RECORD-5, FIDELITY-STATE-8).
   */
  imageQualityStatus?: ImageQualityStatus;
  /**
   * True while a later delivery replaces the data shown: a later progressive
   * stage of a stack image, or a volume load that continues. Reduced data that
   * is pending is `loading`.
   */
  qualityPending?: boolean;
  /**
   * Why the drawn grid is coarser than the full volume, as the strategy that
   * chose the grid states it. A reduced grid with no cause, while the load
   * continues, is an interim texture of the load.
   */
  reductionCause?: ViewportFidelityCause;
  /**
   * Magnification-aware verdict from `compareVoxelQuality` when a volume
   * record and display spacing are available (FIDELITY-STATE-6).
   */
  verdict?: VoxelQualityVerdict;
  /**
   * Display spacing on each index axis of `record.grid`, as given to
   * `compareVoxelQuality` (see `displaySpacingOfViewport`).
   */
  displaySpacing?: Point3;
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
  /**
   * True while the render path shows an older or coarser sample during an
   * interaction (a deferred CPU resample). It gives `lod`, as a raised
   * sample distance does.
   */
  interactiveReduction?: boolean;
};

/**
 * Whether a line carries data that the fidelity can judge: a volume record,
 * a stack image status, or a drawn grid coarser than the full volume.
 */
export function lineHasData(line: FidelityLine): boolean {
  return (
    !!line.record ||
    line.imageQualityStatus !== undefined ||
    !line.fullResolution
  );
}

export type SvgFidelityState = 'loading' | 'done' | 'lossy' | 'lod';

/** The states from the most urgent to the least (FIDELITY-STATE-7). */
export const FIDELITY_STATE_ORDER: readonly SvgFidelityState[] = [
  'loading',
  'lod',
  'lossy',
  'done',
];

/** A rank that grows with urgency: `loading` is the highest. */
export function fidelityStateRank(state: SvgFidelityState): number {
  return FIDELITY_STATE_ORDER.length - FIDELITY_STATE_ORDER.indexOf(state);
}

/**
 * The most urgent state across lines (see {@link FIDELITY_STATE_ORDER}).
 * A line with no data (see {@link lineHasData}) adds nothing, so no lines or
 * only such lines give `hidden`. `done` means lossless; the indicator shows it
 * only as a recovery from a lossy state.
 */
export function svgStateOf(lines: FidelityLine[]): SvgFidelityState | 'hidden' {
  let worst: SvgFidelityState | 'hidden' = 'hidden';
  let worstRank = 0;

  for (const line of lines) {
    if (!lineHasData(line)) {
      continue;
    }

    const kind = lineKind(line);
    const rank = fidelityStateRank(kind);

    if (rank > worstRank) {
      worst = kind;
      worstRank = rank;
    }
  }

  return worst;
}

/** What the data of one line holds, apart from the sample distance. */
export type FidelityDataKind = 'loading' | 'decimated' | 'reduced' | 'full';

/**
 * Classifies the data of one line (FIDELITY-STATE-2, FIDELITY-STATE-6):
 *
 * - `loading`: replicated, sub-resolution or lossy data stands in for data
 *   that has not arrived. Missing data with only full-resolution deliveries is
 *   not `loading`.
 * - `decimated`: an aliasing reduction, lossy at every magnification.
 * - `reduced`: lossy deliveries, or a box average coarser than the display.
 * - `full`: lossless at the current display spacing.
 */
export function dataKindOf(line: FidelityLine): FidelityDataKind {
  const {
    record,
    reductionFactors,
    fullResolution,
    verdict,
    imageQualityStatus,
  } = line;

  if (!record && imageQualityStatus !== undefined) {
    return dataKindOfImageQuality(imageQualityStatus, line.qualityPending);
  }

  // A reduced texture with no record is lossy, not hidden.
  if (!record) {
    return fullResolution ? 'loading' : 'reduced';
  }

  // Missing data alone is not lossy: an ordinary load delivers only full
  // resolution frames. Replicated, sub-resolution or lossy data is lossy.
  const lowest = record.lowest ?? ImageQualityStatus.FULL_RESOLUTION;
  const lossyDelivery = lowest < ImageQualityStatus.FULL_RESOLUTION;

  if (lossyDelivery && (record.missing > 0 || line.qualityPending)) {
    return 'loading';
  }

  if (isAliasingReduction(record.reduction)) {
    return 'decimated';
  }

  if (lossyDelivery) {
    return 'reduced';
  }

  // An unreduced grid is lossless at every display spacing; a `resolution`
  // cause on it (small study fitted large) must not invent a warning.
  const spatiallyReduced = !fullResolution || isReduced(reductionFactors);

  if (!spatiallyReduced) {
    return 'full';
  }

  // Magnification-aware path for actually reduced data (FIDELITY-STATE-6 /
  // MR-U-5). Only the spatial causes count here: `missingData` of an ordinary
  // load is not lossy.
  const spatialKind = verdict ? spatialKindOf(verdict) : 'reduced';

  // A reduction that no strategy states, during a load, ends with the load.
  if (spatialKind !== 'full' && line.qualityPending && !line.reductionCause) {
    return 'loading';
  }

  return spatialKind;
}

function spatialKindOf(verdict: VoxelQualityVerdict): FidelityDataKind {
  if (verdict.causes.includes('aliasing')) {
    return 'decimated';
  }

  return verdict.causes.includes('resolution') ? 'reduced' : 'full';
}

/**
 * Maps a stack ImageQualityStatus to a data kind (FIDELITY-STATE-8).
 * `pending` is true while a later progressive stage replaces the image.
 */
export function dataKindOfImageQuality(
  status: ImageQualityStatus,
  pending = false
): FidelityDataKind {
  if (status >= ImageQualityStatus.FULL_RESOLUTION) {
    return 'full';
  }

  // SUBRESOLUTION and LOSSY are final only when no later stage comes.
  if (status >= ImageQualityStatus.SUBRESOLUTION) {
    return pending ? 'loading' : 'reduced';
  }

  // Replicates are placeholders that improve as neighbours arrive.
  return 'loading';
}

export function lineKind(line: FidelityLine): SvgFidelityState {
  const dataKind = dataKindOf(line);

  if (dataKind === 'loading') {
    return 'loading';
  }

  if (isInteractiveLod(line.sampleDistanceLod) || line.interactiveReduction) {
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
