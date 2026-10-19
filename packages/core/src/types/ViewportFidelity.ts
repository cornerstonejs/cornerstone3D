import type ImageQualityStatus from '../enums/ImageQualityStatus';
import type Point3 from './Point3';
import type { VoxelDataSource, VoxelReduction } from './VoxelQualityRegistry';

/**
 * Why the viewport data was reduced or incomplete. Separate from
 * {@link VoxelQualityCause}, which is a reader verdict.
 */
export type ViewportFidelityCause =
  | 'deviceTextureLimit'
  | 'memoryBudget'
  | 'performanceTarget'
  | 'incompleteLoad'
  | 'lossyDecode';

/** The derived state of a view; see `ViewportFidelityState.shownState`. */
export type ViewportFidelityShownState =
  | 'hidden'
  | 'done'
  | 'loading'
  | 'lod'
  | 'lossy';

/**
 * Absolute per-viewport fidelity record (FIDELITY-EVENT-5).
 *
 * States what data exists, at which spacing, with which loss, and how much is
 * missing. `shownState` and `lossy` are the verdict of this viewport at its
 * display spacing, over every volume. The other fields describe the worst
 * volume, the one that decides `shownState`. A verdict for another reader
 * comes from {@link compareVoxelQuality}.
 *
 * Producers may leave a field undefined when they cannot supply it.
 */
export type ViewportFidelityState = {
  /** Spacing and dimensions of the data the render path read. */
  dataResolution?: {
    spacing: Point3;
    dimensions: Point3;
  };
  /**
   * Display spacing on each index axis of the data grid: one display pixel in
   * the view plane, the source slice spacing on the axis normal to a slice
   * view. Not part of the change key of `VIEWPORT_FIDELITY_CHANGED`.
   */
  displayResolution?: {
    spacing: Point3;
  };
  /** How the data reached its spacing: none, boxAverage, decimation, … */
  reductionKind?: VoxelReduction;
  /**
   * Where the data came from (split from kind): serverLevel, clientDerived, …
   */
  reductionSource?: VoxelDataSource;
  /**
   * Per-axis reduction factors relative to the full volume, e.g. `[1, 1, 2]`.
   */
  magnitude?: Point3;
  /** Why the data is reduced or incomplete. */
  cause?: ViewportFidelityCause;
  /**
   * True for a reduction that ends when the interaction or load ends;
   * false for a standing reduction.
   */
  transient?: boolean;
  /**
   * Progressive load progress. `status` is the comparable summary; it falls to
   * a replicate value while voxels are missing, also in an ordinary load.
   * `lowest` is the lowest delivered quality: below `FULL_RESOLUTION`, the
   * view shows replicated, sub-resolution or lossy data.
   */
  progressive?: {
    status: ImageQualityStatus;
    lowest?: ImageQualityStatus;
    missing?: number;
    voxels?: number;
    loadedFraction?: number;
  };
  /**
   * The derived state of the view, with the same decision as the built-in
   * indicator: `hidden` (no data), `done` (lossless), `loading`, `lod` or
   * `lossy`. `done` is the state of every lossless view: an application
   * shows it only as a short recovery mark after a lossy state
   * (FIDELITY-UI-4), and otherwise shows nothing for `done`.
   */
  shownState?: ViewportFidelityShownState;
  /**
   * True when the displayed image is lossy (`shownState` is `loading`, `lod`
   * or `lossy`). An ordinary load of full-resolution frames is not lossy.
   */
  lossy?: boolean;
};
