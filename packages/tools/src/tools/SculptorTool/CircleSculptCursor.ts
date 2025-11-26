import type { Types } from '@cornerstonejs/core';
import { vec2, vec3 } from 'gl-matrix';
import { getEnabledElement } from '@cornerstonejs/core';
import type { ISculptToolShape } from '../../types/ISculptToolShape';
import type { SculptData, SculptIntersect } from '../SculptorTool';
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

  private toolInfo = {
    toolSize: null,
    maxToolSize: null,
  };

  /**
   * Renders a circle at the current sculpt tool location
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
   * Sets up the basic tool size from the element, where the tool size
   * is set at minimum to 1/12 of the minimum of the width and height.
   */
  configureToolSize(evt: EventTypes.InteractionEventType): void {
    const toolInfo = this.toolInfo;

    if (toolInfo.toolSize && toolInfo.maxToolSize) {
      return;
    }

    const eventData = evt.detail;
    const element = eventData.element;
    const minDim = Math.min(element.clientWidth, element.clientHeight);
    const maxRadius = minDim / 24;

    toolInfo.toolSize = maxRadius;
    toolInfo.maxToolSize = maxRadius;
  }

  /**
   * Adjusts the tool size based on computing the nearest point to the active
   * annotation object, and using the distance to the cursor point, clipping that
   * to at most the configured radius.
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
   * Returns the maximum spacing between handles for this tool adjustment.
   */
  getMaxSpacing(minSpacing: number): number {
    return Math.max(this.toolInfo.toolSize / 4, minSpacing);
  }

  /**
   * This will return an array of EVEN length, containing ordered
   * entry/exit points for where the given contour(s) enter the cursor region
   * and leave the cursor region.
   */
  public intersect(
    viewport: Types.IViewport,
    sculptData: SculptData
  ): SculptIntersect[] {
    const { contours, mousePoint, mouseCanvasPoint } = sculptData;

    const result = new Array<SculptIntersect>();

    for (const contour of contours) {
      const { annotationUID, points } = contour;
      let lastIn = false;
      let anyIn = false;
      let anyOut = false;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const inCursor = this.isInCursor(point, mousePoint);
        anyIn ||= inCursor;
        anyOut ||= !inCursor;
        if (i === 0) {
          lastIn = inCursor;
          continue;
        }
        if (lastIn === inCursor) {
          continue;
        }
        lastIn = inCursor;
        const edge = this.getEdge(
          viewport,
          point,
          points[i - 1],
          mouseCanvasPoint
        );
        result.push({
          annotationUID,
          isEnter: inCursor,
          index: i,
          point: edge.point,
          angle: edge.angle,
        });
      }
    }

    return result;
  }

  /**
   * Gets the point and angle which is on the edge of the cursor and between
   * p1 and p2.
   */
  public getEdge(
    viewport,
    p1: Types.Point3,
    p2: Types.Point3,
    mouseCanvas: Types.Point2
  ) {
    // Approximation is the midpoint
    const point = vec3.add(vec3.create(), p1, p2) as Types.Point3;
    vec3.scale(point, point, 0.5);

    const canvasPoint = viewport.worldToCanvas(point);
    const canvasDelta = vec2.sub(vec2.create(), canvasPoint, mouseCanvas);
    const angle = Math.atan2(canvasDelta[1], canvasDelta[0]);

    return {
      point,
      angle,
      canvasPoint,
    };
  }

  public interpolatePoint(viewport, angle, center) {
    const [cx, cy] = center;
    const r = this.toolInfo.toolSize;

    const dx = Math.cos(angle) * r;
    const dy = Math.sin(angle) * r;
    const newPoint2 = [cx + dx, cy + dy];

    return viewport.canvasToWorld(newPoint2);
  }

  public isInCursor(point, mousePoint) {
    return vec3.distance(point, mousePoint) < this.toolInfo.toolSize;
  }
}

export default CircleSculptCursor;
