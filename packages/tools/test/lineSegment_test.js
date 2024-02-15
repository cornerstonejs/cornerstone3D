import * as lineSegment from '../src/utilities/math/line';

describe('LineSegment:', function () {
  beforeEach(function () {
    this.line1Start = [1, 1];
    this.line1End = [2, 2];
  });

  it('should correctly calculate the distance to line', function () {
    // point on the line
    let point1 = [1, 1];
    let distance = lineSegment.distanceToPoint(
      this.line1Start,
      this.line1End,
      point1
    );
    expect(distance).toEqual(0);

    // point outside in the same direction
    point1 = [3, 3];
    distance = lineSegment.distanceToPoint(
      this.line1Start,
      this.line1End,
      point1
    );
    expect(distance).toEqual(Math.sqrt(2));

    // point outside not along the line direction
    point1 = [2, 1];
    distance = lineSegment.distanceToPoint(
      this.line1Start,
      this.line1End,
      point1
    );
    expect(distance).toEqual(Math.sqrt(1 / 2));

    // point outside
    point1 = [3, 4];
    distance = lineSegment.distanceToPoint(
      this.line1Start,
      this.line1End,
      point1
    );
    expect(distance).toEqual(Math.sqrt(5));
  });

  it('should correctly calculate the intersection of two lines', function () {
    // Shares one point already
    let line2Start = [1, 2];
    let line2End = [2, 2];
    let point = lineSegment.intersectLine(
      this.line1Start,
      this.line1End,
      line2Start,
      line2End
    );
    expect(point).toEqual([2, 2]);

    // Don't share any point
    line2Start = [1, 2];
    line2End = [2, 1];
    point = lineSegment.intersectLine(
      this.line1Start,
      this.line1End,
      line2Start,
      line2End
    );
    expect(point).toEqual([1.5, 1.5]);

    // Don't intersect
    line2Start = [2, 1];
    line2End = [3, 1];
    point = lineSegment.intersectLine(
      this.line1Start,
      this.line1End,
      line2Start,
      line2End
    );
    expect(point).toEqual(undefined);

    // Overlap
    line2Start = [1, 1];
    line2End = [2, 2];
    point = lineSegment.intersectLine(
      this.line1Start,
      this.line1End,
      line2Start,
      line2End
    );
    expect(point).toEqual([NaN, NaN]);
  });
});
