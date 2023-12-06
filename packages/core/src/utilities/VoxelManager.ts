import type { BoundsIJK, Point3, VolumeScalarData } from '../types';

/**
 * This is a simple, standard interface to values associated with a voxel.
 */
export default class VoxelManager<T> {
  public modifiedSlices = new Set<number>();
  public boundsIJK = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ] as BoundsIJK;

  // Provide direct access to the underlying data, if any
  public scalarData: VolumeScalarData;
  public map: Map<number, T>;
  public sourceVoxelValue: VoxelManager<T>;
  public isInObject: (pointIPS, pointIJK) => boolean;
  public readonly dimensions: Point3;

  points: Set<number>;
  width: number;
  frameSize: number;
  _get: (index: number) => T;
  _set: (index: number, v: T) => boolean | void;

  /**
   * Creates a generic voxel value accessor, with access to the values
   * provided by the _get and optionally _set values.
   * @param dimensions - for the voxel volume
   * @param _get - called to get a value by index
   * @param _set  - called when setting a value
   */
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

  /**
   * Gets the voxel value at position i,j,k.
   */
  public getAtIJK = (i, j, k) => {
    const index = i + j * this.width + k * this.frameSize;
    return this._get(index);
  };

  /**
   * Sets the voxel value at position i,j,k and records the slice
   * that was modified.
   */
  public setAtIJK = (i: number, j: number, k: number, v) => {
    const index = i + j * this.width + k * this.frameSize;
    if (this._set(index, v) !== false) {
      this.modifiedSlices.add(k);
      VoxelManager.addBounds(this.boundsIJK, [i, j, k]);
    }
  };

  /**
   * Adds a point as an array or an index value to the set of points
   * associated with this voxel value.
   * Can be used for tracking clicked points or other modified values.
   */
  public addPoint(point: Point3 | number) {
    const index = Array.isArray(point)
      ? point[0] + this.width * point[1] + this.frameSize * point[2]
      : point;
    if (!this.points) {
      this.points = new Set<number>();
    }
    this.points.add(index);
  }

  /**
   * Gets the list of added points as an array of Point3 values
   */
  public getPoints(): Point3[] {
    return this.points
      ? [...this.points].map((index) => this.toIJK(index))
      : [];
  }

  /**
   * Gets the points added using addPoint as an array of indices.
   */
  public getPointIndices(): number[] {
    return this.points ? [...this.points] : [];
  }

  /**
   * Gets the voxel value at the given Point3 location.
   */
  public getAt = ([i, j, k]) => this.getAtIJK(i, j, k);

  /**
   * Sets the voxel value at the given point3 location to the specified value.
   * Records the z index modified.
   * Will record the index value if the VoxelManager is backed by a map.
   */
  public setAt = ([i, j, k], v) => this.setAtIJK(i, j, k, v);

  /**
   * Gets the value at the given index.
   */
  public getAtIndex = (index) => this._get(index);

  /**
   * Sets the value at the given index
   */
  public setAtIndex = (index, v) => {
    if (this._set(index, v) !== false) {
      const pointIJK = this.toIJK(index);
      this.modifiedSlices.add(pointIJK[2]);
      VoxelManager.addBounds(this.boundsIJK, pointIJK);
    }
  };

  /**
   * Converts an index value to a Point3 IJK value
   */
  public toIJK(index: number): Point3 {
    return [
      index % this.width,
      Math.floor((index % this.frameSize) / this.width),
      Math.floor(index / this.frameSize),
    ];
  }

  /**
   * Converts an IJK Point3 value to an index value
   */
  public toIndex(ijk: Point3) {
    return ijk[0] + ijk[1] * this.width + ijk[2] * this.frameSize;
  }

  /**
   * Gets the bounds for the modified set of values.
   */
  public getBoundsIJK(): BoundsIJK {
    if (this.boundsIJK[0][0] < this.dimensions[0]) {
      return this.boundsIJK;
    }
    return this.dimensions.map((dimension) => [0, dimension - 1]) as BoundsIJK;
  }

  /**
   * Iterate over the points within the bounds, or the modified points if recorded.
   */
  public forEach = (callback, options?) => {
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
            const value = this.getAtIndex(index);
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

  /**
   * Extends the bounds of this object to include the specified point
   */
  public static addBounds(bounds: BoundsIJK, point: Point3) {
    bounds.forEach((bound, index) => {
      bound[0] = Math.min(point[index], bound[0]);
      bound[1] = Math.max(point[index], bound[1]);
    });
  }

  /**
   *  Creates a volume value accessor, based on a volume scalar data instance.
   * This also works for image value accessors for single plane (k=0) accessors.
   */
  public static volumeVoxelValue(
    dimensions: Point3,
    scalarData
  ): VoxelManager<number> {
    const voxels = new VoxelManager(
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
   * Creates a volume map value accessor.  This is initially empty and
   * the map stores the index to value instances.
   */
  public static mapVoxelValue<T>(dimension: Point3): VoxelManager<T> {
    const map = new Map<number, T>();
    const voxelValue = new VoxelManager(
      dimension,
      map.get.bind(map),
      (index, v) => map.set(index, v) && true
    );
    voxelValue.map = map;
    return voxelValue;
  }

  /**
   * Clears any map specific data, as wellas the modified slices, points and
   * bounds.
   */
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

  /**
   * @returns The array of modified k indices
   */
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
    sourceVoxelValue: VoxelManager<T>
  ): VoxelManager<T> {
    const map = new Map<number, T>();
    const { dimensions } = sourceVoxelValue;
    const voxelValue = new VoxelManager(
      dimensions,
      (index) => map.get(index),
      function (index, v) {
        if (!map.has(index)) {
          const oldV = this.sourceVoxelValue.getAtIndex(index);
          if (oldV === v) {
            // No-op
            return false;
          }
          map.set(index, oldV);
        } else if (v === map.get(index)) {
          map.delete(index);
        }
        this.sourceVoxelValue.setAtIndex(index, v);
      }
    );
    voxelValue.map = map;
    voxelValue.scalarData = sourceVoxelValue.scalarData;
    voxelValue.sourceVoxelValue = sourceVoxelValue;
    return voxelValue;
  }
}

export type { VoxelManager };
