import type { Types } from '@cornerstonejs/core';
import {
  drawHandles as drawHandlesSvg,
  drawPolyline as drawPolylineSvg,
  drawPath as drawPathSvg,
} from '../../../drawingSvg';
import { polyline } from '../../../utilities/math';
import { findOpenUShapedContourVectorToPeakOnRender } from './findOpenUShapedContourVectorToPeak';
import { PlanarFreehandROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import { StyleSpecifier } from '../../../types/AnnotationStyle';
import { SVGDrawingHelper } from '../../../types';
import { getContourHolesDataCanvas } from '../../../utilities/contours';

const { pointsAreWithinCloseContourProximity } = polyline;

type PlanarFreehandROIRenderOptions = {
  color?: string;
  width?: number;
  connectFirstToLast?: boolean;
};

function _getRenderingOptions(
  enabledElement: Types.IEnabledElement,
  annotation: PlanarFreehandROIAnnotation
): PlanarFreehandROIRenderOptions {
  const styleSpecifier: StyleSpecifier = {
    toolGroupId: this.toolGroupId,
    toolName: this.getToolName(),
    viewportId: enabledElement.viewport.id,
    annotationUID: annotation.annotationUID,
  };

  const { lineWidth, lineDash, color, fillColor, fillOpacity } =
    this.getAnnotationStyle({
      annotation,
      styleSpecifier,
    });

  const { closed: isClosedContour } = annotation.data.contour;

  const options = {
    color,
    width: lineWidth,
    lineDash,
    fillColor,
    fillOpacity,
    closePath: isClosedContour,
  };

  return options;
}

/**
 * Renders a `PlanarFreehandROIAnnotation` that is not currently being drawn or edited.
 */
function renderContour(
  enabledElement: Types.IEnabledElement,
  svgDrawingHelper: SVGDrawingHelper,
  annotation: PlanarFreehandROIAnnotation
): void {
  // prevent drawing or further calculation in case viewport data is not ready yet
  if (!enabledElement?.viewport?.getImageData()) {
    return;
  }
  // Check if the contour is an open contour
  if (annotation.data.contour.closed) {
    this.renderClosedContour(enabledElement, svgDrawingHelper, annotation);
  } else {
    // If its an open contour, check i its a U-shaped contour
    if (annotation.data.isOpenUShapeContour) {
      calculateUShapeContourVectorToPeakIfNotPresent(
        enabledElement,
        annotation
      );

      this.renderOpenUShapedContour(
        enabledElement,
        svgDrawingHelper,
        annotation
      );
    } else {
      // If not a U-shaped contour, render standard open contour.
      this.renderOpenContour(enabledElement, svgDrawingHelper, annotation);
    }
  }
}

/**
 * If the open U-shaped contour does not have a peak.
 */
function calculateUShapeContourVectorToPeakIfNotPresent(
  enabledElement: Types.IEnabledElement,
  annotation: PlanarFreehandROIAnnotation
): void {
  if (!annotation.data.openUShapeContourVectorToPeak) {
    // Annotation just been set to be an open U-shaped contour.
    // calculate its peak vector here.
    annotation.data.openUShapeContourVectorToPeak =
      findOpenUShapedContourVectorToPeakOnRender(enabledElement, annotation);
  }
}

/**
 * Renders an closed `PlanarFreehandROIAnnotation` annotation.
 */
function renderClosedContour(
  enabledElement: Types.IEnabledElement,
  svgDrawingHelper: SVGDrawingHelper,
  annotation: PlanarFreehandROIAnnotation
): void {
  if (annotation.parentAnnotationUID) {
    return;
  }

  const { viewport } = enabledElement;
  const options = this._getRenderingOptions(enabledElement, annotation);

  // Its unfortunate that we have to do this for each annotation,
  // Even if its unchanged. In the future we could cache the canvas points per
  // element on the tool? That feels very weird also as we'd need to manage
  // it/clean them up. Its a pre-optimisation for now and we can tackle it if it
  // becomes a problem.
  const canvasPolyline = annotation.data.contour.polyline.map((worldPos) =>
    viewport.worldToCanvas(worldPos)
  );

  const childContours = getContourHolesDataCanvas(annotation, viewport);
  const allContours = [canvasPolyline, ...childContours];
  const polylineUID = '1';

  drawPathSvg(
    svgDrawingHelper,
    annotation.annotationUID,
    polylineUID,
    allContours,
    options
  );
}

/**
 * Renders an open `PlanarFreehandROIAnnotation` annotation.
 */
function renderOpenContour(
  enabledElement: Types.IEnabledElement,
  svgDrawingHelper: SVGDrawingHelper,
  annotation: PlanarFreehandROIAnnotation
): void {
  const { viewport } = enabledElement;
  const options = this._getRenderingOptions(enabledElement, annotation);

  const canvasPoints = annotation.data.contour.polyline.map((worldPos) =>
    viewport.worldToCanvas(worldPos)
  );

  const polylineUID = '1';

  drawPolylineSvg(
    svgDrawingHelper,
    annotation.annotationUID,
    polylineUID,
    canvasPoints,
    options
  );

  const activeHandleIndex = annotation.data.handles.activeHandleIndex;

  if (this.configuration.alwaysRenderOpenContourHandles?.enabled === true) {
    const radius = this.configuration.alwaysRenderOpenContourHandles.radius;

    // Draw highlighted points
    const handleGroupUID = '0';

    // We already mapped all the points, so don't do the mapping again.
    // The activeHandleIndex can only be one of two points.
    const handlePoints = [
      canvasPoints[0],
      canvasPoints[canvasPoints.length - 1],
    ];

    // Don't render a hovered handle, as this will be rendered larger in
    // the next block.
    if (activeHandleIndex === 0) {
      handlePoints.shift();
    } else if (activeHandleIndex === 1) {
      handlePoints.pop();
    }

    drawHandlesSvg(
      svgDrawingHelper,
      annotation.annotationUID,
      handleGroupUID,
      handlePoints,
      {
        color: options.color,
        handleRadius: radius,
      }
    );
  }

  if (activeHandleIndex !== null) {
    // Draw highlighted points
    const handleGroupUID = '1';

    // We already mapped all the points, so don't do the mapping again.
    // The activeHandleIndex can only be one of two points.
    const indexOfCanvasPoints =
      activeHandleIndex === 0 ? 0 : canvasPoints.length - 1;

    const handlePoint = canvasPoints[indexOfCanvasPoints];

    drawHandlesSvg(
      svgDrawingHelper,
      annotation.annotationUID,
      handleGroupUID,
      [handlePoint],
      { color: options.color }
    );
  }
}

function renderOpenUShapedContour(
  enabledElement: Types.IEnabledElement,
  svgDrawingHelper: SVGDrawingHelper,
  annotation: PlanarFreehandROIAnnotation
): void {
  const { viewport } = enabledElement;
  const { openUShapeContourVectorToPeak } = annotation.data;
  const { polyline } = annotation.data.contour;

  this.renderOpenContour(enabledElement, svgDrawingHelper, annotation);

  // prevent rendering u shape in case openUShapeContourVectorToPeak is not set yet
  if (!openUShapeContourVectorToPeak) {
    return;
  }

  const firstCanvasPoint = viewport.worldToCanvas(polyline[0]);
  const lastCanvasPoint = viewport.worldToCanvas(polyline[polyline.length - 1]);

  const openUShapeContourVectorToPeakCanvas = [
    viewport.worldToCanvas(openUShapeContourVectorToPeak[0]),
    viewport.worldToCanvas(openUShapeContourVectorToPeak[1]),
  ];

  const options = this._getRenderingOptions(enabledElement, annotation);

  // Join first and last points
  drawPolylineSvg(
    svgDrawingHelper,
    annotation.annotationUID,
    'first-to-last',
    [firstCanvasPoint, lastCanvasPoint],
    {
      color: options.color,
      width: options.width,
      closePath: false,
      lineDash: '2,2',
    }
  );

  // Render midpoint to open contour surface line
  drawPolylineSvg(
    svgDrawingHelper,
    annotation.annotationUID,
    'midpoint-to-open-contour',
    [
      openUShapeContourVectorToPeakCanvas[0],
      openUShapeContourVectorToPeakCanvas[1],
    ],
    {
      color: options.color,
      width: options.width,
      closePath: false,
      lineDash: '2,2',
    }
  );
}

/**
 * Renders a new `PlanarFreehandROIAnnotation` annotation during
 * creation/drawing.
 */
function renderContourBeingDrawn(
  enabledElement: Types.IEnabledElement,
  svgDrawingHelper: SVGDrawingHelper,
  annotation: PlanarFreehandROIAnnotation
): void {
  const options = this._getRenderingOptions(enabledElement, annotation);

  const { allowOpenContours } = this.configuration;
  const { canvasPoints } = this.drawData;

  // Override rendering whilst drawing the contour, we don't know if its open
  // or closed yet
  options.closePath = false;

  drawPolylineSvg(
    svgDrawingHelper,
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
        annotation.annotationUID,
        handleGroupUID,
        [firstPoint],
        { color: options.color, handleRadius: 2 }
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
  const { viewport } = enabledElement;
  const { fusedCanvasPoints } = this.editData;

  if (fusedCanvasPoints === undefined) {
    // No edit to render yet, render closed contour.
    this.renderClosedContour(enabledElement, svgDrawingHelper, annotation);

    return;
  }

  // Get the polylines from child annotations (holes)
  const childContours = getContourHolesDataCanvas(annotation, viewport);

  const allContours = [fusedCanvasPoints, ...childContours];
  const options = this._getRenderingOptions(enabledElement, annotation);
  const polylineUIDToRender = 'preview-1';

  // Set `fillOpacity` to zero if it is a child annotation (hole) otherwise
  // it would "close" the hole when editing it
  if (annotation.parentAnnotationUID && options.fillOpacity) {
    options.fillOpacity = 0;
  }

  drawPathSvg(
    svgDrawingHelper,
    annotation.annotationUID,
    polylineUIDToRender,
    allContours,
    options
  );
}

/**
 * Renders an open `PlanarFreehandROIAnnotation` being edited.
 */
function renderOpenContourBeingEdited(
  enabledElement: Types.IEnabledElement,
  svgDrawingHelper: SVGDrawingHelper,
  annotation: PlanarFreehandROIAnnotation
): void {
  const { fusedCanvasPoints } = this.editData;

  if (fusedCanvasPoints === undefined) {
    // No edit to render yet, render closed contour.
    this.renderOpenContour(enabledElement, svgDrawingHelper, annotation);

    return;
  }

  const options = this._getRenderingOptions(enabledElement, annotation);

  const polylineUIDToRender = 'preview-1';

  drawPolylineSvg(
    svgDrawingHelper,
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
  toolInstance.renderOpenUShapedContour =
    renderOpenUShapedContour.bind(toolInstance);

  toolInstance.renderContourBeingDrawn =
    renderContourBeingDrawn.bind(toolInstance);

  toolInstance.renderClosedContourBeingEdited =
    renderClosedContourBeingEdited.bind(toolInstance);
  toolInstance.renderOpenContourBeingEdited =
    renderOpenContourBeingEdited.bind(toolInstance);
  toolInstance._getRenderingOptions = _getRenderingOptions.bind(toolInstance);
}

export default registerRenderMethods;
