import { LivewirePoint2 } from './LivewirePoint2';

export class LivewirePath {
  /**
   * List of points.
   */
  public pointArray: LivewirePoint2[];

  /**
   * List of control points.
   */
  public controlPointIndexArray: number[];

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
    this.controlPointIndexArray = inputControlPointIndexArray
      ? inputControlPointIndexArray.slice()
      : [];
  }

  /**
   * Get a point of the list.
   *
   * @param index - The index of the point
   *   to get (beware, no size check).
   * @returns The Point2D at the given index.
   */
  getPoint(index: number): LivewirePoint2 {
    return this.pointArray[index];
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
      return this.controlPointIndexArray.indexOf(index) !== -1;
    } else {
      throw new Error('Error: isControlPoint called with not in list point.');
    }
  }

  /**
   * Get the length of the path.
   *
   * @returns The length of the path.
   */
  getLength(): number {
    return this.pointArray.length;
  }

  /**
   * Add a point to the path.
   *
   * @param point - The Point2D to add.
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
      this.controlPointIndexArray.push(index);
    } else {
      throw new Error('Cannot mark a non registered point as control point.');
    }
  }

  getControlPoints() {
    return this.controlPointIndexArray.map((i) => this.pointArray[i]);
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
   * Append a Path to this one.
   *
   * @param other - The Path to append.
   */
  appendPath(other: LivewirePath) {
    const oldSize = this.pointArray.length;
    this.pointArray = this.pointArray.concat(other.pointArray);
    const indexArray = [];

    for (let i = 0; i < other.controlPointIndexArray.length; ++i) {
      indexArray[i] = other.controlPointIndexArray[i] + oldSize;
    }

    this.controlPointIndexArray =
      this.controlPointIndexArray.concat(indexArray);
  }
}
