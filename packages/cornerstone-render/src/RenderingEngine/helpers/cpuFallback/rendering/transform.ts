import {
  CPUFallbackTransform,
  Point2,
  TransformMatrix2D,
} from '../../../../types';

// By Simon Sarris
// Www.simonsarris.com
// Sarris@acm.org
//
// Free to use and distribute at will
// So long as you are nice to people, etc

// Simple class for keeping track of the current transformation matrix

// For instance:
//    Var t = new Transform();
//    T.rotate(5);
//    Var m = t.m;
//    Ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);

// Is equivalent to:
//    Ctx.rotate(5);

// But now you can retrieve it :)

// Remember that this does not account for any CSS transforms applied to the canvas
export class Transform implements CPUFallbackTransform {
  private m: TransformMatrix2D;

  constructor() {
    this.reset();
  }

  getMatrix(): TransformMatrix2D {
    return this.m;
  }

  reset(): void {
    this.m = [1, 0, 0, 1, 0, 0];
  }

  clone(): CPUFallbackTransform {
    const transform = new Transform();

    transform.m[0] = this.m[0];
    transform.m[1] = this.m[1];
    transform.m[2] = this.m[2];
    transform.m[3] = this.m[3];
    transform.m[4] = this.m[4];
    transform.m[5] = this.m[5];

    return transform;
  }

  multiply(matrix: TransformMatrix2D): void {
    const m11 = this.m[0] * matrix[0] + this.m[2] * matrix[1];
    const m12 = this.m[1] * matrix[0] + this.m[3] * matrix[1];

    const m21 = this.m[0] * matrix[2] + this.m[2] * matrix[3];
    const m22 = this.m[1] * matrix[2] + this.m[3] * matrix[3];

    const dx = this.m[0] * matrix[4] + this.m[2] * matrix[5] + this.m[4];
    const dy = this.m[1] * matrix[4] + this.m[3] * matrix[5] + this.m[5];

    this.m[0] = m11;
    this.m[1] = m12;
    this.m[2] = m21;
    this.m[3] = m22;
    this.m[4] = dx;
    this.m[5] = dy;
  }

  invert(): void {
    const d = 1 / (this.m[0] * this.m[3] - this.m[1] * this.m[2]);
    const m0 = this.m[3] * d;
    const m1 = -this.m[1] * d;
    const m2 = -this.m[2] * d;
    const m3 = this.m[0] * d;
    const m4 = d * (this.m[2] * this.m[5] - this.m[3] * this.m[4]);
    const m5 = d * (this.m[1] * this.m[4] - this.m[0] * this.m[5]);

    this.m[0] = m0;
    this.m[1] = m1;
    this.m[2] = m2;
    this.m[3] = m3;
    this.m[4] = m4;
    this.m[5] = m5;
  }

  rotate(rad: number): void {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const m11 = this.m[0] * c + this.m[2] * s;
    const m12 = this.m[1] * c + this.m[3] * s;
    const m21 = this.m[0] * -s + this.m[2] * c;
    const m22 = this.m[1] * -s + this.m[3] * c;

    this.m[0] = m11;
    this.m[1] = m12;
    this.m[2] = m21;
    this.m[3] = m22;
  }

  translate(x: number, y: number): void {
    this.m[4] += this.m[0] * x + this.m[2] * y;
    this.m[5] += this.m[1] * x + this.m[3] * y;
  }

  scale(sx: number, sy: number) {
    this.m[0] *= sx;
    this.m[1] *= sx;
    this.m[2] *= sy;
    this.m[3] *= sy;
  }

  transformPoint(point: Point2): Point2 {
    const x = point[0];
    const y = point[1];

    return [
      x * this.m[0] + y * this.m[2] + this.m[4],
      x * this.m[1] + y * this.m[3] + this.m[5],
    ];
  }
}
