import type { Types } from '@cornerstonejs/core';
import type { ISculptToolShape } from '../../types/ISculptToolShape';
import type { SculptData } from '../SculptorTool';
import { point } from '../../utilities/math';
import type { SVGDrawingHelper } from '../../types';

export type PushedHandles = {
  first?: number;
  last?: number;
};

/**
 * Base class for sculpt cursors that implements neighbor influence feature
 * to prevent spike artifacts when sculpting contours.
 */
abstract class SculptCursor implements ISculptToolShape {
  protected toolInfo = {
    toolSize: null,
    maxToolSize: null,
  };

  /**
   * Abstract method to render the cursor shape
   */
  abstract renderShape(
    svgDrawingHelper: SVGDrawingHelper,
    canvasLocation: Types.Point2,
    options: unknown
  ): void;

  /**
   * Abstract method to configure tool size
   */
  abstract configureToolSize(evt): void;

  /**
   * Abstract method to update tool size
   */
  abstract updateToolSize(
    canvasCoords: Types.Point2,
    viewport: Types.IViewport,
    activeAnnotation
  ): void;

  /**
   * Abstract method to get maximum spacing
   */
  abstract getMaxSpacing(minSpacing: number): number;

  /**
   * Abstract method to get insert position
   */
  abstract getInsertPosition(
    previousIndex: number,
    nextIndex: number,
    sculptData: SculptData
  ): Types.Point3;

  /**
   * Pushes the points radially away from the mouse with neighbor influence
   * to prevent spike artifacts
   */
  pushHandles(
    viewport: Types.IViewport,
    sculptData: SculptData
  ): PushedHandles {
    const { points, mouseCanvasPoint, configuration } = sculptData;
    const pushedHandles: PushedHandles = { first: undefined, last: undefined };

    // Get configuration values with defaults
    const neighborInfluenceRadius =
      configuration?.neighborInfluenceRadius || 2.0;
    const falloffType = configuration?.falloffType || 'linear';

    const effectiveRadius = this.toolInfo.toolSize * neighborInfluenceRadius;

    for (let i = 0; i < points.length; i++) {
      const handleCanvasPoint = viewport.worldToCanvas(points[i]);
      const distanceToHandle = point.distanceToPoint(
        handleCanvasPoint,
        mouseCanvasPoint
      );

      if (distanceToHandle > effectiveRadius) {
        continue;
      }

      // Calculate influence based on distance
      let influence = 1.0;
      let shouldPush = false;

      if (distanceToHandle <= this.toolInfo.toolSize) {
        // Point is inside the tool radius - full push
        influence = 1.0;
        shouldPush = true;
      } else {
        // Point is outside tool radius but within influence radius
        // Only push if cursor is moving towards the point
        const normalizedDistance =
          (distanceToHandle - this.toolInfo.toolSize) /
          (effectiveRadius - this.toolInfo.toolSize);

        if (falloffType === 'exponential') {
          // Exponential falloff for smoother transition
          influence = Math.exp(-3 * normalizedDistance);
        } else {
          // Linear falloff
          influence = 1.0 - normalizedDistance;
        }

        // Check if cursor is pushing towards this point
        shouldPush = this.isCursorPushingTowardsPoint(
          handleCanvasPoint,
          mouseCanvasPoint,
          sculptData
        );
      }

      if (shouldPush) {
        // Push point with influence factor
        this.pushOneHandle(
          i,
          distanceToHandle,
          sculptData,
          influence,
          viewport
        );

        if (pushedHandles.first === undefined) {
          pushedHandles.first = i;
          pushedHandles.last = i;
        } else {
          pushedHandles.last = i;
        }
      }
    }

    return pushedHandles;
  }

  /**
   * Determines if the cursor is pushing towards a specific point
   */
  protected isCursorPushingTowardsPoint(
    pointCanvas: Types.Point2,
    cursorCanvas: Types.Point2,
    sculptData: SculptData
  ): boolean {
    // For now, we'll assume all points within influence radius should be pushed
    // This can be enhanced to consider cursor movement direction
    return true;
  }

  /**
   * Pushes a single handle away from the cursor position
   */
  protected pushOneHandle(
    i: number,
    distanceToHandle: number,
    sculptData: SculptData,
    influence: number = 1.0,
    viewport: Types.IViewport
  ): void {
    const { points, mouseCanvasPoint } = sculptData;
    const toolSize = this.toolInfo.toolSize;
    const handle = points[i];

    // Work in canvas coordinates for proper distance calculations
    const handleCanvasPoint = viewport.worldToCanvas(handle);

    // Calculate direction from mouse to handle in canvas space (push direction)
    const canvasDirectionVector = {
      x: (handleCanvasPoint[0] - mouseCanvasPoint[0]) / distanceToHandle,
      y: (handleCanvasPoint[1] - mouseCanvasPoint[1]) / distanceToHandle,
    };

    let newCanvasPosition: Types.Point2;

    if (distanceToHandle < toolSize) {
      // Point is inside the tool radius - push to edge
      newCanvasPosition = [
        mouseCanvasPoint[0] + toolSize * canvasDirectionVector.x,
        mouseCanvasPoint[1] + toolSize * canvasDirectionVector.y,
      ];
    } else {
      // Point is in influence zone - push with falloff
      const pushDistance = (toolSize * influence) / 2; // Push less for points further away
      newCanvasPosition = [
        handleCanvasPoint[0] + pushDistance * canvasDirectionVector.x,
        handleCanvasPoint[1] + pushDistance * canvasDirectionVector.y,
      ];
    }

    // Convert back to world coordinates
    const newWorldPosition = viewport.canvasToWorld(newCanvasPosition);

    handle[0] = newWorldPosition[0];
    handle[1] = newWorldPosition[1];
    handle[2] = newWorldPosition[2];
  }
}

export default SculptCursor;
