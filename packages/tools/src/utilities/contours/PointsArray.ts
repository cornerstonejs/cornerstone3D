import type { Types } from '@cornerstonejs/core';
import { vec2, vec3 } from 'gl-matrix';

export type PolyDataPointConfiguration = {
  dimensions?: 2 | 3;
  initialSize?: number;
};

type Point23 = Types.Point2 | Types.Point3;

/**
 * PointsArray is a TypedArray based representation of 2 or 3d points with
 * custom sub-classes to represent the specific 2 or 3d values and to extract
 * values as Types.Point2/Point3 values.
 * This representation is efficient for storing large numbers of points and for
 * transferring them amongs systems.
 */
export abstract class PointsArray<T> {
  data: Float32Array;
  dimensions = 3;
  public length = 0;

  constructor(configuration: PolyDataPointConfiguration = {}) {
    const { initialSize = 1024, dimensions = 3 } = configuration;
    this.data = new Float32Array(initialSize);
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
    const midLength = Math.floor(length / 2);

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
}

/**
 * A version of this based on Types.Point2 and vec2
 */
export class PolyDataPoints2 extends PointsArray<Types.Point2> {
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

  public get point2() {
    return this.map(
      (point) => point,
      () => vec2.create() as Types.Point2
    );
  }
}
