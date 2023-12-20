import { getEnabledElement } from '@cornerstonejs/core';
import {
  shouldInterpolate,
  getInterpolatedPoints,
} from '../../../utilities/planarFreehandROITool/interpolatePoints';
import triggerAnnotationRenderForViewportIds from '../../../utilities/triggerAnnotationRenderForViewportIds';
import { polyline } from '../../../utilities/math';
import reverseIfAntiClockwise from '../../../utilities/contourROITool/reverseIfAntiClockwise';

const { addCanvasPointsToArray } = polyline;

/**
 * Completes the contour being drawn, creating a closed contour annotation. It will return true if contour is completed or false in case contour drawing is halted.
 */
function completeDrawClosedContour(element: HTMLDivElement): boolean {
  this.removeCrossedLinesOnCompleteDraw();
  const { canvasPoints } = this.drawData;

  // check and halt if necessary the drawing process, last chance to complete drawing and fire events.
  if (this.haltDrawing(element, canvasPoints)) {
    return false;
  }

  const { annotation, viewportIdsToRender } = this.commonData;
  const enabledElement = getEnabledElement(element);
  const { viewport, renderingEngine } = enabledElement;

  // Convert annotation to world coordinates
  addCanvasPointsToArray(
    element,
    canvasPoints,
    canvasPoints[0],
    this.commonData
  );
  // Remove last point which will be a duplicate now.
  canvasPoints.pop();
  let updatedPoints = this.configuration.makeClockWise
    ? reverseIfAntiClockwise(canvasPoints)
    : canvasPoints;

  updatedPoints = shouldInterpolate(this.configuration)
    ? getInterpolatedPoints(this.configuration, canvasPoints)
    : canvasPoints;

  // Note: -> This is pretty expensive and may not scale well with hundreds of
  // contours. A future optimisation if we use this for segmentation is to re-do
  // this rendering with the GPU rather than SVG.
  const worldPoints = updatedPoints.map((canvasPoint) =>
    viewport.canvasToWorld(canvasPoint)
  );

  annotation.data.polyline = worldPoints;
  annotation.data.isOpenContour = false;
  const { textBox } = annotation.data.handles;

  if (!textBox.hasMoved) {
    this.triggerAnnotationCompleted(annotation);
  }

  this.isDrawing = false;
  this.drawData = undefined;
  this.commonData = undefined;

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

  this.deactivateDraw(element);

  return true;
}

/**
 * Registers the contour drawing loop to the tool instance.
 */
function registerContourDrawLoop(toolInstance): void {
  toolInstance.completeDrawClosedContour =
    completeDrawClosedContour.bind(toolInstance);
}

export default registerContourDrawLoop;
