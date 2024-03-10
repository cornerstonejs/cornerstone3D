import { QuadraticSpline } from './QuadraticSpline';

// prettier-ignore
const TRANSFORM_MATRIX = [
   1,  0,  0,
  -2,  2,  0,
   1, -2,  1,
];

class QuadraticBezier extends QuadraticSpline {
  public hasTangentPoints() {
    return true;
  }

  protected getTransformMatrix(): number[] {
    return TRANSFORM_MATRIX;
  }
}

export { QuadraticBezier as default, QuadraticBezier };
