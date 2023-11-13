import { Types } from '@cornerstonejs/core';
import type { ISpline } from './types/ISpline';
import type { SplineProps } from './types/SplineProps';
import * as math from '../../../utilities/math';
import type { SplineCurveSegment } from './types/SplineCurveSegment';
import type { SplineLineSegment } from './types/SplineLineSegment';
import type { ClosestControlPoint } from './types/ClosestControlPoint';
import type { ClosestSplinePoint } from './types/ClosestSplinePoint';
import type { ClosestPoint } from './types/ClosestPoint';

type CurveSegmentDistanceSquared = {
  curveSegmentIndex: number;
  curveSegment: SplineCurveSegment;
  distanceSquared: number;
};

/**
 * Spline curve representation
 *
 * You can find more about splines in this video
 * https://www.youtube.com/watch?v=jvPPXbo87ds&t=11m20s
 */
abstract class Spline implements ISpline {
  private _controlPoints: Types.Point2[] = [];
  private _resolution: number;
  private _closed: boolean;
  private _invalidated = false;
  private _curveSegments: SplineCurveSegment[];
  private _aabb: Types.AABB2;
  private _length = 0;

  constructor(props?: SplineProps) {
    this._controlPoints = [];
    this._resolution = props?.resolution ?? 20;
    this._closed = props?.closed ?? false;
    this._invalidated = true;
  }

  /**
   * Return the control points array
   *
   * Any external access should be done through getControlPoints because it
   * clones the points to make sure the data will not get changed by the caller
   */
  protected get controlPoints(): Types.Point2[] {
    return this._controlPoints;
  }

  public get numControlPoints(): number {
    return this._controlPoints.length;
  }

  public get resolution(): number {
    return this._resolution;
  }

  public set resolution(resolution: number) {
    if (this._resolution === resolution) {
      return;
    }

    this._resolution = resolution;
    this.invalidated = true;
  }

  public get closed(): boolean {
    return this._closed;
  }

  public set closed(closed: boolean) {
    if (this._closed === closed) {
      return;
    }

    this._closed = closed;
    this.invalidated = true;
  }

  public get curveSegments(): SplineCurveSegment[] {
    this._update();
    return this._curveSegments;
  }

  public get aabb(): Types.AABB2 {
    this._update();
    return this._aabb;
  }

  public get length(): number {
    this._update();
    return this._length;
  }

  public get invalidated(): boolean {
    return this._invalidated;
  }

  protected set invalidated(invalidated: boolean) {
    this._invalidated = invalidated;
  }

  /**
   * Lines connecting all control points need to be rendered for B-Splines
   * @returns True if lines need to be rendered or false otherwise
   */
  public shouldRenderControlPointLines(): boolean {
    return false;
  }

  /**
   * Bézier curves have tangent points connected to control points
   * @returns True if the spline has tangent point or false otherwise
   */
  public hasTangentPoints() {
    return false;
  }

  /**
   * Add a control point to the end of the array
   * @param x - Control point X coordinate
   * @param y - Control point Y coordinate
   */
  public addControlPoint(x: number, y: number): void {
    this._controlPoints.push([x, y]);
    this.invalidated = true;
  }

  /**
   * Add a list of control poits to the end of the array
   * @param points - Control points to be added
   */
  public addControlPoints(points: Types.Point2[]): void {
    points.forEach((point) => this.addControlPoint(point[0], point[1]));
  }

  /**
   * Add a control point specifying its `u` value in Parameter Space which is a number from 0 to N
   * where N is the number of curve segments. The integer part is the curve segment index and the
   * decimal part is the `t` value on that curve segment.
   * @param u - `u` value in Parameter Space
   */
  public addControlPointAt(u: number): void {
    const lineSegment = this._getLineSegmentAt(u);
    const { start: startPoint, end: endPoint } = lineSegment.points;
    const curveSegmentIndex = Math.floor(u);
    const curveSegment = this._curveSegments[curveSegmentIndex];
    const t = u - Math.floor(curveSegmentIndex);
    const controlPointPos: Types.Point2 = [
      startPoint[0] + t * (endPoint[0] - startPoint[0]),
      startPoint[1] + t * (endPoint[1] - startPoint[1]),
    ];

    const insertIndex =
      this._controlPoints.indexOf(curveSegment.controlPoints.p1) + 1;

    this._controlPoints.splice(insertIndex, 0, controlPointPos);
    this.invalidated = true;
  }

  /**
   * Delete a control point given its index
   * @param index - Control point index to be removed
   * @returns True if the control point is removed or false otherwise
   */
  public deleteControlPointByIndex(index: number): boolean {
    const minControlPoints = this._closed ? 3 : 1;
    const canDelete =
      index >= 0 &&
      index < this._controlPoints.length &&
      this._controlPoints.length > minControlPoints;

    if (!canDelete) {
      return false;
    }

    this._controlPoints.splice(index, 1);
    this.invalidated = true;

    return true;
  }

  /**
   * Remove all control points
   */
  public clearControlPoints(): void {
    this._controlPoints = [];
    this.invalidated = true;
  }

  /**
   * Replace all control points by some new ones
   * @param points - Control points to be added to the array
   */
  public setControlPoints(points: Types.Point2[]): void {
    this.clearControlPoints();
    this.addControlPoints(points);
  }

  /**
   * Update the coordinate of a control point given its index
   * @param index - Control point index
   * @param x - Control point X coordinate
   * @param y - Control point Y coordinate
   */
  public updateControlPoint(index: number, x: number, y: number): void {
    if (index < 0 || index >= this._controlPoints.length) {
      throw new Error('Index out of bounds');
    }

    this._controlPoints[index] = [x, y];
    this.invalidated = true;
  }

  /**
   * Get a list with all control points. The control points are cloned to prevent
   * any caller from changing them resulting in unexpected behaviors
   * @returns - List of all control points
   */
  public getControlPoints(): Types.Point2[] {
    return this._controlPoints.map((controlPoint) => [
      controlPoint[0],
      controlPoint[1],
    ]);
  }

  /**
   * Finds the closest control point given a 2D point
   * @param point - Reference point
   * @returns Closest control point
   */
  public getClosestControlPoint(point: Types.Point2): ClosestControlPoint {
    const controlPoints = this._controlPoints;
    let minSquaredDist = Infinity;
    let closestPointIndex = -1;

    for (let i = 0, len = controlPoints.length; i < len; i++) {
      const controlPoint = controlPoints[i];
      const dx = point[0] - controlPoint[0];
      const dy = point[1] - controlPoint[1];
      const squaredDist = dx * dx + dy * dy;

      if (squaredDist < minSquaredDist) {
        minSquaredDist = squaredDist;
        closestPointIndex = i;
      }
    }

    return {
      index: closestPointIndex,
      point:
        closestPointIndex === -1
          ? undefined
          : [...controlPoints[closestPointIndex]],
      distance: Math.sqrt(minSquaredDist),
    };
  }

  /**
   * Finds the closest control point given a 2D point and a maximum distance
   * @param point - Reference 2D point
   * @param maxDist - Maximum distance
   * @returns Closest control point that is within the given range or undefined otherwise
   */
  public getClosestControlPointWithinRange(
    point: Types.Point2,
    maxDist: number
  ): ClosestControlPoint {
    const closestControlPoint = this.getClosestControlPoint(point);

    return closestControlPoint.distance <= maxDist
      ? closestControlPoint
      : undefined;
  }

  /**
   * Finds the closest point on the spline curve given 2D point
   * @param point
   * @returns
   */
  public getClosestPoint(point: Types.Point2): ClosestSplinePoint {
    this._update();

    const curveSegmentsDistInfo =
      this._getCurveSegmmentsDistanceSquaredInfo(point);

    if (!curveSegmentsDistInfo.length) {
      return;
    }

    // Sort the curves by distance because in most cases the closest point may be in the first
    // curve segment and there is no need to check all next line segments if theirs curve segments'
    // AABB is not closest compared to the minDist found saving a lot of cpu time.
    curveSegmentsDistInfo.sort(
      (csA, csB) => csA.distanceSquared - csB.distanceSquared
    );

    let closestPoint: Types.Point2;
    let closestPointCurveSegmentIndex = -1;
    let minDistSquared = Infinity;
    let minDistCurveSegment: SplineCurveSegment;
    let minDistLineSegment: SplineLineSegment;

    for (let i = 0; i < curveSegmentsDistInfo.length; i++) {
      const curveSegmentDistInfo = curveSegmentsDistInfo[i];

      // If the distance to curve segments' AABB is greater than the minDist
      // it does not need to waste time verifying each line segment
      if (curveSegmentDistInfo.distanceSquared > minDistSquared) {
        continue;
      }

      const { curveSegmentIndex, curveSegment } = curveSegmentDistInfo;
      const { lineSegments } = curveSegment;

      for (let j = 0; j < lineSegments.length; j++) {
        const lineSegment = lineSegments[j];
        const { point: lineSegPoint, distanceSquared: lineSegDistSquared } =
          math.lineSegment.distanceToPointSquaredInfo(
            lineSegment.points.start,
            lineSegment.points.end,
            point
          );

        if (lineSegDistSquared < minDistSquared) {
          minDistLineSegment = lineSegment;
          closestPointCurveSegmentIndex = curveSegmentIndex;
          minDistCurveSegment = curveSegmentDistInfo.curveSegment;
          closestPoint = lineSegPoint;
          minDistSquared = lineSegDistSquared;
        }
      }
    }

    const curveSegmentLengthToPoint =
      minDistLineSegment.lengthStart +
      math.point.distanceToPoint(minDistLineSegment.points.start, closestPoint);

    const t = curveSegmentLengthToPoint / minDistCurveSegment.length;
    const u = closestPointCurveSegmentIndex + t;

    return {
      point: closestPoint,
      uValue: u,
      distance: Math.sqrt(minDistSquared),
    };
  }

  /**
   * Finds the closest point on the straight line that connects all control points given a 2D point
   * @param point - Reference point
   * @returns Closest point on the straight line that connects all control points
   */
  public getClosestControlPointLinesPoint(point: Types.Point2): ClosestPoint {
    const linePoints = [...this._controlPoints];

    if (this._closed) {
      linePoints.push(this._controlPoints[0]);
    }

    if (!linePoints.length) {
      return;
    }

    let closestPoint: Types.Point2;
    let minDistSquared = Infinity;
    let startPoint = linePoints[0];

    for (let i = 1, len = linePoints.length; i < len; i++) {
      const endPoint = linePoints[i];
      const { point: lineSegPoint, distanceSquared: lineSegDistSquared } =
        math.lineSegment.distanceToPointSquaredInfo(
          startPoint,
          endPoint,
          point
        );

      if (lineSegDistSquared < minDistSquared) {
        closestPoint = lineSegPoint;
        minDistSquared = lineSegDistSquared;
      }

      startPoint = endPoint;
    }

    return {
      point: closestPoint,
      distance: Math.sqrt(minDistSquared),
    };
  }

  /**
   * Get all line segments necessary to draw the entire spline curve.
   * @returns An array of line segments
   */
  public getPolylinePoints(): Types.Point2[] {
    this._update();

    const { _curveSegments: curveSegments } = this;
    const polylinePoints2: Types.Point2[] = [];

    for (
      let i = 0, numCurveSegs = curveSegments.length;
      i < numCurveSegs;
      i++
    ) {
      const { lineSegments } = curveSegments[i];

      for (let j = 0, numLineSegs = lineSegments.length; j < numLineSegs; j++) {
        const lineSegment = lineSegments[j];

        // Add the start point before adding all end points
        if (i === 0 && j === 0) {
          polylinePoints2.push([...lineSegment.points.start]);
        }

        // Always add 1 because the first segment stored its start point at the first position
        polylinePoints2.push([...lineSegment.points.end]);
      }
    }

    return polylinePoints2;
  }

  /**
   * Checks if a point is near to the spline curve
   * @param point - Reference point
   * @param maxDist - Maximum allowed distance
   * @returns True if the point is close to the spline curve or false otherwise
   */
  public isPointNearCurve(point: Types.Point2, maxDist: number): boolean {
    this._update();

    const curveSegments = this._getCurveSegmmentsWithinRange(point, maxDist);
    const maxDistSquared = maxDist * maxDist;

    // Check if the point is close to the spline and doest waste time checking each curve/line
    for (let i = 0; i < curveSegments.length; i++) {
      const { lineSegments } = curveSegments[i];

      for (let j = 0; j < lineSegments.length; j++) {
        const lineSegment = lineSegments[j];
        const lineDistSquared = math.lineSegment.distanceToPointSquared(
          lineSegment.points.start,
          lineSegment.points.end,
          point
        );

        if (lineDistSquared <= maxDistSquared) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Checks if a 2D is inside the spline curve
   * @param point - 2D Point
   * @returns True is the point is inside the spline curve or false otherwise
   */
  public containsPoint(point: Types.Point2): boolean {
    console.warn('TODO: containsPoint');
    return false;
  }

  protected abstract getTransformMatrix(): number[];

  protected abstract getSplineCurves(): SplineCurveSegment[];

  private _update() {
    if (!this._invalidated) {
      return;
    }

    const curveSegments = this.getSplineCurves();
    let length = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    curveSegments.forEach((curveSegment) => {
      const { aabb: curveSegAABB } = curveSegment;

      minX = minX <= curveSegAABB.minX ? minX : curveSegAABB.minX;
      minY = minY <= curveSegAABB.minY ? minY : curveSegAABB.minY;
      maxX = maxX >= curveSegAABB.maxX ? maxX : curveSegAABB.maxX;
      maxY = maxY >= curveSegAABB.maxY ? maxY : curveSegAABB.maxY;
      length += curveSegment.length;
    });

    this._curveSegments = curveSegments;
    this._aabb = { minX, minY, maxX, maxY };
    this._length = length;
    this._invalidated = false;
  }

  private _getCurveSegmmentsDistanceSquaredInfo(
    point: Types.Point2
  ): CurveSegmentDistanceSquared[] {
    this._update();

    const curveSegmentsDistanceSquared: CurveSegmentDistanceSquared[] = [];
    const { _curveSegments: curveSegments } = this;

    for (let i = 0; i < curveSegments.length; i++) {
      const curveSegment = curveSegments[i];
      const distanceSquared = math.aabb.distanceToPointSquared(
        curveSegment.aabb,
        point
      );

      curveSegmentsDistanceSquared.push({
        curveSegmentIndex: i,
        curveSegment,
        distanceSquared,
      });
    }

    return curveSegmentsDistanceSquared;
  }

  private _getCurveSegmmentsWithinRange(
    point: Types.Point2,
    maxDist: number
  ): SplineCurveSegment[] {
    this._update();

    const maxDistSquared = maxDist * maxDist;

    // Does not waste time checking each curve segment if the point is not event
    // close to the spline's AABB
    if (math.aabb.distanceToPointSquared(this.aabb, point) > maxDistSquared) {
      return [];
    }

    const curveSegmentsDistance =
      this._getCurveSegmmentsDistanceSquaredInfo(point);
    const curveSegmentsWithinRange: SplineCurveSegment[] = [];

    for (let i = 0, len = curveSegmentsDistance.length; i < len; i++) {
      const { curveSegment, distanceSquared: curveSegmentDistSquared } =
        curveSegmentsDistance[i];

      if (curveSegmentDistSquared <= maxDistSquared) {
        curveSegmentsWithinRange.push(curveSegment);
      }
    }

    return curveSegmentsWithinRange;
  }

  private _getLineSegmentAt(u: number): SplineLineSegment {
    this._update();

    const curveSegmentIndex = Math.floor(u);
    const t = u - curveSegmentIndex;
    const curveSegment = this._curveSegments[curveSegmentIndex];
    const { lineSegments } = curveSegment;
    const pointLength = curveSegment.length * t;

    for (let i = 0; i < lineSegments.length; i++) {
      const lineSegment = lineSegments[i];
      const lengthEnd = lineSegment.lengthStart + lineSegment.length;

      if (pointLength >= lineSegment.lengthStart && pointLength <= lengthEnd) {
        return lineSegment;
      }
    }
  }
}

export { Spline as default, Spline };
