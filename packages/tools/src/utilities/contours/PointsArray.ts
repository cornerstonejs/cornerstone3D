import type { Types } from '@cornerstonejs/core';
import { vec2, vec3 } from 'gl-matrix';

export type PolyDataPointConfiguration = {
  dimensions?: 2 | 3;
  initialSize?: number;
};

/**
 * PointsArray is a TypedArray based representation of n dimensional points with
 * custom sub-classes to represent the version of this based on Point2 and Point3
 * gl-matrix implementation.
 * This representation is efficient for storing large numbers of points and for
 * transferring them amongst systems and is planned to have more methods added
 * for generic manipulation of data.
 */
export abstract class PointsArray<T> {
  data: Float32Array;
  dimensions = 3;
  public length = 0;

  constructor(configuration: PolyDataPointConfiguration = {}) {
    const { initialSize = 1024, dimensions = 3 } = configuration;
    this.data = new Float32Array(initialSize * dimensions);
    this.dimensions = dimensions;
  }

  protected forEach(func: (value: T, index: number) => void, point: T) {
    for (let i = 0; i < this.length; i++) {
      func(this.getPoint(i, point), i);
    }
  }

  abstract getPoint(index: number, point: T): T;

  /**
   * Reverse the points in place
   */
  public reverse() {
    const midLength = Math.floor(this.length / 2);

    for (let i = 0; i < midLength; i++) {
      const indexStart = i * this.dimensions;
      const indexEnd = (this.length - 1 - i) * this.dimensions;
      for (let dimension = 0; dimension < this.dimensions; dimension++) {
        const valueStart = this.data[indexStart + dimension];
        this.data[indexStart + dimension] = this.data[indexEnd + dimension];
        this.data[indexEnd + dimension] = valueStart;
      }
    }
  }

  protected map(f: (value, index: number) => T, factory: (index: number) => T) {
    const mapData = [];
    for (let i = 0; i < this.length; i++) {
      mapData.push(f(this.getPoint(i, factory(i)), i));
    }
    return mapData;
  }

  /** Create an PointsArray3 from the x,y,z individual arrays */
  public static fromXYZ({ x, y, z }: Types.PointsXYZ): PointsArray3 {
    const array = new PointsArray3({ initialSize: x.length });
    let offset = 0;
    for (let i = 0; i < x.length; i++) {
      array.data[offset++] = x[i];
      array.data[offset++] = y[i];
      array.data[offset++] = z[i];
    }
    array.length = x.length;
    return array;
  }
}

/**
 * A version of this with support for Types.Point2 and vec2 generation and extraction.
 *
 * This class is designed to allow for efficient storage and manipulation of
 * large sets of Point2 type data but stored as a single Float32Array.
 */
export class PointsArray2 extends PointsArray<Types.Point2> {
  constructor(configuration = {}) {
    super({ ...configuration, dimensions: 2 });
  }

  public forEach(
    func: (value: Types.Point2, index: number) => void,
    point = vec2.create() as Types.Point2
  ) {
    super.forEach(func, point);
  }

  public getPoint(index: number, point = vec2.create() as Types.Point2) {
    if (index >= this.length) {
      return;
    }
    const index2 = index * 2;
    point[0] = this.data[index2];
    point[1] = this.data[index2 + 1];
    return point;
  }

  public get points() {
    return this.map(
      (point) => point,
      () => vec2.create() as Types.Point2
    );
  }
}

/**
 * A version of PointsArray designed to work with Types.Point3 and vec3 data,
 * but efficiently storing the data internally as a Float32Array.
 * A good use case for this would be storing contour data or function results
 * of type `(number)=>Point3` as these can be quite large and can benefit from
 * directly using the Float32Array representation for both the Point3 values and
 * the internal storage of the Point3[] data.
 *
 * For example, a 64k length array of `PointsArray3` data is just a bit over 256k of data as
 * stored with this class, but when stored as a Point3[], is at least 1 meg in size
 * because each number is 64 bits, and each Point3[] requires a list of values, adding
 * at least another 8 bytes per value, and at least another 64 bytes per array.
 */
export class PointsArray3 extends PointsArray<Types.Point3> {
  constructor(configuration = {}) {
    super({ ...configuration, dimensions: 3 });
  }

  public forEach(
    func: (value: Types.Point3, index: number) => void,
    point = vec3.create() as Types.Point3
  ) {
    super.forEach(func, point);
  }

  public getPoint(index: number, point = vec3.create() as Types.Point3) {
    if (index >= this.length) {
      return;
    }
    const index2 = index * 3;
    point[0] = this.data[index2];
    point[1] = this.data[index2 + 1];
    point[2] = this.data[index2 + 2];
    return point;
  }

  public get points() {
    return this.map(
      (point) => point,
      () => vec3.create() as Types.Point3
    );
  }

  public getXYZ(): Types.PointsXYZ {
    const x = [];
    const y = [];
    const z = [];
    this.forEach((point) => {
      x.push(point[0]);
      y.push(point[1]);
      z.push(point[2]);
    });
    return { x, y, z };
  }
}
