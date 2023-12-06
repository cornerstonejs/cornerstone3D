export class LivewirePoint2 {
  /**
   * X position.
   */
  public x: number;

  /**
   * Y position.
   */
  public y: number;

  /**
   * @param x - The X coordinate for the point.
   * @param y - The Y coordinate for the point.
   */
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /**
   * Get the X position of the point.
   *
   * @returns {number} The X position of the point.
   */
  getX(): number {
    return this.x;
  }

  /**
   * Get the Y position of the point.
   *
   * @returns {number} The Y position of the point.
   */
  getY(): number {
    return this.y;
  }

  /**
   * Check for Point2 equality.
   *
   * @param rhs - The other point to compare to.
   * @returns True if both points are equal.
   */
  equals(rhs: LivewirePoint2): boolean {
    return (
      rhs !== null && this.getX() === rhs.getX() && this.getY() === rhs.getY()
    );
  }

  /**
   * Get a string representation of the Point2.
   *
   * @returns The point as a string.
   */
  toString(): string {
    return '(' + this.getX() + ', ' + this.getY() + ')';
  }

  /**
   * Get the distance to another Point2.
   *
   * @param point2 - The input point.
   * @returns The distance to the input point.
   */
  getDistance(point2: LivewirePoint2): number {
    return Math.sqrt(
      (this.getX() - point2.getX()) * (this.getX() - point2.getX()) +
        (this.getY() - point2.getY()) * (this.getY() - point2.getY())
    );
  }

  /**
   * Round a Point2.
   *
   * @returns The rounded point.
   */
  getRound(): LivewirePoint2 {
    return new LivewirePoint2(Math.round(this.getX()), Math.round(this.getY()));
  }
}
