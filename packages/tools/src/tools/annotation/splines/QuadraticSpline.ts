import { Types } from '@cornerstonejs/core';
import { Spline } from './Spline';
import type { SplineLineSegment, SplineCurveSegment } from '../../../types/';

abstract class QuadraticSpline extends Spline {
  // TODO: QuadraticSpline :: getSplineCurves
  protected getSplineCurves(): SplineCurveSegment[] {
    return [];
  }

  // TODO: QuadraticSpline :: getLineSegments
  protected getLineSegments(): SplineLineSegment[] {
    return [];
  }

  // TODO: QuadraticSpline :: getPreviewCurveSegments
  public getPreviewCurveSegments(
    controlPointPreview: Types.Point2,
    closeSpline: boolean
  ): SplineCurveSegment[] {
    return [];
  }
}

export { QuadraticSpline as default, QuadraticSpline };
