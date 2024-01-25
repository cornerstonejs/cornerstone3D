import type { Types } from '@cornerstonejs/core';
import { vec2, vec3 } from 'gl-matrix';

export type PolyDataPointConfiguration = {
  /** The dimensionality of the points */
  dimensions?: 2 | 3;
  /** The initial size of the backing array, not containing any data initially */
  initialSize?: number;
  /** The incremental size to grow by when required */
  growSize?: number;
};

/**
 * PointsArray is a TypedArray based representation of n dimensional points with
 * custom sub-classes to represent the version of this based on Point2 and Point3
 * gl-matrix implementation.
 * This representation is efficient for storing large numbers of points and for
 * transferring them amongst systems and is planned to have more methods added
 * for generic manipulation of data.
 */
export class PointsArray<T> {
  data: Float32Array;
  _dimensions = 3;
  _length = 0;
  _byteSize = 4;
  growSize = 128;
  array: ArrayBuffer;

  constructor(configuration: PolyDataPointConfiguration = {}) {
    const {
      initialSize = 1024,
      dimensions = 3,
      growSize = 128,
    } = configuration;
    const itemLength = initialSize * dimensions;
    this.growSize = growSize;
    // TODO - use resizeable arrays when they become available in all browsers
    this.array = new ArrayBuffer(itemLength * this._byteSize);
    this.data = new Float32Array(this.array);
    this._dimensions = dimensions;
  }

  public forEach(func: (value: T, index: number) => void) {
    for (let i = 0; i < this._length; i++) {
      func(this.getPoint(i), i);
    }
  }

  public get length() {
    return this._length;
  }

  public get dimensions() {
    return this._dimensions;
  }

  public get dimensionLength() {
    return this._length * this._dimensions;
  }

  public getPoint(index: number): T {
    if (index < 0) {
      index += this._length;
    }
    if (index < 0 || index >= this._length) {
      return;
    }
    const offset = this._dimensions * index;
    return this.data.subarray(offset, offset + this._dimensions) as T;
  }

  /**
   * Adds the additional amount requested
   */
  protected grow(additionalSize = 1, growSize = this.growSize) {
    if (
      this.dimensionLength + additionalSize * this._dimensions <=
      this.data.length
    ) {
      return;
    }
    const newSize = this.data.length + growSize;
    const newArray = new ArrayBuffer(
      newSize * this._dimensions * this._byteSize
    );
    const newData = new Float32Array(newArray);
    newData.set(this.data);
    this.data = newData;
    this.array = newArray;
  }

  /**
   * Reverse the points in place
   */
  public reverse() {
    const midLength = Math.floor(this._length / 2);

    for (let i = 0; i < midLength; i++) {
      const indexStart = i * this._dimensions;
      const indexEnd = (this._length - 1 - i) * this._dimensions;
      for (let dimension = 0; dimension < this._dimensions; dimension++) {
        const valueStart = this.data[indexStart + dimension];
        this.data[indexStart + dimension] = this.data[indexEnd + dimension];
        this.data[indexEnd + dimension] = valueStart;
      }
    }
  }

  public push(point: T) {
    this.grow(1);
    const offset = this.length * this._dimensions;
    for (let i = 0; i < this._dimensions; i++) {
      this.data[i + offset] = point[i];
    }
    this._length++;
  }

  public map<R>(f: (value, index: number) => R): R[] {
    const mapData = [];
    for (let i = 0; i < this._length; i++) {
      mapData.push(f(this.getPoint(i), i));
    }
    return mapData;
  }

  public get points(): T[] {
    return this.map((p) => p);
  }

  /**
   * @returns An XYZ array
   */
  public toXYZ(): Types.PointsXYZ {
    const xyz = { x: [], y: [], z: [] };
    this.forEach((p) => {
      xyz.x.push(p[0]);
      xyz.y.push(p[1]);
      xyz.z.push(p[2] ?? 0);
    });
    return xyz;
  }

  /** Create an PointsArray3 from the x,y,z individual arrays */
  public static fromXYZ({
    x,
    y,
    z,
  }: Types.PointsXYZ): PointsArray<Types.Point3> {
    const array = PointsArray.create3(x.length);
    let offset = 0;
    for (let i = 0; i < x.length; i++) {
      array.data[offset++] = x[i];
      array.data[offset++] = y[i];
      array.data[offset++] = z[i];
    }
    array._length = x.length;
    return array;
  }

  public subselect(count = 10, offset = 0): T[] {
    const selected = [];
    for (let i = 0; i < count; i++) {
      const index =
        (offset + Math.floor((this.length * i) / count)) % this.length;
      selected.push(this.getPoint(index));
    }
    return selected;
  }

  public static create3(initialSize = 128) {
    return new PointsArray<Types.Point3>({ initialSize, dimensions: 3 });
  }

  public static create2(initialSize = 128) {
    return new PointsArray<Types.Point3>({ initialSize, dimensions: 2 });
  }
}
