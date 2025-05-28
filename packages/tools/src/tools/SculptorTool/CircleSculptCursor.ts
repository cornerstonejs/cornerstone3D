import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import { getEnabledElement } from '@cornerstonejs/core';
import type { ISculptToolShape } from '../../types/ISculptToolShape';
import type { SculptData } from '../SculptorTool';
import { distancePointToContour } from '../distancePointToContour';
import { drawCircle as drawCircleSvg } from '../../drawingSvg';
import { point } from '../../utilities/math';
import type {
  SVGDrawingHelper,
  EventTypes,
  ContourAnnotationData,
} from '../../types';

export type PushedHandles = {
  first?: number;
  last?: number;
};

/**
 * Implements a dynamic radius circle sculpt tool to edit contour annotations.
 * This tool changes radius based on the nearest point on a contour tool.
 *
 * TODO: Update this tool to allow modifying spline and other handle containing
 * contours.
 */
class CircleSculptCursor implements ISculptToolShape {
  static shapeName = 'Circle';
  static readonly CHAIN_MAINTENANCE_ITERATIONS = 3;
  static readonly CHAIN_PULL_STRENGTH_FACTOR = 0.3;
  static readonly MAX_INTER_DISTANCE_FACTOR = 1.2;

  private toolInfo = {
    toolSize: null,
    maxToolSize: null,
  };

  /**
   * Renders a circle at the current sculpt tool location using SVG drawing helper.
   * The circle represents the active area of influence for the sculpting operation.
   *
   * @param svgDrawingHelper - The SVG drawing helper for rendering shapes
   * @param canvasLocation - The 2D canvas coordinates where the circle should be drawn
   * @param options - Additional rendering options (color, style, etc.)
   */
  renderShape(
    svgDrawingHelper: SVGDrawingHelper,
    canvasLocation: Types.Point2,
    options: unknown
  ): void {
    const circleUID = '0';
    drawCircleSvg(
      svgDrawingHelper,
      'SculptorTool',
      circleUID,
      canvasLocation,
      this.toolInfo.toolSize,
      options
    );
  }

  /**
   * Pushes contour points radially away from the mouse cursor if they are contained
   * within the circular sculpting area. This is the main sculpting operation that
   * modifies the contour shape by moving points that fall within the tool's radius.
   *
   * @param viewport - The viewport containing the contour
   * @param sculptData - Data containing mouse position, contour points, and other sculpting info
   * @returns Object containing the indices of the first and last pushed handles
   */
  pushHandles(
    viewport: Types.IViewport,
    sculptData: SculptData
  ): PushedHandles {
    const { points, mouseCanvasPoint } = sculptData;
    const pushedHandles: PushedHandles = { first: undefined, last: undefined };

    const worldRadius = point.distanceToPoint(
      viewport.canvasToWorld(mouseCanvasPoint),
      viewport.canvasToWorld([
        mouseCanvasPoint[0] + this.toolInfo.toolSize,
        mouseCanvasPoint[1],
      ])
    );
    for (let i = 0; i < points.length; i++) {
      const handleCanvasPoint = viewport.worldToCanvas(points[i]);
      const distanceToHandle = point.distanceToPoint(
        handleCanvasPoint,
        mouseCanvasPoint
      );

      if (distanceToHandle > this.toolInfo.toolSize) {
        continue;
      }

      // Push point if inside circle, to edge of circle.
      this.pushOneHandle(i, worldRadius, sculptData);
      if (pushedHandles.first === undefined) {
        pushedHandles.first = i;
        pushedHandles.last = i;
      } else {
        pushedHandles.last = i;
      }
    }

    // Apply influence to points outside the pushed interval
    if (pushedHandles.first !== undefined && pushedHandles.last !== undefined) {
      for (
        let i = 0;
        i < CircleSculptCursor.CHAIN_MAINTENANCE_ITERATIONS;
        i++
      ) {
        this.maintainChainStructure(sculptData, pushedHandles);
      }
    }

    return pushedHandles;
  }

  /**
   * Initializes the tool size based on the viewport element dimensions.
   * The tool size is set to 1/12 of the minimum dimension (width or height) of the element.
   * This ensures the sculpting tool has a reasonable default size relative to the viewport.
   *
   * @param evt - The interaction event containing element information
   */
  configureToolSize(evt: EventTypes.InteractionEventType): void {
    const toolInfo = this.toolInfo;

    if (toolInfo.toolSize && toolInfo.maxToolSize) {
      return;
    }

    const eventData = evt.detail;
    const element = eventData.element;
    const minDim = Math.min(element.clientWidth, element.clientHeight);
    const maxRadius = minDim / 12;

    toolInfo.toolSize = maxRadius;
    toolInfo.maxToolSize = maxRadius;
  }

  /**
   * Dynamically adjusts the tool size based on the distance from the cursor to the nearest
   * point on the active contour annotation. This creates a responsive sculpting experience
   * where the tool size adapts to the proximity of the contour.
   *
   * @param canvasCoords - The current canvas coordinates of the cursor
   * @param viewport - The viewport containing the contour
   * @param activeAnnotation - The contour annotation being sculpted
   */
  updateToolSize(
    canvasCoords: Types.Point2,
    viewport: Types.IViewport,
    activeAnnotation: ContourAnnotationData
  ): void {
    const toolInfo = this.toolInfo;
    const radius = distancePointToContour(
      viewport,
      activeAnnotation,
      canvasCoords
    );
    if (radius > 0) {
      toolInfo.toolSize = Math.min(toolInfo.maxToolSize, radius);
    }
  }

  /**
   * Calculates the maximum allowed spacing between contour handles for this tool.
   * This is used to determine when new handles should be inserted to maintain
   * smooth contour representation during sculpting operations.
   *
   * @param minSpacing - The minimum spacing configured for the tool
   * @returns The maximum spacing, which is the larger of toolSize/4 or minSpacing
   */
  getMaxSpacing(minSpacing: number): number {
    return Math.max(this.toolInfo.toolSize / 4, minSpacing);
  }

  /**
   * Determines the optimal position for inserting a new handle between two existing handles.
   * If the midpoint between handles falls within the sculpting circle, the new handle
   * is positioned on the circle's edge in the direction away from the mouse cursor.
   * Otherwise, the midpoint is used as the insertion position.
   *
   * @param previousIndex - Index of the handle before the insertion point
   * @param nextIndex - Index of the handle after the insertion point
   * @param sculptData - Data containing sculpting context and mouse position
   * @returns The 3D world coordinates for the new handle position
   */
  getInsertPosition(
    previousIndex: number,
    nextIndex: number,
    sculptData: SculptData
  ): Types.Point3 {
    let insertPosition: Types.Point2;
    const { points, element, mouseCanvasPoint } = sculptData;
    const toolSize = this.toolInfo.toolSize;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const previousCanvasPoint = viewport.worldToCanvas(points[previousIndex]);
    const nextCanvasPoint = viewport.worldToCanvas(points[nextIndex]);

    const midPoint: Types.Point2 = [
      (previousCanvasPoint[0] + nextCanvasPoint[0]) / 2.0,
      (previousCanvasPoint[1] + nextCanvasPoint[1]) / 2.0,
    ];

    const distanceToMidPoint = point.distanceToPoint(
      mouseCanvasPoint,
      midPoint
    );

    if (distanceToMidPoint < toolSize) {
      const directionUnitVector = {
        x: (midPoint[0] - mouseCanvasPoint[0]) / distanceToMidPoint,
        y: (midPoint[1] - mouseCanvasPoint[1]) / distanceToMidPoint,
      };

      insertPosition = [
        mouseCanvasPoint[0] + toolSize * directionUnitVector.x,
        mouseCanvasPoint[1] + toolSize * directionUnitVector.y,
      ];
    } else {
      insertPosition = midPoint;
    }

    const worldPosition = viewport.canvasToWorld(insertPosition);

    return worldPosition;
  }

  /**
   * Moves a single contour handle radially outward from the mouse cursor to the edge
   * of the sculpting circle. This creates the "pushing" effect that sculpts the contour.
   * The handle is repositioned along the direction vector from mouse to handle.
   *
   * @param i - Index of the handle to push
   * @param distanceToHandle - Current distance from mouse cursor to the handle
   * @param sculptData - Data containing sculpting context and mouse position
   */
  private pushOneHandle(
    i: number,
    worldRadius: number,
    sculptData: SculptData
  ): void {
    const { points, mousePoint } = sculptData;
    const handle = points[i];

    const directionUnitVector = this.directionalVector(mousePoint, handle);

    const position = vec3.scaleAndAdd(
      vec3.create(),
      mousePoint,
      directionUnitVector,
      worldRadius
    );

    handle[0] = position[0];
    handle[1] = position[1];
    handle[2] = position[2];
  }

  /**
   * Calculates a normalized directional vector between two 3D points.
   * This is used to determine the direction for moving points during sculpting operations.
   *
   * @param p1 - The starting point
   * @param p2 - The ending point
   * @returns A normalized 3D vector pointing from p1 to p2
   */
  private directionalVector(p1: Types.Point3, p2: Types.Point3): Types.Point3 {
    return vec3.normalize(vec3.create(), [
      p2[0] - p1[0],
      p2[1] - p1[1],
      p2[2] - p1[2],
    ]) as Types.Point3;
  }

  /**
   * Calculates the mean distance between consecutive points in the contour.
   * This metric is used to maintain consistent spacing and natural contour flow
   * during sculpting operations. Handles wrap-around for closed contours.
   *
   * @param points - Array of 3D points representing the contour
   * @returns The average distance between consecutive points
   */
  private calculateMeanConsecutiveDistance(points: Types.Point3[]): number {
    if (points.length < 2) {
      return 0;
    }

    let totalDistance = 0;
    const numPoints = points.length;

    for (let i = 0; i < numPoints; i++) {
      const nextIndex = (i + 1) % numPoints; // Handle wrap-around for closed contours
      const distance = point.distanceToPoint(points[i], points[nextIndex]);
      totalDistance += distance;
    }

    return totalDistance / numPoints;
  }

  /**
   * Maintains the natural chain structure of the contour by adjusting points that
   * have been stretched too far apart during sculpting. This prevents the contour
   * from becoming distorted and maintains smooth, natural-looking curves.
   *
   * The method works in two phases:
   * 1. Adjusts points from the center backwards to the beginning
   * 2. Adjusts points from the center forwards to the end
   *
   * Points that are too far from their neighbors are pulled back towards them
   * with a strength proportional to how far they've been stretched.
   *
   * @param sculptData - Data containing the contour points and sculpting context
   * @param pushedHandles - Information about which handles were affected by sculpting
   */
  private maintainChainStructure(
    sculptData: SculptData,
    pushedHandles: PushedHandles
  ) {
    const { points } = sculptData;
    const first = pushedHandles.first!;
    const last = pushedHandles.last!;
    const mean = Math.round((first + last) / 2);
    const numPoints = points.length;
    if (!sculptData.meanDistance) {
      sculptData.meanDistance = this.calculateMeanConsecutiveDistance(points);
    }
    const maxInterDistance =
      sculptData.meanDistance * CircleSculptCursor.MAX_INTER_DISTANCE_FACTOR;

    // Adjust points from center backwards to beginning
    for (let i = mean; i >= 0; i--) {
      if (i >= numPoints - 1 || i < 0) {
        continue;
      }
      const nextIndex = i + 1;
      const distanceToNext = point.distanceToPoint(
        points[i],
        points[nextIndex]
      );

      if (distanceToNext > maxInterDistance) {
        // Pull point towards its neighbor to maintain chain structure
        const pullDirection = this.directionalVector(
          points[i],
          points[nextIndex]
        );
        const pullStrength =
          (distanceToNext - sculptData.meanDistance) / sculptData.meanDistance;

        const adjustmentMagnitude =
          pullStrength *
          sculptData.meanDistance *
          CircleSculptCursor.CHAIN_PULL_STRENGTH_FACTOR;

        points[i][0] += pullDirection[0] * adjustmentMagnitude;
        points[i][1] += pullDirection[1] * adjustmentMagnitude;
        points[i][2] += pullDirection[2] * adjustmentMagnitude;
      }
    }

    // Adjust points from center forwards to end
    for (let i = mean + 1; i < numPoints; i++) {
      if (i >= numPoints || i <= 0) {
        continue;
      }
      const previousIndex = i - 1;
      const distanceToPrevious = point.distanceToPoint(
        points[i],
        points[previousIndex]
      );
      if (distanceToPrevious > maxInterDistance) {
        // Pull point towards its neighbor to maintain chain structure
        const pullDirection = this.directionalVector(
          points[i],
          points[previousIndex]
        );
        const pullStrength =
          (distanceToPrevious - sculptData.meanDistance) /
          sculptData.meanDistance;

        const adjustmentMagnitude =
          pullStrength *
          sculptData.meanDistance *
          CircleSculptCursor.CHAIN_PULL_STRENGTH_FACTOR;

        points[i][0] += pullDirection[0] * adjustmentMagnitude;
        points[i][1] += pullDirection[1] * adjustmentMagnitude;
        points[i][2] += pullDirection[2] * adjustmentMagnitude;
      }
    }
  }
}

export default CircleSculptCursor;
