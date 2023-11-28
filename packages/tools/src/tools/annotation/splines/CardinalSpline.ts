import { CubicSpline } from './CubicSpline';
import { CardinalSplineProps } from '../../../types';

class CardinalSpline extends CubicSpline {
  private _scale: number;
  private _fixedScale: boolean;

  constructor(props?: CardinalSplineProps) {
    super(props);
    this._scale = props?.scale ?? 0.5;
    this._fixedScale = props?.fixedScale ?? false;
  }

  public get scale() {
    return this._scale;
  }

  public set scale(scale: number) {
    if (this._fixedScale || this._scale === scale) {
      return;
    }

    this._scale = scale;
    this.invalidated = true;
  }

  public get fixedScale() {
    return this._fixedScale;
  }

  protected getTransformMatrix(): number[] {
    const { scale: s } = this;
    const s2 = 2 * s;

    // prettier-ignore
    return [
       0,      1,       0,   0,
      -s,      0,       s,   0,
      s2,  s - 3,  3 - s2,  -s,
      -s,  2 - s,   s - 2,   s
    ];
  }
}

export { CardinalSpline as default, CardinalSpline };
