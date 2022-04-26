import {
  drawHandles as drawHandlesSvg,
  drawPolyline as drawPolylineSvg,
} from '../../../drawingSvg';
import { polyline } from '../../../utilities/math';
import { Settings } from '@cornerstonejs/core';

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

const renderDebugContours = false;

function renderDebugOpenContoursDuringEdit(
  enabledElement,
  svgDrawingHelper,
  annotation
) {
  const { prevCanvasPoints, editCanvasPoints, snapIndex } = this.editData;

  const debugLineDash = '1,5';
  const debugColor = 'dodgerblue';
  const debugEditColor = 'crimson';

  if (snapIndex) {
    const polylineUID1 = '100';

    drawPolylineSvg(
      svgDrawingHelper,
      this.getToolName(),
      annotation.annotationUID,
      polylineUID1,
      editCanvasPoints,
      {
        color: debugEditColor,
        width: 3,
        lineDash: debugLineDash,
      }
    );

    const snapLine = [
      editCanvasPoints[editCanvasPoints.length - 1],
      prevCanvasPoints[snapIndex],
    ];

    const polylineUID2 = '101';

    drawPolylineSvg(
      svgDrawingHelper,
      this.getToolName(),
      annotation.annotationUID,
      polylineUID2,
      snapLine,
      {
        color: debugEditColor,
        width: 3,
        lineDash: debugLineDash,
      }
    );
  }

  const polylineUID3 = '102';

  drawPolylineSvg(
    svgDrawingHelper,
    this.getToolName(),
    annotation.annotationUID,
    polylineUID3,
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
}

function renderDebugClosedContoursDuringEdit(
  enabledElement,
  svgDrawingHelper,
  annotation
) {
  const { prevCanvasPoints } = this.editData;

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
}

function renderClosedContourBeingEdited(
  enabledElement,
  svgDrawingHelper,
  annotation
) {
  const { fusedCanvasPoints } = this.editData;

  if (fusedCanvasPoints === undefined) {
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

function renderOpenContourBeingEdited(
  enabledElement,
  svgDrawingHelper,
  annotation
) {
  const { fusedCanvasPoints } = this.editData;

  if (fusedCanvasPoints === undefined) {
    // No edit to render yet, render closed contour.
    this.renderOpenContour(enabledElement, svgDrawingHelper, annotation);

    return;
  }

  if (renderDebugContours) {
    this.renderDebugOpenContoursDuringEdit(
      enabledElement,
      svgDrawingHelper,
      annotation
    );
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

  // DEBUG
  toolInstance.renderDebugClosedContoursDuringEdit =
    renderDebugClosedContoursDuringEdit.bind(toolInstance);
  toolInstance.renderDebugOpenContoursDuringEdit =
    renderDebugOpenContoursDuringEdit.bind(toolInstance);
}

export default registerRenderMethods;
