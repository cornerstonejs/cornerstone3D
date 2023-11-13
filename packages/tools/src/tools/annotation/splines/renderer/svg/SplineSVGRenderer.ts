import { SplineRenderer } from '../SplineRenderer';
import { Spline } from '../../Spline';

abstract class SplineSVGRenderer<
  T /* extends Spline */
> extends SplineRenderer<T> {
  private _svg: SVGElement;

  constructor(svg: SVGElement) {
    super();
    this._svg = svg;
  }

  public render(spline: T): void {
    console.log('TODO: render');
  }
}

export { SplineSVGRenderer as default, SplineSVGRenderer };
