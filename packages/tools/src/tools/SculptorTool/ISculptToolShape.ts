import type { Types } from '@cornerstonejs/core';
import { SVGDrawingHelper, EventTypes, Annotation } from '../../types';
import { PushedHandles } from './CircleSculptCursor';
import { SculptData } from '../SculptorTool';

/**
 * This interface defines a contract for implementing various shapes within sculptor tool.
 * Classes such as `CircleSculptCursor` adhere to this interface, providing specific implementations for sculptor tools to utilize circle shapes during sculpting operations.
 */
export interface ISculptToolShape {
  /**
   * Uesd to render shapes supported for sculptor tool
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   * @param canvasLocation - Current canvas location
   * @param options - Options for drwing shapes
   */
  renderShape(
    svgDrawingHelper: SVGDrawingHelper,
    canvasLocation: Types.Point2,
    options: any
  ): void;
  /**
   * Pushes the points radially away from the mouse if they are
   * contained within the shape defined by the freehandSculpter tool
   * @param viewport
   * @param sculptData
   */
  pushHandles(viewport: Types.IViewport, sculptData: SculptData): PushedHandles;
  /**
   * Function configures the tool size
   * @param evt
   */
  configureToolSize(evt: EventTypes.InteractionEventType): void;
  /**
   * Updates the tool size
   * @param canvasCoords - Current canvas points
   * @param viewport
   * @param activeAnnotation
   */
  UpdateToolsize(
    canvasCoords: Types.Point2,
    viewport: Types.IViewport,
    activeAnnotation: Annotation
  ): void;
  /**
   * Function returns max spacing between two handles
   * @param minSpacing -
   */
  getMaxSpacing(minSpacing: number): number;
  /**
   * Function returns the the position to insert new handle
   * @param previousIndex - Previous handle index
   * @param nextIndex - Next handle index
   * @param sculptData - Sculpt data
   */
  getInsertPosition(
    previousIndex: number,
    nextIndex: number,
    sculptData: SculptData
  ): Types.Point3;
}
