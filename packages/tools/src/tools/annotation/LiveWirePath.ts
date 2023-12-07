import { LivewirePoint2 } from './LivewirePoint2';

export class LivewirePath {
  /**
   * List of points.
   */
  public pointArray: LivewirePoint2[];

  /**
   * List of control points indexes
   */
  private _controlPointIndexes: number[];

  /**
   * @param inputPointArray - The list of Point2D that make the path (optional).
   * @param inputControlPointIndexArray - The list of control point of path, as indexes (optional).
   *   Note: first and last point do not need to be equal.
   */
  constructor(
    inputPointArray?: LivewirePoint2[],
    inputControlPointIndexArray?: number[]
  ) {
    this.pointArray = inputPointArray ? inputPointArray.slice() : [];
    this._controlPointIndexes = inputControlPointIndexArray
      ? inputControlPointIndexArray.slice()
      : [];
  }

  /**
   * Get a point of the list.
   *
   * @param index - The index of the point to get
   * @returns The Point2D at the given index.
   */
  getPoint(index: number): LivewirePoint2 {
    return this.pointArray[index];
  }

  /**
   * Get the last point of the list.
   *
   * @returns The last point of the list.
   */
  getLastPoint(): LivewirePoint2 {
    return this.pointArray[this.pointArray.length - 1];
  }

  /**
   * Is the given point a control point.
   *
   * @param point - point The Point2D to check.
   * @returns True if a control point.
   */
  isControlPoint(point: LivewirePoint2): boolean {
    const index = this.pointArray.indexOf(point);
    if (index !== -1) {
      return this._controlPointIndexes.indexOf(index) !== -1;
    } else {
      throw new Error('Error: isControlPoint called with not in list point.');
    }
  }

  /**
   * Get the length of the path.
   *
   * @returns The length of the path.
   */
  // getLength(): number {
  //   return this.pointArray.length;
  // }

  /**
   * Add a point to the path.
   *
   * @param point - The Point2 to add.
   */
  addPoint(point: LivewirePoint2) {
    this.pointArray.push(point);
  }

  /**
   * Add a control point to the path.
   *
   * @param point - The Point2D to make a control point.
   */
  addControlPoint(point: LivewirePoint2) {
    const index = this.pointArray.indexOf(point);

    if (index !== -1) {
      this._controlPointIndexes.push(index);
    } else {
      throw new Error('Cannot mark a non registered point as control point.');
    }
  }

  public getControlPoints() {
    return this._controlPointIndexes.map((i) => this.pointArray[i]);
  }

  public getNumControlPoints(): number {
    return this._controlPointIndexes.length;
  }

  public removeLastControlPoint(): void {
    if (this._controlPointIndexes.length) {
      this._controlPointIndexes.pop();
    }
  }

  /**
   * Add points to the path.
   *
   * @param newPointArray - The list of Point2D to add.
   */
  addPoints(newPointArray: LivewirePoint2[]) {
    this.pointArray = this.pointArray.concat(newPointArray);
  }

  /**
   * Prepend a path to this one.
   *
   * @param other - The path to append.
   */
  prependPath(other: LivewirePath): void {
    const otherSize = other.pointArray.length;
    const shiftedIndexArray: number[] = [];

    this.pointArray = other.pointArray.concat(this.pointArray);

    for (let i = 0; i < this._controlPointIndexes.length; ++i) {
      shiftedIndexArray[i] = this._controlPointIndexes[i] + otherSize;
    }

    this._controlPointIndexes =
      other._controlPointIndexes.concat(shiftedIndexArray);
  }

  /**
   * Append a path to this one.
   *
   * @param other - The path to append.
   */
  // appendPath(other: LivewirePath): void {
  //   const oldSize = this.pointArray.length;
  //   const shiftedIndexArray: number[] = [];

  //   this.pointArray = this.pointArray.concat(other.pointArray);

  //   for (let i = 0; i < other._controlPointIndexes.length; ++i) {
  //     shiftedIndexArray[i] = other._controlPointIndexes[i] + oldSize;
  //   }

  //   this._controlPointIndexes =
  //     this._controlPointIndexes.concat(shiftedIndexArray);
  // }
}
