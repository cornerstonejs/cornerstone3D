import { Types } from '@cornerstonejs/core';
import type { SplineCurveSegment } from './SplineCurveSegment';
import type { ClosestPoint } from './ClosestPoint';
import type { ClosestControlPoint } from './ClosestControlPoint';
import type { ClosestSplinePoint } from './ClosestSplinePoint';

export interface ISpline {
  get numControlPoints(): number;
  get resolution(): number;
  set resolution(resolution: number);
  get closed(): boolean;
  set closed(closed: boolean);
  get curveSegments(): SplineCurveSegment[];
  get aabb(): Types.AABB2;
  get length(): number;
  get invalidated(): boolean;
  addControlPoint(x: number, y: number): void;
  addControlPointAt(u: number): void;
  addControlPoints(points: Types.Point2[]): void;
  deleteControlPointByIndex(index: number): boolean;
  clearControlPoints(): void;
  setControlPoints(points: Types.Point2[]): void;
  updateControlPoint(index: number, x: number, y: number): void;
  getControlPoints(): Types.Point2[];
  getClosestControlPoint(point: Types.Point2): ClosestControlPoint;
  getClosestPoint(point: Types.Point2): ClosestSplinePoint;
  getClosestControlPointWithinRange(
    point: Types.Point2,
    range: number
  ): ClosestControlPoint;
  getClosestControlPointLinesPoint(point: Types.Point2): ClosestPoint;
  getPolylinePoints(): Types.Point2[];
  isPointNearCurve(point: Types.Point2, maxDist: number): boolean;
  containsPoint(point: Types.Point2): boolean;
}
