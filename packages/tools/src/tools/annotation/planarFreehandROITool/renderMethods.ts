import {
  drawHandles as drawHandlesSvg,
  drawPolyline as drawPolylineSvg,
} from '../../../drawingSvg';
import { polyline } from '../../../utilities/math';
import { Settings, utilities as csUtils } from '@cornerstonejs/core';
import { vec2 } from 'gl-matrix';

const { pointsAreWithinCloseContourProximity, calculateAreaOfPoints } =
  polyline;

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

const renderDebugContours = false;

function renderDebugClosedContoursDuringEdit(
  enabledElement,
  svgDrawingHelper,
  annotation
) {
  const { prevCanvasPoints } = this.closedContourEditData;

  const debugLineDash = '1,5';
  const debugColor = 'dodgerblue';

  const polylineUID = '100';

  drawPolylineSvg(
    svgDrawingHelper,
    this.getToolName(),
    annotation.annotationUID,
    polylineUID,
    prevCanvasPoints,
    {
      color: debugColor,
      width: 3,
      lineDash: debugLineDash,
    }
  );

  const handleGroupUID = 'h100';

  // Draw the origin handle
  drawHandlesSvg(
    svgDrawingHelper,
    this.getToolName(),
    annotation.annotationUID,
    handleGroupUID,
    [prevCanvasPoints[0]],
    {
      color: debugColor,
    }
  );

  const handleGroupUID2 = 'h101';

  // Draw another handle that indicates the direction

  const guideHandleIndex = Math.floor(prevCanvasPoints.length / 10);
  drawHandlesSvg(
    svgDrawingHelper,
    this.getToolName(),
    annotation.annotationUID,
    handleGroupUID2,
    [prevCanvasPoints[guideHandleIndex]],
    {
      color: debugColor,
      handleRadius: 2,
    }
  );

  const snapIndex = this.closedContourEditData.snapIndex;
}

function renderClosedContourBeingEdited(
  enabledElement,
  svgDrawingHelper,
  annotation
) {
  const { prevCanvasPoints, editCanvasPoints, startCrossingPoint, snapIndex } =
    this.closedContourEditData;

  if (startCrossingPoint === undefined || snapIndex === undefined) {
    // No edit to render yet, render closed contour.
    this.renderClosedContour(enabledElement, svgDrawingHelper, annotation);

    return;
  }

  if (renderDebugContours) {
    this.renderDebugClosedContoursDuringEdit(
      enabledElement,
      svgDrawingHelper,
      annotation
    );
  }

  const pointsToRender = this.fuseEditPointsWithContour();

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
    pointsToRender,
    options
  );
}

function fuseEditPointsWithContour() {
  const { prevCanvasPoints, editCanvasPoints, startCrossingPoint, snapIndex } =
    this.closedContourEditData;

  // Calculate the distances between the first and last edit points and the origin of the
  // Contour with the snap point. These will be used to see which way around the edit array should be
  // Placed within the preview.

  const startCrossingIndex = startCrossingPoint[0];
  let lowIndex;
  let highIndex;

  if (startCrossingIndex > snapIndex) {
    lowIndex = snapIndex;
    highIndex = startCrossingIndex;
  } else {
    lowIndex = startCrossingIndex;
    highIndex = snapIndex;
  }

  const distanceBetweenLowAndFirstPoint = vec2.distance(
    prevCanvasPoints[lowIndex],
    editCanvasPoints[0]
  );

  const distanceBetweenLowAndLastPoint = vec2.distance(
    prevCanvasPoints[lowIndex],
    editCanvasPoints[editCanvasPoints.length - 1]
  );

  const distanceBetweenHighAndFirstPoint = vec2.distance(
    prevCanvasPoints[highIndex],
    editCanvasPoints[0]
  );

  const distanceBetweenHighAndLastPoint = vec2.distance(
    prevCanvasPoints[highIndex],
    editCanvasPoints[editCanvasPoints.length - 1]
  );

  // Generate two possible contours that could be intepretted from the edit:
  //
  // pointSet1 => 0 -> low -> edit -> high - max.
  // pointSet2 => low -> high -> edit
  //
  // Depending on the placement of the edit and the origin, either of these could be the intended edit.
  // We'll choose the one with the largest area, as edits are considered to be changes to the original area with
  // A relative change of much less than unity.

  // Point Set 1
  let pointSet1 = [];

  // Add points from the orignal contour origin up to the low index.
  for (let i = 0; i < lowIndex; i++) {
    const canvasPoint = prevCanvasPoints[i];

    pointSet1.push([canvasPoint[0], canvasPoint[1]]);
  }

  // Check which orientation of the edit line minimizes the distance between the
  // origial contour low/high points and the start/end nodes of the edit line.

  let inPlaceDistance =
    distanceBetweenLowAndFirstPoint + distanceBetweenHighAndLastPoint;

  let reverseDistance =
    distanceBetweenLowAndLastPoint + distanceBetweenHighAndFirstPoint;

  if (inPlaceDistance < reverseDistance) {
    for (let i = 0; i < editCanvasPoints.length; i++) {
      const canvasPoint = editCanvasPoints[i];

      pointSet1.push([canvasPoint[0], canvasPoint[1]]);
    }
  } else {
    for (let i = editCanvasPoints.length - 1; i >= 0; i--) {
      const canvasPoint = editCanvasPoints[i];

      pointSet1.push([canvasPoint[0], canvasPoint[1]]);
    }
  }

  // Add points from the orignal contour's high index up to to its end point.
  for (let i = highIndex; i < prevCanvasPoints.length; i++) {
    const canvasPoint = prevCanvasPoints[i];

    pointSet1.push([canvasPoint[0], canvasPoint[1]]);
  }

  // Point Set 2
  let pointSet2 = [];

  for (let i = lowIndex; i < highIndex; i++) {
    const canvasPoint = prevCanvasPoints[i];

    pointSet2.push([canvasPoint[0], canvasPoint[1]]);
  }

  inPlaceDistance =
    distanceBetweenHighAndFirstPoint + distanceBetweenLowAndLastPoint;

  reverseDistance =
    distanceBetweenHighAndLastPoint + distanceBetweenLowAndFirstPoint;

  if (inPlaceDistance < reverseDistance) {
    for (let i = 0; i < editCanvasPoints.length; i++) {
      const canvasPoint = editCanvasPoints[i];

      pointSet2.push([canvasPoint[0], canvasPoint[1]]);
    }
  } else {
    for (let i = editCanvasPoints.length - 1; i >= 0; i--) {
      const canvasPoint = editCanvasPoints[i];

      pointSet2.push([canvasPoint[0], canvasPoint[1]]);
    }
  }

  const areaPointSet1 = calculateAreaOfPoints(pointSet1);
  const areaPointSet2 = calculateAreaOfPoints(pointSet2);

  const pointsToRender = areaPointSet1 > areaPointSet2 ? pointSet1 : pointSet2;

  // Return points to render

  // TODO -> Just return points to render once we fixed this
  return pointsToRender;
}

function renderOpenContourBeingEdited(
  enabledElement,
  svgDrawingHelper,
  annotation
) {
  // TODO_JAMES
  console.log('TODO_JAMES => renderOpenContourBeingEdited');

  console.log();
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
  toolInstance.fuseEditPointsWithContour =
    fuseEditPointsWithContour.bind(toolInstance);

  // DEBUG
  toolInstance.renderDebugClosedContoursDuringEdit =
    renderDebugClosedContoursDuringEdit.bind(toolInstance);
}

export default registerRenderMethods;
