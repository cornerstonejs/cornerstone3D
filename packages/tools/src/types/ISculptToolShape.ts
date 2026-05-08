import type { Types } from '@cornerstonejs/core';
import type { SVGDrawingHelper, EventTypes, ContourAnnotation } from '.';
import type { PushedHandles } from '../tools/SculptorTool/CircleSculptCursor';
import type { SculptData } from '../tools/SculptorTool';

/**
 * This interface defines a contract for implementing various shapes within the sculptor tool.
 * Classes such as `CircleSculptCursor` adhere to this interface,
 * providing specific implementations for sculptor tools to utilize the shape
 * during sculpting operations.
 */
export interface ISculptToolShape {
  /**
   * Used to render shapes supported for sculptor tool
   *
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   * @param canvasLocation - Current canvas location in canvas index coordinates
   * @param options - Options for drawing shapes
   */
  renderShape(
    svgDrawingHelper: SVGDrawingHelper,
    canvasLocation: Types.Point2,
    options
  ): void;

  /**
   * Function configures the tool size
   */
  configureToolSize(evt: EventTypes.InteractionEventType): void;

  interpolatePoint(
    viewport: Types.IViewport,
    angle: number,
    center: Types.Point2
  ): Types.Point2;

  getEdge(
    viewport: Types.IViewport,
    p1: Types.Point3,
    p2: Types.Point3,
    mouseCanvas: Types.Point2
  ): { point: Types.Point3; angle: number; canvasPoint: Types.Point2 };
  /**
   * Updates the tool size
   * @param canvasCoords - Current canvas points
   */
  updateToolSize(
    canvasCoords: Types.Point2,
    viewport: Types.IViewport,
    activeAnnotation: ContourAnnotation
  ): void;

  /**
   * Function returns max spacing between two handles
   * @param minSpacing -
   */
  getMaxSpacing(minSpacing: number): number;
}
