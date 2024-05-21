import { Types } from '@cornerstonejs/core';
import type {
  ClosestPoint,
  ClosestControlPoint,
  ClosestSplinePoint,
  ControlPointInfo,
} from './';

/**
 * Spline curve interface
 */
export interface ISpline {
  /** Number of control points */
  get numControlPoints(): number;

  /** Resolution of the spline curve (greater than or equal to 0) */
  get resolution(): number;

  /** Set the resolution of the spline curve */
  set resolution(resolution: number);

  /** Fixed resolution (eg: Linear Spline) */
  get fixedResolution(): boolean;

  /** Flag that is set to true when the curve is already closed */
  get closed(): boolean;

  /** Set the curve as closed which connects the last to the first point */
  set closed(closed: boolean);

  /** Axis-aligned bounding box (minX, minY, maxX, maxY) */
  get aabb(): Types.AABB2;

  /** Length of the spline curve in pixels */
  get length(): number;

  /**
   * Flag that is set to true when the spline needs to be updated. The update
   * runs automaticaly when needed (eg: getPolylinePoints).
   */
  get invalidated(): boolean;

  /**
   * Bézier curves have tangent points connected to control points
   * @returns True if the spline has tangent point or false otherwise
   */
  hasTangentPoints(): boolean;

  /**
   * Add a control point to the end of the array
   * @param point - Control point (2D)
   */
  addControlPoint(point: Types.Point2): void;

  /**
   * Add a list of control poits to the end of the array
   * @param points - Control points to be added
   */
  addControlPoints(points: Types.Point2[]): void;

  /**
   * Add a control point specifying its `u` value in Parameter Space which is a number from 0 to N
   * where N is the number of curve segments. The integer part is the curve segment index and the
   * decimal part is the `t` value on that curve segment.
   * @param u - `u` value in Parameter Space
   */
  addControlPointAtU(u: number): ControlPointInfo;

  /**
   * Delete a control point given its index
   * @param index - Control point index to be removed
   * @returns True if the control point is removed or false otherwise
   */
  deleteControlPointByIndex(index: number): boolean;

  /**
   * Remove all control points
   */
  clearControlPoints(): void;

  /**
   * Replace all control points by some new ones
   * @param points - Control points to be added to the array
   */
  setControlPoints(points: Types.Point2[]): void;

  /**
   * Update the coordinate of a control point given its index
   * @param index - Control point index
   * @param newControlPoint - New control point
   */
  updateControlPoint(index: number, newControlPoint: Types.Point2): void;

  /**
   * Get a list with all control points. The control points are cloned to prevent
   * any caller from changing them resulting in unexpected behaviors
   * @returns - List of all control points
   */
  getControlPoints(): Types.Point2[];

  /**
   * Finds the closest control point given a 2D point
   * @param point - Reference point
   * @returns Closest control point
   */
  getClosestControlPoint(point: Types.Point2): ClosestControlPoint;

  /**
   * Finds the closest control point given a 2D point and a maximum distance
   * @param point - Reference 2D point
   * @param maxDist - Maximum distance
   * @returns Closest control point that is within the given range or undefined otherwise
   */
  getClosestControlPointWithinDistance(
    point: Types.Point2,
    range: number
  ): ClosestControlPoint;

  /**
   * Finds the closest point on the spline curve given 2D point
   * @param point - Reference 2D point
   * @returns Closest point on the spline curve
   */
  getClosestPoint(point: Types.Point2): ClosestSplinePoint;

  /**
   * Finds the closest point on the straight line that connects all control points given a 2D point
   * @param point - Reference point
   * @returns Closest point on the straight line that connects all control points
   */
  getClosestPointOnControlPointLines(point: Types.Point2): ClosestPoint;

  /**
   * Get all points necessary to draw a spline curve
   * @returns Array with all points necessary to draw a spline curve
   */
  getPolylinePoints(): Types.Point2[];

  /**
   * Get all points necessary to draw the preview curve for a new possible control point
   * @returns Array with all points necessary to draw the preview curve
   */
  getPreviewPolylinePoints(
    controlPointPreview: Types.Point2,
    closeDistance: number
  ): Types.Point2[];

  /**
   * Checks if a point is near to the spline curve
   * @param point - Reference point
   * @param maxDist - Maximum allowed distance
   * @returns True if the point is close to the spline curve or false otherwise
   */
  isPointNearCurve(point: Types.Point2, maxDist: number): boolean;

  /**
   * Checks if a 2D point is inside the spline curve.
   *
   * A point is inside a curve/polygon if the number of intersections between the horizontal
   * ray emanating from the given point and to the right and the line segments is odd.
   * https://www.eecs.umich.edu/courses/eecs380/HANDOUTS/PROJ2/InsidePoly.html
   *
   * @param point - 2D Point
   * @returns True is the point is inside the spline curve or false otherwise
   */
  containsPoint(point: Types.Point2): boolean;
}
