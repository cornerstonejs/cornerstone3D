import type { Types } from '@cornerstonejs/core';

type FloodFillResult = {
  flooded: Types.Point2[] | Types.Point3[];
};

type FloodFillGetter3D = (x: number, y: number, z: number) => unknown;
type FloodFillGetter2D = (x: number, y: number) => unknown;
type FloodFillGetter = FloodFillGetter2D | FloodFillGetter3D;

type FloodFillOptions = {
  onFlood?: (x: number, y: number, z?: number) => void;
  onBoundary?: (x: number, y: number, z?: number) => void;
  equals?: (a, b) => boolean; // Equality operation for your datastructure. Defaults to a === b.
  diagonals?: boolean; // Whether to flood fill across diagonals. Default false.
  bounds?: Map<number, Types.Point2 | Types.Point3>; //Store the bounds
  // Return false to exclude
  filter?: (point) => boolean;
};

export type { FloodFillResult, FloodFillGetter, FloodFillOptions };
