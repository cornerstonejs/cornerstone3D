import type { Types } from '@cornerstonejs/core';
import { vec2, vec3 } from 'gl-matrix';

export type PolyDataPointConfiguration = {
  dimensions?: 2 | 3;
  initialSize?: number;
};
/**
 * This class is a vector of 2 or 3d points, represented as a Float32Array with
 * each point being consecutive values.
 */
export abstract class PolyDataPoints {
  data: Float32Array;
  dimensions = 3;
  public length = 0;

  constructor(configuration: PolyDataPointConfiguration = {}) {
    const { initialSize = 1024, dimensions = 3 } = configuration;
    this.data = new Float32Array(initialSize);
    this.dimensions = dimensions;
  }

  protected forEach(func: (value, index: number) => void, point) {
    for (let i = 0; i < this.length; i++) {
      func(this.getPoint(i, point), i);
    }
  }

  abstract getPoint(index: number, point);
}

export class PolyDataPoints2 extends PolyDataPoints {
  constructor(configuration = {}) {
    super({ ...configuration, dimensions: 2 });
  }

  public forEach(
    func: (value: Types.Point2, index: number) => void,
    point = vec2.create()
  ) {
    super.forEach(func, point);
  }

  public getPoint(index: number, point = vec2.create()) {
    if (index >= this.length) {
      return;
    }
    const index2 = index * 2;
    point[0] = this.data[index2];
    point[1] = this.data[index2 + 1];
    return point;
  }
}
