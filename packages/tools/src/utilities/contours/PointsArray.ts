import type { Types } from '@cornerstonejs/core';
import { vec2, vec3 } from 'gl-matrix';

export type PolyDataPointConfiguration = {
  dimensions?: 2 | 3;
  initialSize?: number;
};

/**
 * PointsArray is a TypedArray based representation of 2 or 3d points with
 * custom sub-classes to represent the specific 2 or 3d values and to extract
 * values as Types.Point2/Point3 values.
 * This representation is efficient for storing large numbers of points and for
 * transferring them amongst systems.
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
  public static fromXYZ({ x, y, z }): PointsArray3 {
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
 * A version of this based on Types.Point2 and vec2
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
 * A version of this based on Types.Point3 and vec3
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

  public getXYZ(): { x: number[]; y: number[]; z: number[] } {
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
