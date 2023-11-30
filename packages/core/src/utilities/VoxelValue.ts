import type { BoundsIJK, Point3, VolumeScalarData } from '../types';

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

  // Provide direct access to the underlying data, if any
  public scalarData: VolumeScalarData;
  public map: Map<number, T>;
  public sourceVoxelValue: VoxelValue<T>;
  public isInObject: (pointIPS, pointIJK) => boolean;

  points: Set<number>;
  dimensions: Point3;
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

  public addPoint(point: Point3 | number) {
    const index = Array.isArray(point)
      ? point[0] + this.width * point[1] + this.frameSize * point[2]
      : point;
    if (!this.points) {
      this.points = new Set<number>();
    }
    this.points.add(index);
  }

  /** Gets the points as Point3 values */
  public getPoints(): Point3[] {
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

  public toIJK(index: number): Point3 {
    return [
      index % this.width,
      Math.floor((index % this.frameSize) / this.width),
      Math.floor(index / this.frameSize),
    ];
  }

  public toIndex(ijk: Types.Point3) {
    return ijk[0] + ijk[1] * this.width + ijk[2] * this.frameSize;
  }

  public getBoundsIJK(): BoundsIJK {
    if (this.boundsIJK[0][0] < this.dimensions[0]) {
      return this.boundsIJK;
    }
    return this.dimensions.map((dimension) => [0, dimension - 1]) as BoundsIJK;
  }

  public forEach = (callback, options) => {
    const boundsIJK = options?.boundsIJK || this.getBoundsIJK();
    const { isWithinObject } = options || {};
    if (this.map) {
      // Optimize this for only values in the map
      for (const index of this.map.keys()) {
        const pointIJK = this.toIJK(index);
        const value = this._get(index);
        const callbackArguments = { value, index, pointIJK };
        if (isWithinObject?.(callbackArguments) === false) {
          continue;
        }
        callback(callbackArguments);
      }
    } else {
      for (let k = boundsIJK[2][0]; k <= boundsIJK[2][1]; k++) {
        const kIndex = k * this.frameSize;
        for (let j = boundsIJK[1][0]; j <= boundsIJK[1][1]; j++) {
          const jIndex = kIndex + j * this.width;
          for (
            let i = boundsIJK[0][0], index = jIndex + i;
            i <= boundsIJK[0][1];
            i++, index++
          ) {
            const value = this.getIndex(index);
            const callbackArguments = { value, index, pointIJK: [i, j, k] };
            if (isWithinObject?.(callbackArguments) === false) {
              continue;
            }
            callback(callbackArguments);
          }
        }
      }
    }
  };

  public static addBounds(bounds: BoundsIJK, point: Point3) {
    bounds.forEach((bound, index) => {
      bound[0] = Math.min(point[index], bound[0]);
      bound[1] = Math.max(point[index], bound[1]);
    });
  }

  /**
   *  Creates a volume value accessor
   */
  public static volumeVoxelValue(
    dimensions: Point3,
    scalarData
  ): VoxelValue<number> {
    const voxels = new VoxelValue(
      dimensions,
      (index) => scalarData[index],
      (index, v) => {
        const isChanged = scalarData[index] !== v;
        scalarData[index] = v;
        return isChanged;
      }
    );
    voxels.scalarData = scalarData;
    return voxels;
  }

  /**
   * Creates a volume map value accessor
   */
  public static mapVoxelValue<T>(dimension: Point3): VoxelValue<T> {
    const map = new Map<number, T>();
    const voxelValue = new VoxelValue(
      dimension,
      map.get.bind(map),
      (index, v) => map.set(index, v) && true
    );
    voxelValue.map = map;
    return voxelValue;
  }

  public clear() {
    if (this.map) {
      this.map.clear();
    }
    this.boundsIJK.map((bound) => {
      bound[0] = Infinity;
      bound[1] = -Infinity;
    });
    this.modifiedSlices.clear();
    this.points?.clear();
  }

  public getArrayOfSlices(): number[] {
    return Array.from(this.modifiedSlices);
  }

  /**
   * Creates an update remembering mapper
   * Note the get/set are NOT symmetrical, the get returns the original value at
   * the given position, or undefined, wherase the set applies the new value to
   * the underlying sourceVoxelValue, setting the remember value to the old one
   * if it is different.
   */
  public static historyVoxelValue<T>(
    sourceVoxelValue: VoxelValue<T>
  ): VoxelValue<T> {
    const map = new Map<number, T>();
    const { dimensions } = sourceVoxelValue;
    const voxelValue = new VoxelValue(
      dimensions,
      (index) => map.get(index),
      function (index, v) {
        if (!map.has(index)) {
          const oldV = this.sourceVoxelValue.getIndex(index);
          if (oldV === v) {
            // No-op
            return false;
          }
          map.set(index, oldV);
        } else if (v === map.get(index)) {
          map.delete(index);
        }
        this.sourceVoxelValue.setIndex(index, v);
      }
    );
    voxelValue.map = map;
    voxelValue.scalarData = sourceVoxelValue.scalarData;
    voxelValue.sourceVoxelValue = sourceVoxelValue;
    return voxelValue;
  }
}

export type { VoxelValue };
