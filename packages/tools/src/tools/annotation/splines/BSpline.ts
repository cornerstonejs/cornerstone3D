import { mat4 } from 'gl-matrix';
import { CubicSpline } from './CubicSpline';

// prettier-ignore
const TRANSFORM_MATRIX = mat4.multiplyScalar(
  mat4.create(),
  mat4.fromValues(
     1,  4,  1,  0,
    -3,  0,  3,  0,
     3, -6,  3,  0,
    -1,  3, -3,  1,
  ),
  1 / 6
) as number[];

class BSpline extends CubicSpline {
  protected getTransformMatrix(): number[] {
    return TRANSFORM_MATRIX;
  }
}

export { BSpline as default, BSpline };
