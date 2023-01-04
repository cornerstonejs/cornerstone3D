import { Types } from '@cornerstonejs/core';

type FloodFillResult = {
  flooded: Types.Point2[] | Types.Point3[];
  boundaries: Types.Point2[] | Types.Point3[];
};

type FloodFillGetter3D = (x: number, y: number, z: number) => number;
type FloodFillGetter2D = (x: number, y: number) => number;
type FloodFillGetter = FloodFillGetter2D | FloodFillGetter3D;

type FloodFillOptions = {
  onFlood?: (x, y) => void;
  onBoundary?: (x, y) => void;
  equals?: (a, b) => boolean; // Equality operation for your datastructure. Defaults to a === b.
  diagonals?: boolean; // Whether to flood fill across diagonals. Default false.
};

export { FloodFillResult, FloodFillGetter, FloodFillOptions };
