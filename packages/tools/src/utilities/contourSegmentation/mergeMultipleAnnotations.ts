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
} from '../../stateManagement/annotation/annotationState';
import { addContourSegmentationAnnotation } from './addContourSegmentationAnnotation';
import { removeContourSegmentationAnnotation } from './removeContourSegmentationAnnotation';
import { triggerAnnotationModified } from '../../stateManagement/annotation/helpers/state';
import triggerAnnotationRenderForViewportIds from '../triggerAnnotationRenderForViewportIds';
import { getViewportIdsWithToolToRender } from '../viewportFilters';
import { hasToolByName, hasTool } from '../../store/addTool';
import {
  applyBoolean,
  BooleanOp,
  type PolygonWithHoles,
} from './clipperBooleanOps';

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

  // Build subject polygons (one per target outer) carrying their hole polylines
  // so Clipper can preserve holes across the boolean op.
  const subjects: PolygonWithHoles[] = mergeOperations.map(
    ({ targetAnnotation, targetPolyline }) => {
      const holes = getContourHolesData(viewport, targetAnnotation).map(
        (h) => h.polyline
      );
      return {
        outer: targetPolyline,
        holes: holes.length ? holes : undefined,
      };
    }
  );
  const clips: PolygonWithHoles[] = [{ outer: sourcePolyline }];

  // Decide op: source-start-inside-any-target signals an additive intent (union);
  // otherwise this is a cut-out (difference).
  const sourceStartPoint = sourcePolyline[0];
  const shouldMerge = mergeOperations.some(({ targetPolyline }) =>
    math.polyline.containsPoint(targetPolyline, sourceStartPoint)
  );
  const op = shouldMerge ? BooleanOp.Union : BooleanOp.Difference;

  const resultPolygons = applyBoolean(subjects, clips, op);

  // Collect every annotation we're about to discard: source, all targets, and
  // every existing hole (geometry is replaced wholesale).
  const allHoleAnnotations: ContourSegmentationAnnotation[] = [];
  const allAnnotationsToRemove: ContourSegmentationAnnotation[] = [
    sourceAnnotation,
  ];
  mergeOperations.forEach(({ targetAnnotation }) => {
    allAnnotationsToRemove.push(targetAnnotation);
    getContourHolesData(viewport, targetAnnotation).forEach((h) =>
      allHoleAnnotations.push(h.annotation)
    );
  });

  [...allAnnotationsToRemove, ...allHoleAnnotations].forEach((annotation) => {
    removeAnnotation(annotation.annotationUID);
    removeContourSegmentationAnnotation(annotation);
  });

  // Rebuild annotations from clipper output (outer + holes per polygon).
  const baseAnnotation = mergeOperations[0].targetAnnotation;

  resultPolygons.forEach((polygon) => {
    if (polygon.outer.length < 3) {
      return;
    }
    const parent = createNewAnnotationFromPolyline(
      viewport,
      baseAnnotation,
      polygon.outer,
      ContourWindingDirection.Clockwise
    );
    addAnnotation(parent, element);
    addContourSegmentationAnnotation(parent);
    triggerAnnotationModified(parent, element);

    polygon.holes?.forEach((holePolyline) => {
      if (holePolyline.length < 3) {
        return;
      }
      const hole = createNewAnnotationFromPolyline(
        viewport,
        baseAnnotation,
        holePolyline,
        ContourWindingDirection.CounterClockwise
      );
      addAnnotation(hole, element);
      addChildAnnotation(parent, hole);
      triggerAnnotationModified(hole, element);
    });
  });

  updateViewportsForAnnotations(viewport, allAnnotationsToRemove);
}

/**
 * Creates a new annotation from a polyline, copying metadata from a base annotation.
 */
function createNewAnnotationFromPolyline(
  viewport: Types.IViewport,
  baseAnnotation: ContourSegmentationAnnotation,
  polyline: Types.Point2[],
  windingDirection: ContourWindingDirection = ContourWindingDirection.Clockwise
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
      targetWindingDirection: windingDirection,
    },
    viewport
  );

  return newAnnotation;
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
