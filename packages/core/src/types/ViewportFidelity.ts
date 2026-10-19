import type ImageQualityStatus from '../enums/ImageQualityStatus';
import type Point3 from './Point3';
import type { VoxelDataSource, VoxelReduction } from './VoxelQualityRegistry';

/**
 * Why the viewport data was reduced or incomplete (VF-CS3D-3 / VFS-API-3).
 * Separate from {@link VoxelQualityCause}, which is a reader verdict.
 */
export type ViewportFidelityCause =
  | 'deviceTextureLimit'
  | 'memoryBudget'
  | 'performanceTarget'
  | 'incompleteLoad'
  | 'lossyDecode';

/**
 * Absolute per-viewport fidelity record (VFS-API-1..6).
 *
 * States what data exists, at which spacing, with which loss, and how much is
 * missing. It does **not** say whether the view is good enough for the reader
 * — that is {@link compareVoxelQuality}.
 *
 * Every field is present on the type from the start (VFS-API-2); producers may
 * leave a field undefined until they exist.
 */
export type ViewportFidelityState = {
  /** Spacing and dimensions of the data the render path read. */
  dataResolution?: {
    spacing: Point3;
    dimensions: Point3;
  };
  /** World size of one display pixel (per-viewport). */
  displayResolution?: {
    spacing: Point3;
  };
  /**
   * How the data reached its spacing (VFS-API-4): none, boxAverage,
   * decimation, …
   */
  reductionKind?: VoxelReduction;
  /**
   * Where the data came from (split from kind): serverLevel, clientDerived, …
   */
  reductionSource?: VoxelDataSource;
  /**
   * Per-axis reduction factors relative to the full volume (VFS-API-5),
   * e.g. `[1, 1, 2]`.
   */
  magnitude?: Point3;
  /** Why the data is reduced or incomplete (VF-CS3D-3). */
  cause?: ViewportFidelityCause;
  /**
   * True for a reduction that ends when the interaction or load ends;
   * false for a standing reduction.
   */
  transient?: boolean;
  /** Progressive load progress; `status` is ImageQualityStatus as an input. */
  progressive?: {
    status: ImageQualityStatus;
    missing?: number;
    voxels?: number;
    loadedFraction?: number;
  };
  /**
   * Values the code replaced because source values were invalid (e.g. VOI).
   * Often undefined until a producer exists.
   */
  substitutedDefaults?: Record<string, unknown>;
  /** Render path that produced this state. Often undefined until wired. */
  renderPathId?: string;
};
