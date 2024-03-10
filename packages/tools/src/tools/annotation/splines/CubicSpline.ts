import { vec4, mat4 } from 'gl-matrix';
import { Types } from '@cornerstonejs/core';
import { Spline } from './Spline';
import * as math from '../../../utilities/math';
import type { SplineCurveSegment, SplineLineSegment } from '../../../types';

// The `u` in Parameter Space used when spliting a curve segment into line segments must
// be greater than or equal to `curveSegmentIndex` and smaller than `curveSegmentIndex + 1`.
// In this case we are using `curveSegmentIndex + 1 - MAX_U_ERROR`
const MAX_U_ERROR = 1e-8;

/**
 * Base class for all cubic splines
 */
abstract class CubicSpline extends Spline {
  protected getPreviewCurveSegments(
    controlPointPreview: Types.Point2,
    closeSpline: boolean
  ): SplineCurveSegment[] {
    const previewNumCurveSegments = this._getNumCurveSegments() + 1;
    const startCurveSegIndex = Math.max(0, previewNumCurveSegments - 2);
    const endCurveSegIndex = closeSpline
      ? previewNumCurveSegments
      : previewNumCurveSegments - 1;
    const transformMatrix = this.getTransformMatrix();
    const controlPoints = [...this.controlPoints];
    const curveSegments: SplineCurveSegment[] = [];

    if (!closeSpline) {
      controlPoints.push(controlPointPreview);
    }

    for (let i = startCurveSegIndex; i <= endCurveSegIndex; i++) {
      const curveSegment = this._getCurveSegment(
        i,
        transformMatrix,
        controlPoints,
        closeSpline
      );

      curveSegments.push(curveSegment);
    }

    return curveSegments;
  }

  protected getSplineCurves(): SplineCurveSegment[] {
    const numCurveSegments = this._getNumCurveSegments();
    const curveSegments: SplineCurveSegment[] = new Array(numCurveSegments);

    if (numCurveSegments <= 0) {
      return [];
    }

    const transformMatrix = this.getTransformMatrix();
    let previousCurveSegmentsLength = 0;

    for (let i = 0; i < numCurveSegments; i++) {
      const curveSegment = this._getCurveSegment(i, transformMatrix);

      curveSegment.previousCurveSegmentsLength = previousCurveSegmentsLength;
      curveSegments[i] = curveSegment;

      previousCurveSegmentsLength += curveSegment.length;
    }

    return curveSegments;
  }

  private _getNumCurveSegments(
    controlPoints: Types.Point2[] = this.controlPoints,
    closed: boolean = this.closed
  ): number {
    return closed
      ? controlPoints.length
      : Math.max(0, controlPoints.length - 1);
  }

  /**
   * Get a point on a spline curve given `u` value
   *
   * @param u - `u` value in Parameter Space that must be between 0 and N where N is the number of
   *   curve segments for opened splines or any negative/positive number for closed splines
   * @returns - Point (x, y) on the spline. It may return `undefined` when `u` is smaller than 0
   *   or greater than N for opened splines
   */
  private _getPoint(
    u: number,
    transformMatrix: number[],
    controlPoints: Types.Point2[] = this.controlPoints,
    closed: boolean = this.closed
  ): Types.Point2 {
    const numCurveSegments = this._getNumCurveSegments(controlPoints, closed);
    const uInt = Math.floor(u);
    let curveSegmentIndex = uInt % numCurveSegments;

    // `t` must be between 0 and 1
    const t = u - uInt;

    const curveSegmentIndexOutOfBounds =
      curveSegmentIndex < 0 || curveSegmentIndex >= numCurveSegments;

    if (curveSegmentIndexOutOfBounds) {
      if (this.closed) {
        // Wraps around when the index is negative or greater than or equal to `numSegments`
        curveSegmentIndex =
          (numCurveSegments + curveSegmentIndex) % numCurveSegments;
      } else {
        // Point is not on the spline curve
        return;
      }
    }

    const { p0, p1, p2, p3 } = this._getCurveSegmentPoints(
      curveSegmentIndex,
      controlPoints,
      closed
    );

    // Formula to find any point on a cubic spline curve given a `t` value
    //
    // P(t) = [1  t  t2  t3] | m00 m01 m02 m03 |  | P0 |
    //                       | m10 m11 m12 m13 |  | P1 |
    //                       | m20 m21 m22 m23 |  | P2 |
    //                       | m30 m31 m32 m33 |  | P3 |

    const tt = t * t;
    const ttt = tt * t;
    const tValues = vec4.fromValues(1, t, tt, ttt);

    // Influential field values which tell us how much P0, P1, P2 and P3 influence
    // each point of the curve
    const qValues = vec4.transformMat4(
      vec4.create(),
      tValues,
      transformMatrix as mat4
    );

    return [
      vec4.dot(qValues, vec4.fromValues(p0[0], p1[0], p2[0], p3[0])),
      vec4.dot(qValues, vec4.fromValues(p0[1], p1[1], p2[1], p3[1])),
    ] as Types.Point2;
  }

  private _getCurveSegmentPoints(
    curveSegmentIndex: number,
    controlPoints: Types.Point2[] = this.controlPoints,
    closed: boolean = this.closed
  ) {
    const numCurveSegments = this._getNumCurveSegments(controlPoints, closed);
    const p1Index = curveSegmentIndex;
    const p0Index = p1Index - 1;
    const p2Index = closed ? (p1Index + 1) % numCurveSegments : p1Index + 1;
    const p3Index = p2Index + 1;
    const p1 = controlPoints[p1Index];
    const p2 = controlPoints[p2Index];
    let p0;
    let p3;

    // P0 shall be negative when P1/P2 are the start/end points of the first curve segment
    if (p0Index >= 0) {
      p0 = controlPoints[p0Index];
    } else {
      p0 = closed
        ? controlPoints[controlPoints.length - 1]
        : math.point.mirror(p2, p1);
    }

    // P3 shall be negative when P1/P2 are the start/end points of the last curve segment
    if (p3Index < controlPoints.length) {
      p3 = controlPoints[p3Index];
    } else {
      p3 = closed ? controlPoints[0] : math.point.mirror(p1, p2);
    }

    return { p0, p1, p2, p3 };
  }

  private _getLineSegments(
    curveSegmentIndex: number,
    transformMatrix: number[],
    controlPoints: Types.Point2[] = this.controlPoints,
    closed: boolean = this.closed
  ): SplineLineSegment[] {
    const numCurveSegments = this._getNumCurveSegments(controlPoints, closed);
    const numLineSegments = this.resolution + 1;
    const inc = 1 / numLineSegments;
    const minU = curveSegmentIndex;
    let maxU = minU + 1;

    // 'u' must be greater than or equal to 0 and smaller than N where N is the number of segments
    // otherwise it does not find the spline segment when it is not a closed curve because it is
    // 0-based indexed. In this case `u` needs to get very close to the end point but never touch it
    if (!closed && curveSegmentIndex === numCurveSegments - 1) {
      maxU -= MAX_U_ERROR;
    }

    const lineSegments: SplineLineSegment[] = [];
    let startPoint: Types.Point2;
    let endPoint: Types.Point2;
    let previousLineSegmentsLength = 0;

    for (let i = 0, u = minU; i <= numLineSegments; i++, u += inc) {
      // `u` may be greater than maxU in the last FOR loop due to number precision issue
      u = u > maxU ? maxU : u;

      const point = this._getPoint(u, transformMatrix, controlPoints, closed);

      if (!i) {
        startPoint = point;
        continue;
      }

      endPoint = point;

      const dx = endPoint[0] - startPoint[0];
      const dy = endPoint[1] - startPoint[1];
      const length = Math.sqrt(dx ** 2 + dy ** 2);
      const aabb: Types.AABB2 = {
        minX: startPoint[0] <= endPoint[0] ? startPoint[0] : endPoint[0],
        maxX: startPoint[0] >= endPoint[0] ? startPoint[0] : endPoint[0],
        minY: startPoint[1] <= endPoint[1] ? startPoint[1] : endPoint[1],
        maxY: startPoint[1] >= endPoint[1] ? startPoint[1] : endPoint[1],
      };

      lineSegments.push({
        points: {
          start: startPoint,
          end: endPoint,
        },
        aabb,
        length,
        previousLineSegmentsLength,
      });

      startPoint = endPoint;
      previousLineSegmentsLength += length;
    }

    return lineSegments;
  }

  private _getCurveSegment(
    curveSegmentIndex: number,
    transformMatrix: number[] = this.getTransformMatrix(),
    controlPoints: Types.Point2[] = this.controlPoints,
    closed: boolean = this.closed
  ): SplineCurveSegment {
    // Cubic spline curves are mainly controlled by P1 and P2 points but
    // they are also influenced by previous (P0) and next (P3) poins. For
    // Cardinal, Linear and Catmull-Rom splines P1 and P2 are also known as
    // knots because they are the connection between two curve segments.
    const { p0, p1, p2, p3 } = this._getCurveSegmentPoints(
      curveSegmentIndex,
      controlPoints,
      closed
    );
    const lineSegments = this._getLineSegments(
      curveSegmentIndex,
      transformMatrix,
      controlPoints,
      closed
    );
    let curveSegmentLength = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    lineSegments.forEach(({ aabb: lineSegAABB, length: lineSegLength }) => {
      minX = Math.min(minX, lineSegAABB.minX);
      minY = Math.min(minY, lineSegAABB.minY);
      maxX = Math.max(maxX, lineSegAABB.maxX);
      maxY = Math.max(maxY, lineSegAABB.maxY);
      curveSegmentLength += lineSegLength;
    });

    return {
      controlPoints: { p0, p1, p2, p3 },
      aabb: { minX, minY, maxX, maxY },
      length: curveSegmentLength,
      previousCurveSegmentsLength: 0,
      lineSegments,
    };
  }
}

export { CubicSpline as default, CubicSpline };
