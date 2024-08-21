import type { PixelDataTypedArray } from '../types';

/**
 * The RLERun specifies a contigous run of values for a row,
 * where all indices (i only) from `[start,end)` have the specified
 * value.
 */
export interface RLERun<T> {
  value: T;
  start: number;
  end: number;
}

export interface IRLEVoxelMap<T> {
  defaultValue: T;
  pixelDataConstructor: new (length: number) => PixelDataTypedArray;

  get(index: number): T;
  getRun(j: number, k: number): RLERun<T>[] | undefined;
  set(index: number, value: T): void;
  clear(): void;
  keys(): number[];
  getPixelData(
    k?: number,
    pixelData?: PixelDataTypedArray
  ): PixelDataTypedArray;

  // Protected methods (not typically included in interfaces, but added for completeness)
  // These would typically be marked as private in TypeScript
  // getRLE(i: number, j: number, k?: number): RLERun<T> | undefined;
  // findIndex(row: RLERun<T>[], i: number): number;
}
