import {
  drawHandles as drawHandlesSvg,
  drawPolyline as drawPolylineSvg,
} from '../../../drawingSvg';
import { polyline } from '../../../utilities/math';
import { Settings } from '@cornerstonejs/core';
import { PlanarFreehandROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import type { Types } from '@cornerstonejs/core';

const { pointsAreWithinCloseContourProximity } = polyline;

/**
 * Renders a `PlanarFreehandROIAnnotation` that is not currently being drawn or edited.
 */
function renderContour(
  enabledElement: Types.IEnabledElement,
  svgDrawingHelper: any,
  annotation: PlanarFreehandROIAnnotation
): void {
  if (annotation.data.isOpenContour) {
    this.renderOpenContour(enabledElement, svgDrawingHelper, annotation);
  } else {
    this.renderClosedContour(enabledElement, svgDrawingHelper, annotation);
  }
}

/**
 * Renders an closed `PlanarFreehandROIAnnotation` annotation.
 */
function renderClosedContour(
  enabledElement: Types.IEnabledElement,
  svgDrawingHelper: any,
  annotation: PlanarFreehandROIAnnotation
): void {
  const { viewport } = enabledElement;

  const settings = Settings.getObjectSettings(annotation, this.getToolName());

  // Todo -> Its unfortunate that we have to do this for each annotation,
  // Even if its unchanged. Perhaps we should cache canvas points per element
  // on the tool? That feels very weird also as we'd need to manage it/clean
  // them up.
  const canvasPoints = annotation.data.polyline.map((worldPos) =>
    viewport.worldToCanvas(worldPos)
  );

  const lineWidth = this.getStyle(settings, 'lineWidth', annotation);
  // const lineDash = this.getStyle(settings, 'lineDash', annotation);
  const color = this.getStyle(settings, 'color', annotation);

  const options = {
    color: color === undefined ? undefined : <string>color,
    width: lineWidth === undefined ? undefined : <number>lineWidth,
    connectLastToFirst: true,
  };

  const polylineUID = '1';

  drawPolylineSvg(
    svgDrawingHelper,
    this.getToolName(),
    annotation.annotationUID,
    polylineUID,
    canvasPoints,
    options
  );
}

/**
 * Renders an open `PlanarFreehandROIAnnotation` annotation.
 */
function renderOpenContour(
  enabledElement: Types.IEnabledElement,
  svgDrawingHelper: any,
  annotation: PlanarFreehandROIAnnotation
): void {
  const { viewport } = enabledElement;
  const settings = Settings.getObjectSettings(annotation, this.getToolName());

  // Its unfortunate that we have to do this for each annotation,
  // Even if its unchanged. In the future we could cache the canvas points per
  // element on the tool? That feels very weird also as we'd need to manage
  // it/clean them up. Its a pre-optimisation for now and we can tackle it if it
  // becomes a problem.
  const canvasPoints = annotation.data.polyline.map((worldPos) =>
    viewport.worldToCanvas(worldPos)
  );

  const lineWidth = this.getStyle(settings, 'lineWidth', annotation);
  const color = this.getStyle(settings, 'color', annotation);

  const options = {
    color: color === undefined ? undefined : <string>color,
    width: lineWidth === undefined ? undefined : <number>lineWidth,
    connectLastToFirst: false,
  };

  const polylineUID = '1';

  drawPolylineSvg(
    svgDrawingHelper,
    this.getToolName(),
    annotation.annotationUID,
    polylineUID,
    canvasPoints,
    options
  );

  const activeHandleIndex = annotation.data.handles.activeHandleIndex;

  if (activeHandleIndex !== null) {
    // Draw highlighted points
    const handleGroupUID = '0';

    // We already mapped all the points, so don't do the mapping again.
    // The activeHandleIndex can only be one of two points.
    const indexOfCanvasPoints =
      activeHandleIndex === 0 ? 0 : canvasPoints.length - 1;

    const handlePoint = canvasPoints[indexOfCanvasPoints];

    drawHandlesSvg(
      svgDrawingHelper,
      this.getToolName(),
      annotation.annotationUID,
      handleGroupUID,
      [handlePoint],
      { color }
    );
  }
}

/**
 * Renders a new `PlanarFreehandROIAnnotation` annotation during
 * creation/drawing.
 */
function renderContourBeingDrawn(
  enabledElement: Types.IEnabledElement,
  svgDrawingHelper: any,
  annotation: PlanarFreehandROIAnnotation
): void {
  const { allowOpenContours } = this.configuration;
  const settings = Settings.getObjectSettings(annotation, this.getToolName());

  const { canvasPoints } = this.drawData;

  const lineWidth = this.getStyle(settings, 'lineWidth', annotation);
  // const lineDash = this.getStyle(settings, 'lineDash', annotation);
  const color = this.getStyle(settings, 'color', annotation);

  const options = {
    color: color === undefined ? undefined : <string>color,
    width: lineWidth === undefined ? undefined : <number>lineWidth,
  };

  drawPolylineSvg(
    svgDrawingHelper,
    this.getToolName(),
    annotation.annotationUID,
    '1',
    canvasPoints,
    options
  );

  if (allowOpenContours) {
    const firstPoint = canvasPoints[0];
    const lastPoint = canvasPoints[canvasPoints.length - 1];

    // Check if start and end are within close proximity
    if (
      pointsAreWithinCloseContourProximity(
        firstPoint,
        lastPoint,
        this.configuration.closeContourProximity
      )
    ) {
      // Preview join last points

      drawPolylineSvg(
        svgDrawingHelper,
        this.getToolName(),
        annotation.annotationUID,
        '2',
        [lastPoint, firstPoint],
        options
      );
    } else {
      // Draw start point
      const handleGroupUID = '0';

      drawHandlesSvg(
        svgDrawingHelper,
        this.getToolName(),
        annotation.annotationUID,
        handleGroupUID,
        [firstPoint],
        { color, handleRadius: 2 }
      );
    }
  }
}

/**
 * Renders a closed `PlanarFreehandROIAnnotation` being edited.
 */
function renderClosedContourBeingEdited(
  enabledElement,
  svgDrawingHelper,
  annotation
): void {
  const { fusedCanvasPoints } = this.editData;

  if (fusedCanvasPoints === undefined) {
    // No edit to render yet, render closed contour.
    this.renderClosedContour(enabledElement, svgDrawingHelper, annotation);

    return;
  }

  const settings = Settings.getObjectSettings(annotation, this.getToolName());

  const lineWidth = this.getStyle(settings, 'lineWidth', annotation);
  const color = this.getStyle(settings, 'color', annotation);

  const options = {
    color: color === undefined ? undefined : <string>color,
    width: lineWidth === undefined ? undefined : <number>lineWidth,
    connectLastToFirst: true,
  };

  const polylineUIDToRender = 'preview-1';

  drawPolylineSvg(
    svgDrawingHelper,
    this.getToolName(),
    annotation.annotationUID,
    polylineUIDToRender,
    fusedCanvasPoints,
    options
  );
}

/**
 * Renders an open `PlanarFreehandROIAnnotation` being edited.
 */
function renderOpenContourBeingEdited(
  enabledElement: Types.IEnabledElement,
  svgDrawingHelper: any,
  annotation: PlanarFreehandROIAnnotation
): void {
  const { fusedCanvasPoints } = this.editData;

  if (fusedCanvasPoints === undefined) {
    // No edit to render yet, render closed contour.
    this.renderOpenContour(enabledElement, svgDrawingHelper, annotation);

    return;
  }

  const settings = Settings.getObjectSettings(annotation, this.getToolName());

  const lineWidth = this.getStyle(settings, 'lineWidth', annotation);
  const color = this.getStyle(settings, 'color', annotation);

  const options = {
    color: color === undefined ? undefined : <string>color,
    width: lineWidth === undefined ? undefined : <number>lineWidth,
    connectLastToFirst: false,
  };

  const polylineUIDToRender = 'preview-1';

  drawPolylineSvg(
    svgDrawingHelper,
    this.getToolName(),
    annotation.annotationUID,
    polylineUIDToRender,
    fusedCanvasPoints,
    options
  );
}

/**
 * Registers the render methods of various contour states to the tool instance.
 */
function registerRenderMethods(toolInstance) {
  toolInstance.renderContour = renderContour.bind(toolInstance);
  toolInstance.renderClosedContour = renderClosedContour.bind(toolInstance);
  toolInstance.renderOpenContour = renderOpenContour.bind(toolInstance);

  toolInstance.renderContourBeingDrawn =
    renderContourBeingDrawn.bind(toolInstance);

  toolInstance.renderClosedContourBeingEdited =
    renderClosedContourBeingEdited.bind(toolInstance);
  toolInstance.renderOpenContourBeingEdited =
    renderOpenContourBeingEdited.bind(toolInstance);
}

export default registerRenderMethods;
