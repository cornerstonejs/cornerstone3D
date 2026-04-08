import type { Types } from '@cornerstonejs/core';

type FloodFillResult = {
  flooded: Types.Point2[] | Types.Point3[];
};

type FloodFillGetter3D = (x: number, y: number, z: number) => unknown;
type FloodFillGetter2D = (x: number, y: number) => unknown;
type FloodFillGetter = FloodFillGetter2D | FloodFillGetter3D;

/**
 * Dense O(1) visited marks for flood fill. Prefer over the default {@link Set} for large fills.
 *
 * - **Planar / 2D:** `data.length` must be `width * height`; index = `x + y * width`.
 * - **3D:** set `depth`; `data.length` must be `width * height * depth`;
 *   index = `x + y * width + z * width * height`.
 *
 * Out-of-bounds coordinates still fall back to a small internal {@link Set} (rare).
 */
type FloodFillVisitedBuffer = {
  data: Uint8Array;
  width: number;
  height: number;
  depth?: number;
};

type FloodFillOptions = {
  onFlood?: (x: number, y: number, z?: number) => void;
  onBoundary?: (x: number, y: number, z?: number) => void;
  equals?: (a, b) => boolean; // Equality operation for your datastructure. Defaults to a === b.
  diagonals?: boolean; // Whether to flood fill across diagonals. Default false.
  bounds?: Map<number, Types.Point2 | Types.Point3>; //Store the bounds
  // Return false to exclude
  filter?: (point) => boolean;
  /**
   * 3D only: keep expansion on the same slice as the seed (fixed third index / k).
   * Composed with {@link filter}: both must allow the neighbor.
   */
  planar?: boolean;
  /**
   * 3D only: await before reading voxels on slice index z (e.g. load image for streaming volumes).
   */
  ensureSliceLoaded?: (sliceIndex: number) => Promise<void>;
  /**
   * Yield to the event loop every N flood steps (default 500). Use 0 to disable.
   */
  yieldEvery?: number;
  /** Optional dense visited buffer (see {@link FloodFillVisitedBuffer}). */
  visitedBuffer?: FloodFillVisitedBuffer;
};

export type {
  FloodFillResult,
  FloodFillGetter,
  FloodFillOptions,
  FloodFillVisitedBuffer,
};
