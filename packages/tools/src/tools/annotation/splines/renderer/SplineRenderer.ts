import { Spline } from '../Spline';

abstract class SplineRenderer<T /* extends Spline */> {
  public abstract render(spline: T): void;
}

export { SplineRenderer as default, SplineRenderer };
