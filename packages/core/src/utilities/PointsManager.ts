import type { Point2, Point3, PointsXYZ } from '../types';

export type PolyDataPointConfiguration = {
  /** The dimensionality of the points */
  dimensions?: number;
  /** The initial size of the backing array, not containing any data initially */
  initialSize?: number;
  /** The incremental size to grow by when required */
  growSize?: number;
};

/**
 * PointsManager handles Point type data contained in a TypedArray representation
 * where all the point data is consecutive from start to end.  That is, the
 * organization is  `x0,y0,z0,x1,y1,z1,...,xn,yn,zn`.  This optimizes the storage
 * costs for large arrays of data, while still providing access to the point
 * data as though it were a simple array of objects.
 *
 * This representation is efficient for storing large numbers of points and for
 * transferring them amongst systems and is planned to have more methods added
 * for generic manipulation of data.
 */
export default class PointsManager<T> {
  /**
   *  Allow storage for an index value to indicate where this array is
   * contained in terms of the index location.
   */
  public kIndex: number;

  /**
   * Sources data for this array.  Just used for external access, not updated
   * here.
   */
  public sources: PointsManager<T>[];

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
    return this.data.subarray(
      offset,
      offset + this._dimensions
    ) as unknown as T;
  }

  public getPointArray(index: number): T {
    const array = [];
    if (index < 0) {
      index += this._length;
    }
    if (index < 0 || index >= this._length) {
      return;
    }
    const offset = this._dimensions * index;
    for (let i = 0; i < this._dimensions; i++) {
      array.push(this.data[i + offset]);
    }
    return array as unknown as T;
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
   * The XYZ representation of a points array is an object with three separate
   * arrays, one for each of x,y and z, containing the point data, eg
   * `x: {x0, x1, x2, ...., xn }`
   *
   * @returns An XYZ array
   */
  public toXYZ(): PointsXYZ {
    const xyz = { x: [], y: [], z: [] };
    this.forEach((p) => {
      xyz.x.push(p[0]);
      xyz.y.push(p[1]);
      xyz.z.push(p[2] ?? 0);
    });
    return xyz;
  }

  /** Create an PointsArray3 from the x,y,z individual arrays */
  public static fromXYZ({ x, y, z }: PointsXYZ): PointsManager<Point3> {
    const array = PointsManager.create3(x.length);
    let offset = 0;
    for (let i = 0; i < x.length; i++) {
      array.data[offset++] = x[i];
      array.data[offset++] = y[i];
      array.data[offset++] = z[i];
    }
    array._length = x.length;
    return array;
  }

  public subselect(count = 10, offset = 0): PointsManager<T> {
    const selected = new PointsManager<T>({
      initialSize: count,
      dimensions: this._dimensions,
    });
    for (let i = 0; i < count; i++) {
      const index =
        (offset + Math.floor((this.length * i) / count)) % this.length;
      selected.push(this.getPoint(index));
    }
    return selected;
  }

  public static create3(initialSize = 128) {
    return new PointsManager<Point3>({ initialSize, dimensions: 3 });
  }

  public static create2(initialSize = 128) {
    return new PointsManager<Point2>({ initialSize, dimensions: 2 });
  }
}
