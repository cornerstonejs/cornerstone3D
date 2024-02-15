import * as rectangle from '../src/utilities/math/rectangle';

describe('Rectangle:', function () {
  beforeEach(function () {
    // Note: coordinate system is image coordinate, not cartesian
    this.left = 1;
    this.top = 2;
    this.width = 1;
    this.height = 1;
  });

  it('should correctly calculate the distance to line', function () {
    // point on the rectangle
    let point = [1, 2];

    let distance = rectangle.distanceToPoint(
      [this.left, this.top, this.width, this.height],
      point
    );

    expect(distance).toEqual(0);

    // outside
    point = [1, 1];

    distance = rectangle.distanceToPoint(
      [this.left, this.top, this.width, this.height],
      point
    );

    expect(distance).toEqual(1);

    // diagonal outside
    point = [0, 1];

    distance = rectangle.distanceToPoint(
      [this.left, this.top, this.width, this.height],
      point
    );

    expect(distance).toEqual(Math.sqrt(2));
  });
});
