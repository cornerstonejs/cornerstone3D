import { SplineRenderer } from '../SplineRenderer';
import { Spline } from '../../Spline';

abstract class SplineCanvasRenderer<
  T /* extends Spline */
> extends SplineRenderer<T> {
  private _canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    super();
    this._canvas = canvas;
  }

  public render(spline: T): void {
    console.log('TODO: render');
  }
}

export { SplineCanvasRenderer as default, SplineCanvasRenderer };
