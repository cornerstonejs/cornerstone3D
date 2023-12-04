import { CardinalSpline } from './CardinalSpline';

// Catmull-Rom spline matrix is a Cardinal spline with scale equal to 1/2. Then
// it can inherit from CubicSpline using the matrix below or inherit from
// CardinalSpline using a fixed scale equal to 0.5.
//
// Transformation Matrix:
//      0,  2,  0,  0,
//     -1,  0,  1,  0,
//      2, -5,  4, -1,
//     -1,  3, -3,  1

class CatmullRomSpline extends CardinalSpline {
  constructor() {
    super({ scale: 0.5, fixedScale: true });
  }
}

export { CatmullRomSpline as default, CatmullRomSpline };
