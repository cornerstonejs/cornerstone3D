import type { PixelDataTypedArray, Point3 } from '../../types';

/**
 * Row ordering used when a 3D brick is packed into a single 2D codestream.
 *
 * JPEG-LS has no multi-frame concept, so a brick is stored as one tall, narrow
 * image. The packing determines whether the predictor's "above" neighbour is a
 * true 3D neighbour:
 *
 * - `z-minor`     row `r = y * bz + z` — above neighbour is `(x, y, z-1)`,
 *                 exploiting through-plane correlation.
 * - `plane-major` row `r = z * by + y` — above neighbour is `(x, y-1, z)`,
 *                 exploiting in-plane vertical correlation.
 *
 * Both are valid for 63 of every 64 rows; which compresses better depends on
 * slice thickness.
 */
export type BrickOrder = 'z-minor' | 'plane-major';

/** Axis roles. Only `space` axes participate in the resolution pyramid. */
export type BrickAxisType = 'space' | 'time' | 'channel';

/**
 * One declared axis of the stored volume. Modelled on OME-NGFF's `axes`, which
 * is the part of that spec worth keeping even though the container was not.
 */
export interface BrickAxis {
  name: string;
  type: BrickAxisType;
  size: number;
  /**
   * Whether the pyramid reduces this axis. Time and channel axes are indexed,
   * never subsampled — every phase is wanted at reduced spatial resolution,
   * not half the phases.
   */
  subsample: boolean;
}

/** A pyramid level as written in the manifest. */
export interface BrickLevelSpec {
  /**
   * `d1`, `d2`, `d4`, ... while every axis reduces by the same factor, or
   * `d8_8_2` once they diverge — which is what an anisotropic series produces,
   * since a single factor is only right for isotropic voxels.
   */
  name: string;
  /**
   * Per-axis downsample factors relative to `d1`. Parsed from the name when
   * absent.
   */
  factors?: Point3;
  /** Spatial dimensions at this level. Derived from the factors when absent. */
  size?: Point3;
  /**
   * Brick dimensions at this level. Defaults to the manifest's `brickSize`.
   *
   * A coarse level small enough to be worth a single request is stored as one
   * brick shaped like the level, so its brick is not a cube — that is the whole
   * point of the field.
   */
  brickSize?: Point3;
  /** Brick grid extent. Derived from `size` and `brickSize` when absent. */
  bricks?: Point3;
}

/** `manifest.json` as served by the brick store. */
export interface BrickManifest {
  version?: number;
  axes: BrickAxis[];
  /** Maps store axes onto the series' DimensionIndexSequence. */
  dimensionIndexPointers?: string[];
  /** Default brick dimensions. Levels may override it with their own. */
  brickSize: Point3;
  brickOrder?: BrickOrder;
  /**
   * Whether edge bricks are zero-padded to the full brick size.
   *
   * Version 2 stores every brick at its true extent instead, so the packed image
   * of an edge brick is smaller rather than padded. Absent, padding is assumed,
   * which is what version 1 stores wrote.
   */
  brickPadding?: boolean;
  /** Full-resolution voxel spacing in mm, informational. */
  spacing?: Point3;
  /** Either full specs or bare level names such as `"d8"`. */
  levels: Array<BrickLevelSpec | string>;
  transferSyntaxUID: string;
}

/** A pyramid level after validation, with everything derived. */
export interface ResolvedBrickLevel {
  /** `d8`, or `d8_8_2` for an anisotropic level. */
  name: string;
  /**
   * Per-axis downsample factors relative to `d1` — `[8, 8, 2]` means eight times
   * coarser in-plane and twice through-plane.
   */
  factors: Point3;
  /** Spatial dimensions at this level. */
  dimensions: Point3;
  /** Brick dimensions at this level, which need not be cubic. */
  brickSize: Point3;
  /** Number of bricks along each spatial axis. */
  brickGrid: Point3;
  /** Total bricks in one non-spatial index combination. */
  brickCount: number;
  /** Voxels in the level, used to order levels coarse to fine. */
  voxelCount: number;
}

/** A validated manifest with derived level geometry, ordered coarse to fine. */
export interface ResolvedBrickManifest {
  raw: BrickManifest;
  /** Default brick dimensions; prefer each level's own `brickSize`. */
  brickSize: Point3;
  brickOrder: BrickOrder;
  /** Whether edge bricks are zero-padded to their level's brick size. */
  brickPadding: boolean;
  transferSyntaxUID: string;
  /** The three spatial axes, in x, y, z order. */
  spatialAxes: [BrickAxis, BrickAxis, BrickAxis];
  /** Non-spatial axes (time, channel, ...) in declaration order. */
  indexedAxes: BrickAxis[];
  /** Full-resolution spatial dimensions — the `d1` extent. */
  baseDimensions: Point3;
  /** Levels sorted coarsest first, so a client can walk them in fetch order. */
  levels: ResolvedBrickLevel[];
  /** Lookup by level name. */
  levelsByName: Map<string, ResolvedBrickLevel>;
  /**
   * The full-resolution level, i.e. the one whose factors are all 1.
   *
   * Found by its factors rather than by the name `d1`, so an anisotropic store
   * whose levels are named `d4_4_1` and `d8_8_2` still resolves it.
   */
  baseLevel: ResolvedBrickLevel;
}

/** Identifies a single stored brick. */
export interface BrickCoord {
  /** Level name, e.g. `d8`. */
  level: string;
  /** Brick index along x. */
  kx: number;
  /** Brick index along y. */
  ky: number;
  /** Brick index along z. */
  kz: number;
  /**
   * Index into each non-spatial axis, in the order of
   * {@link ResolvedBrickManifest.indexedAxes}. Empty for a plain 3D series.
   */
  indices?: number[];
}

/** Fetches the bytes of one brick. */
export type FetchBrickFn = (
  url: string,
  signal?: AbortSignal
) => Promise<Uint8Array>;

/** Result of decoding one packed brick codestream. */
export interface DecodedBrick {
  pixelData: PixelDataTypedArray;
  columns: number;
  rows: number;
}

/**
 * Decodes one packed brick codestream.
 *
 * Injected rather than imported so `core` keeps no dependency on the codec
 * packages, and so tests can run without WASM.
 */
export type DecodeBrickFn = (
  bytes: Uint8Array,
  info: { signed: boolean; bytesPerPixel: number }
) => Promise<DecodedBrick>;
