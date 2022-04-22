import {
  drawHandles as drawHandlesSvg,
  drawPolyline as drawPolylineSvg,
} from '../../../drawingSvg';
import { polyline } from '../../../utilities/math';
import { Settings, utilities as csUtils } from '@cornerstonejs/core';

const { pointsAreWithinCloseContourProximity } = polyline;

function renderContour(enabledElement, svgDrawingHelper, annotation) {
  if (annotation.data.isOpenContour) {
    this.renderOpenContour(enabledElement, svgDrawingHelper, annotation);
  } else {
    this.renderClosedContour(enabledElement, svgDrawingHelper, annotation);
  }
}

function renderClosedContour(enabledElement, svgDrawingHelper, annotation) {
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

function renderOpenContour(enabledElement, svgDrawingHelper, annotation) {
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
    let indexOfCanvasPoints =
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

function renderContourBeingDrawn(enabledElement, svgDrawingHelper, annotation) {
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

function renderClosedContourBeingEdited(
  enabledElement,
  svgDrawingHelper,
  annotation
) {
  // NOTE -> Debug for now -> Render full contour + edit input line
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

  const { editCanvasPoints } = this.closedContourEditData;

  const polylineUID2 = '2';

  drawPolylineSvg(
    svgDrawingHelper,
    this.getToolName(),
    annotation.annotationUID,
    polylineUID2,
    editCanvasPoints,
    { color: 'crimson', width: options.width }
  );
}

function renderOpenContourBeingEdited(
  enabledElement,
  svgDrawingHelper,
  annotation
) {
  // TODO_JAMES
  console.log('TODO_JAMES => renderOpenContourBeingEdited');
}

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
