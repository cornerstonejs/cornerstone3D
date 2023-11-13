import { Spline } from './Spline';
import type { SplineLineSegment } from './types/SplineLineSegment';
import type { SplineCurveSegment } from './types/SplineCurveSegment';

abstract class QuadraticSpline extends Spline {
  // TODO: QuadraticSpline :: getSplineCurves
  protected getSplineCurves(): SplineCurveSegment[] {
    return [];
  }

  // TODO: QuadraticSpline :: getLineSegments
  protected getLineSegments(): SplineLineSegment[] {
    return [];
  }
}

export { QuadraticSpline as default, QuadraticSpline };
