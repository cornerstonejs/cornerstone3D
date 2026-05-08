import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils, getEnabledElement } from '@cornerstonejs/core';
import type { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation';
import { ContourWindingDirection } from '../../types/ContourAnnotation';
import * as math from '../math';
import updateContourPolyline from '../contours/updateContourPolyline';
import {
  addAnnotation,
  removeAnnotation,
  getChildAnnotations,
  addChildAnnotation,
  clearParentAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { addContourSegmentationAnnotation } from './addContourSegmentationAnnotation';
import { removeContourSegmentationAnnotation } from './removeContourSegmentationAnnotation';
import { triggerAnnotationModified } from '../../stateManagement/annotation/helpers/state';
import triggerAnnotationRenderForViewportIds from '../triggerAnnotationRenderForViewportIds';
import { getViewportIdsWithToolToRender } from '../viewportFilters';
import { hasToolByName, hasTool } from '../../store/addTool';

/**
 * Default tool name for contour segmentation operations.
 */
const DEFAULT_CONTOUR_SEG_TOOL_NAME = 'PlanarFreehandContourSegmentationTool';

/**
 * Processes multiple intersecting annotations with a source annotation.
 * This function handles the complex case where a source annotation intersects
 * with multiple target annotations, requiring multiple operations.
 *
 * @param viewport - The viewport context.
 * @param sourceAnnotation - The newly completed contour segmentation.
 * @param sourcePolyline - The polyline of the source annotation in canvas space.
 * @param intersectingContours - Array of intersecting contour information.
 */
function processMultipleIntersections(
  viewport: Types.IViewport,
  sourceAnnotation: ContourSegmentationAnnotation,
  sourcePolyline: Types.Point2[],
  intersectingContours: Array<{
    targetAnnotation: ContourSegmentationAnnotation;
    targetPolyline: Types.Point2[];
    isContourHole: boolean;
  }>
): void {
  // Separate hole operations from merge/subtract operations
  const holeOperations = intersectingContours.filter(
    (item) => item.isContourHole
  );
  const mergeOperations = intersectingContours.filter(
    (item) => !item.isContourHole
  );

  // Handle hole operations first (source becomes a hole in target annotations)
  if (holeOperations.length > 0) {
    // For hole operations, we only use the first target (largest containing contour)
    const primaryHoleTarget = holeOperations[0];
    createPolylineHole(
      viewport,
      primaryHoleTarget.targetAnnotation,
      sourceAnnotation
    );
    updateViewportsForAnnotations(viewport, [
      sourceAnnotation,
      primaryHoleTarget.targetAnnotation,
    ]);
    return;
  }

  // Handle merge/subtract operations
  if (mergeOperations.length === 0) {
    return;
  }

  // Check if the necessary tool for creating new combined contours is registered.
  if (!hasToolByName(DEFAULT_CONTOUR_SEG_TOOL_NAME)) {
    console.warn(
      `${DEFAULT_CONTOUR_SEG_TOOL_NAME} is not registered in cornerstone. Cannot process multiple intersections.`
    );
    return;
  }

  // Process each intersection sequentially
  processSequentialIntersections(
    viewport,
    sourceAnnotation,
    sourcePolyline,
    mergeOperations
  );
}

/**
 * Processes intersections sequentially, combining or subtracting one at a time.
 */
function processSequentialIntersections(
  viewport: Types.IViewport,
  sourceAnnotation: ContourSegmentationAnnotation,
  sourcePolyline: Types.Point2[],
  mergeOperations: Array<{
    targetAnnotation: ContourSegmentationAnnotation;
    targetPolyline: Types.Point2[];
    isContourHole: boolean;
  }>
): void {
  const { element } = viewport;
  const allAnnotationsToRemove = [sourceAnnotation];
  const allResultPolylines: Types.Point2[][] = [];
  const allHoles: Array<{
    annotation: ContourSegmentationAnnotation;
    polyline: Types.Point2[];
  }> = [];

  // Collect all holes from target annotations
  mergeOperations.forEach(({ targetAnnotation }) => {
    const holes = getContourHolesData(viewport, targetAnnotation);
    allHoles.push(...holes);
    allAnnotationsToRemove.push(targetAnnotation);
  });

  // Determine operation type based on whether source start point is inside any target polyline
  const sourceStartPoint = sourcePolyline[0];
  const shouldMerge = mergeOperations.some(({ targetPolyline }) =>
    math.polyline.containsPoint(targetPolyline, sourceStartPoint)
  );

  if (shouldMerge) {
    // Merge all polylines together
    let resultPolyline = sourcePolyline;
    mergeOperations.forEach(({ targetPolyline }) => {
      resultPolyline = math.polyline.mergePolylines(
        resultPolyline,
        targetPolyline
      );
    });
    allResultPolylines.push(resultPolyline);
  } else {
    // Subtract source from each target
    mergeOperations.forEach(({ targetPolyline }) => {
      const subtractedPolylines = math.polyline.subtractPolylines(
        targetPolyline,
        sourcePolyline
      );
      allResultPolylines.push(...subtractedPolylines);
    });
  }

  // Remove all original annotations
  allAnnotationsToRemove.forEach((annotation) => {
    removeAnnotation(annotation.annotationUID);
    removeContourSegmentationAnnotation(annotation);
  });

  // Detach holes from old annotations
  allHoles.forEach((holeData) => clearParentAnnotation(holeData.annotation));

  // Create new annotations from result polylines
  const baseAnnotation = mergeOperations[0].targetAnnotation;
  const newAnnotations: ContourSegmentationAnnotation[] = [];

  allResultPolylines.forEach((polyline) => {
    if (!polyline || polyline.length < 3) {
      console.warn(
        'Skipping creation of new annotation due to invalid polyline:',
        polyline
      );
      return;
    }

    const newAnnotation = createNewAnnotationFromPolyline(
      viewport,
      baseAnnotation,
      polyline
    );
    addAnnotation(newAnnotation, element);
    addContourSegmentationAnnotation(newAnnotation);
    triggerAnnotationModified(newAnnotation, viewport.element);
    newAnnotations.push(newAnnotation);
  });

  // Reassign holes to new annotations
  reassignHolesToNewAnnotations(viewport, allHoles, newAnnotations);

  updateViewportsForAnnotations(viewport, allAnnotationsToRemove);
}

/**
 * Creates a new annotation from a polyline, copying metadata from a base annotation.
 */
function createNewAnnotationFromPolyline(
  viewport: Types.IViewport,
  baseAnnotation: ContourSegmentationAnnotation,
  polyline: Types.Point2[]
): ContourSegmentationAnnotation {
  const startPointWorld = viewport.canvasToWorld(polyline[0]);
  const endPointWorld = viewport.canvasToWorld(polyline[polyline.length - 1]);

  const newAnnotation: ContourSegmentationAnnotation = {
    metadata: {
      ...baseAnnotation.metadata,
      toolName: DEFAULT_CONTOUR_SEG_TOOL_NAME,
      originalToolName:
        baseAnnotation.metadata.originalToolName ||
        baseAnnotation.metadata.toolName,
    },
    data: {
      cachedStats: {},
      handles: {
        points: [startPointWorld, endPointWorld],
        textBox: baseAnnotation.data.handles.textBox
          ? { ...baseAnnotation.data.handles.textBox }
          : undefined,
      },
      contour: {
        polyline: [],
        closed: true,
      },
      spline: baseAnnotation.data.spline,
      segmentation: {
        ...baseAnnotation.data.segmentation,
      },
    },
    annotationUID: csUtils.uuidv4() as string,
    highlighted: true,
    invalidated: true,
    isLocked: false,
    isVisible: undefined,
    interpolationUID: baseAnnotation.interpolationUID,
    interpolationCompleted: baseAnnotation.interpolationCompleted,
  };

  updateContourPolyline(
    newAnnotation,
    {
      points: polyline,
      closed: true,
      targetWindingDirection: ContourWindingDirection.Clockwise,
    },
    viewport
  );

  return newAnnotation;
}

/**
 * Reassigns holes to new annotations based on containment.
 */
function reassignHolesToNewAnnotations(
  viewport: Types.IViewport,
  holes: Array<{
    annotation: ContourSegmentationAnnotation;
    polyline: Types.Point2[];
  }>,
  newAnnotations: ContourSegmentationAnnotation[]
): void {
  holes.forEach((holeData) => {
    // Find which new annotation should contain this hole
    const parentAnnotation = newAnnotations.find((annotation) => {
      const parentPolyline = convertContourPolylineToCanvasSpace(
        annotation.data.contour.polyline,
        viewport
      );
      return math.polyline.containsPoints(parentPolyline, holeData.polyline);
    });

    if (parentAnnotation) {
      addChildAnnotation(parentAnnotation, holeData.annotation);
    }
  });
}

/**
 * Helper function to get hole data from an annotation.
 */
function getContourHolesData(
  viewport: Types.IViewport,
  annotation: ContourSegmentationAnnotation
): Array<{
  annotation: ContourSegmentationAnnotation;
  polyline: Types.Point2[];
}> {
  return getChildAnnotations(annotation).map((holeAnnotation) => {
    const contourHoleAnnotation =
      holeAnnotation as ContourSegmentationAnnotation;
    const polyline = convertContourPolylineToCanvasSpace(
      contourHoleAnnotation.data.contour.polyline,
      viewport
    );
    return { annotation: contourHoleAnnotation, polyline };
  });
}

/**
 * Helper function to create a hole in a target annotation.
 */
function createPolylineHole(
  viewport: Types.IViewport,
  targetAnnotation: ContourSegmentationAnnotation,
  holeAnnotation: ContourSegmentationAnnotation
): void {
  addChildAnnotation(targetAnnotation, holeAnnotation);
  removeContourSegmentationAnnotation(holeAnnotation);

  const { contour: holeContour } = holeAnnotation.data;
  const holePolylineCanvas = convertContourPolylineToCanvasSpace(
    holeContour.polyline,
    viewport
  );

  updateContourPolyline(
    holeAnnotation,
    {
      points: holePolylineCanvas,
      closed: holeContour.closed,
      targetWindingDirection:
        targetAnnotation.data.contour.windingDirection ===
        ContourWindingDirection.Clockwise
          ? ContourWindingDirection.CounterClockwise
          : ContourWindingDirection.Clockwise,
    },
    viewport
  );
}

/**
 * Converts a 3D polyline to 2D canvas space.
 */
function convertContourPolylineToCanvasSpace(
  polyline: Types.Point3[],
  viewport: Types.IViewport
): Types.Point2[] {
  const numPoints = polyline.length;
  const projectedPolyline = new Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    projectedPolyline[i] = viewport.worldToCanvas(polyline[i]);
  }

  return projectedPolyline;
}

/**
 * Updates viewports for multiple annotations.
 */
function updateViewportsForAnnotations(
  viewport: Types.IViewport,
  annotations: ContourSegmentationAnnotation[]
): void {
  const { element } = viewport;
  const updatedToolNames = new Set([DEFAULT_CONTOUR_SEG_TOOL_NAME]);

  annotations.forEach((annotation) => {
    updatedToolNames.add(annotation.metadata.toolName);
  });

  for (const toolName of updatedToolNames.values()) {
    if (hasToolByName(toolName)) {
      const viewportIdsToRender = getViewportIdsWithToolToRender(
        element,
        toolName
      );
      triggerAnnotationRenderForViewportIds(viewportIdsToRender);
    }
  }
}

export { processMultipleIntersections };
