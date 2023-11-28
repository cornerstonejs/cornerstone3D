import type { Types } from '@cornerstonejs/core';

import type BoundsIJK from '../../../tools/src/types/BoundsIJK';

/**
 * This is a simple, standard interface to values associated with a voxel.
 */
export default class VoxelValue<T> {
  public modifiedSlices = new Set<number>();
  public boundsIJK = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ] as BoundsIJK;
  points: Set<number>;
  dimensions: Types.Point3;
  width: number;
  frameSize: number;
  _get: (index: number) => T;
  _set: (index: number, v: T) => boolean | void;

  constructor(
    dimensions,
    _get: (index: number) => T,
    _set?: (index: number, v: T) => boolean | void
  ) {
    this.dimensions = dimensions;
    this.width = dimensions[0];
    this.frameSize = this.width * dimensions[1];
    this._get = _get;
    this._set = _set;
  }

  public getIJK = (i, j, k) => {
    const index = i + j * this.width + k * this.frameSize;
    return this._get(index);
  };

  public setIJK = (i: number, j: number, k: number, v) => {
    const index = i + j * this.width + k * this.frameSize;
    if (this._set(index, v) !== false) {
      this.modifiedSlices.add(k);
      VoxelValue.addBounds(this.boundsIJK, [i, j, k]);
    }
  };

  public addPoint(point: Types.Point3 | number) {
    const index = Array.isArray(point)
      ? point[0] + this.width * point[1] + this.frameSize * point[2]
      : point;
    if (!this.points) {
      this.points = new Set<number>();
    }
    this.points.add(index);
  }

  /** Gets the points as Point3 values */
  public getPoints(): Types.Point3[] {
    return this.points
      ? [...this.points].map((index) => this.toIJK(index))
      : [];
  }

  public getPointIndices(): number[] {
    return this.points ? [...this.points] : [];
  }

  public get = ([i, j, k]) => this.getIJK(i, j, k);

  public set = ([i, j, k], v) => this.setIJK(i, j, k, v);

  public getIndex = (index) => this._get(index);

  public setIndex = (index, v) => {
    if (this._set(index, v) !== false) {
      const pointIJK = this.toIJK(index);
      this.modifiedSlices.add(pointIJK[2]);
      VoxelValue.addBounds(this.boundsIJK, pointIJK);
    }
  };

  public toIJK(index: number): Types.Point3 {
    return [
      index % this.width,
      Math.floor((index % this.frameSize) / this.width),
      Math.floor(index / this.frameSize),
    ];
  }

  public static addBounds(bounds: BoundsIJK, point: Types.Point3) {
    bounds.forEach((bound, index) => {
      bound[0] = Math.min(point[index], bound[0]);
      bound[1] = Math.max(point[index], bound[1]);
    });
  }

  /**
   *  Creates a volume value accessor
   */
  public static volumeVoxelValue(
    dimensions: Types.Point3,
    scalarData
  ): VoxelValue<number> {
    return new VoxelValue(
      dimensions,
      (index) => scalarData[index],
      (index, v) => (scalarData[index] = v)
    );
  }

  /**
   * Creates a volume map value accessor
   */
  public static mapVoxelValue<T>(dimension: Types.Point3): VoxelValue<T> {
    const map = new Map<number, T>();
    const voxelValue = new VoxelValue(
      dimension,
      map.get.bind(map),
      (index, v) => map.set(index, v) && true
    );
    return voxelValue;
  }

  /**
   * Creates an update remembering mapper
   * Note the get/set are NOT symmetrical, the get returns the original value at
   * the given position, or undefined, wherase the set applies the new value to
   * the underlying sourceVoxelValue, setting the remember value to the old one
   * if it is different.
   */
  public static historyVoxelValue<T>(
    dimension: Types.Point3,
    sourceVoxelValue: VoxelValue<T>
  ): VoxelValue<T> {
    const map = new Map<number, T>();
    const voxelValue = new VoxelValue(
      dimension,
      (index) => map.get(index),
      (index, v) => {
        if (!map.has(index)) {
          const oldV = map.get(index) ?? sourceVoxelValue.getIndex(index);
          if (oldV === v) {
            // No-op
            return false;
          }
          map.set(index, oldV);
        }
        sourceVoxelValue.setIndex(index, v);
      }
    );
    return voxelValue;
  }
}
