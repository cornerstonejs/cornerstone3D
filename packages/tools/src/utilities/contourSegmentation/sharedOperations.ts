import type { Types } from '@cornerstonejs/core';
import { getEnabledElement, utilities as csUtils } from '@cornerstonejs/core';
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
import { hasToolByName } from '../../store/addTool';
import {
  applyBoolean,
  BooleanOp,
  type PolygonWithHoles,
} from './clipperBooleanOps';

const TOLERANCE = 1e-10; // Very small tolerance for floating point comparison

/**
 * Default tool name for contour segmentation operations.
 */
const DEFAULT_CONTOUR_SEG_TOOL_NAME = 'PlanarFreehandContourSegmentationTool';

/**
 * Converts a 3D polyline (in world coordinates) to a 2D polyline (in canvas space)
 * for a specific viewport.
 */
export function convertContourPolylineToCanvasSpace(
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
 * Converts a 2D polyline (in canvas space) to a 3D polyline (in world coordinates)
 * for a specific viewport.
 */
export function convertContourPolylineToWorld(
  polyline: Types.Point2[],
  viewport: Types.IViewport
): Types.Point3[] {
  const numPoints = polyline.length;
  const projectedPolyline = new Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    projectedPolyline[i] = viewport.canvasToWorld(polyline[i]);
  }

  return projectedPolyline;
}
/**
 * Checks if two polylines intersect and determines the type of intersection
 */
export function checkIntersection(
  sourcePolyline: Types.Point2[],
  targetPolyline: Types.Point2[]
): {
  hasIntersection: boolean;
  isContourHole: boolean;
  isTargetInsideSource: boolean;
} {
  const sourceAABB = math.polyline.getAABB(sourcePolyline);
  const targetAABB = math.polyline.getAABB(targetPolyline);

  const aabbIntersect = math.aabb.intersectAABB(sourceAABB, targetAABB);

  if (!aabbIntersect) {
    return {
      hasIntersection: false,
      isContourHole: false,
      isTargetInsideSource: false,
    };
  }

  const lineSegmentsIntersect = math.polyline.intersectPolyline(
    sourcePolyline,
    targetPolyline
  );

  // A contour hole is when AABBs intersect, polylines don't intersect, and source is inside target
  const isContourHole =
    !lineSegmentsIntersect &&
    math.polyline.containsPoints(targetPolyline, sourcePolyline);

  // Target is fully contained inside source (no edge crossings)
  const isTargetInsideSource =
    !lineSegmentsIntersect &&
    !isContourHole &&
    math.polyline.containsPoints(sourcePolyline, targetPolyline);

  const hasIntersection = lineSegmentsIntersect || isContourHole;

  return { hasIntersection, isContourHole, isTargetInsideSource };
}

/**
 * Retrieves data for all holes (child annotations) of a given contour segmentation.
 */
export function getContourHolesData(
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
 * Configures `holeAnnotation` to act as a hole within `targetAnnotation`.
 */
export function createPolylineHole(
  viewport: Types.IViewport,
  targetAnnotation: ContourSegmentationAnnotation,
  holeAnnotation: ContourSegmentationAnnotation
): void {
  // Add holeAnnotation as a child to targetAnnotation
  addChildAnnotation(targetAnnotation, holeAnnotation);
  // Remove holeAnnotation from the top-level contour segmentation list
  removeContourSegmentationAnnotation(holeAnnotation);

  const { contour: holeContour } = holeAnnotation.data;
  const holePolylineCanvas = convertContourPolylineToCanvasSpace(
    holeContour.polyline,
    viewport
  );

  // Update the hole's polyline and winding direction
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

  const { element } = viewport;
  updateViewportsForAnnotations(viewport, [targetAnnotation, holeAnnotation]);
}

/**
 * Combines a source polyline with a target polyline. The source-start-point's
 * relation to the target's outer ring drives merge (union) vs subtract (difference).
 * Existing target holes flow through Clipper, so a source that intersects a hole
 * adjusts the hole geometry correctly instead of being silently preserved.
 */
export function combinePolylines(
  viewport: Types.IViewport,
  targetAnnotation: ContourSegmentationAnnotation,
  targetPolyline: Types.Point2[],
  sourceAnnotation: ContourSegmentationAnnotation,
  sourcePolyline: Types.Point2[]
): void {
  if (!hasToolByName(DEFAULT_CONTOUR_SEG_TOOL_NAME)) {
    console.warn(
      `${DEFAULT_CONTOUR_SEG_TOOL_NAME} is not registered in cornerstone. Cannot combine polylines.`
    );
    return;
  }

  const sourceStartPoint = sourcePolyline[0];
  const mergePolylines = math.polyline.containsPoint(
    targetPolyline,
    sourceStartPoint
  );

  const contourHolesData = getContourHolesData(viewport, targetAnnotation);
  const subjects: PolygonWithHoles[] = [
    {
      outer: targetPolyline,
      holes: contourHolesData.length
        ? contourHolesData.map((h) => h.polyline)
        : undefined,
    },
  ];
  const clips: PolygonWithHoles[] = [{ outer: sourcePolyline }];

  const resultPolygons = applyBoolean(
    subjects,
    clips,
    mergePolylines ? BooleanOp.Union : BooleanOp.Difference
  );

  const { element } = viewport;

  // Replace source, target, and all of target's hole annotations with the
  // freshly computed geometry — hole annotations may differ if source intersected them.
  const annotationsToRemove: ContourSegmentationAnnotation[] = [
    sourceAnnotation,
    targetAnnotation,
    ...contourHolesData.map((h) => h.annotation),
  ];
  annotationsToRemove.forEach((annotation) => {
    removeAnnotation(annotation.annotationUID);
    removeContourSegmentationAnnotation(annotation);
  });

  resultPolygons.forEach((polygon) => {
    if (polygon.outer.length < 3) {
      return;
    }
    const parent = createNewAnnotationFromPolyline(
      viewport,
      targetAnnotation,
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
        targetAnnotation,
        holePolyline,
        ContourWindingDirection.CounterClockwise
      );
      addAnnotation(hole, element);
      addChildAnnotation(parent, hole);
      triggerAnnotationModified(hole, element);
    });
  });

  updateViewportsForAnnotations(viewport, [targetAnnotation, sourceAnnotation]);
}

/**
 * Creates a new annotation from a polyline, copying metadata from a template annotation.
 */
export function createNewAnnotationFromPolyline(
  viewport: Types.IViewport,
  templateAnnotation: ContourSegmentationAnnotation,
  polyline: Types.Point2[],
  windingDirection: ContourWindingDirection = ContourWindingDirection.Clockwise
): ContourSegmentationAnnotation {
  const startPointWorld = viewport.canvasToWorld(polyline[0]);
  const endPointWorld = viewport.canvasToWorld(polyline[polyline.length - 1]);

  const newAnnotation: ContourSegmentationAnnotation = {
    metadata: {
      ...templateAnnotation.metadata,
      toolName: DEFAULT_CONTOUR_SEG_TOOL_NAME,
      originalToolName:
        templateAnnotation.metadata.originalToolName ||
        templateAnnotation.metadata.toolName,
    },
    data: {
      cachedStats: {},
      handles: {
        points: [startPointWorld, endPointWorld],
        textBox: templateAnnotation.data.handles.textBox
          ? { ...templateAnnotation.data.handles.textBox }
          : undefined,
      },
      contour: {
        polyline: [],
        closed: true,
      },
      spline: templateAnnotation.data.spline,
      segmentation: {
        ...templateAnnotation.data.segmentation,
      },
    },
    annotationUID: csUtils.uuidv4() as string,
    highlighted: true,
    invalidated: true,
    isLocked: false,
    isVisible: undefined,
    interpolationUID: templateAnnotation.interpolationUID,
    interpolationCompleted: templateAnnotation.interpolationCompleted,
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
 * Updates viewports for multiple annotations.
 */
export function updateViewportsForAnnotations(
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

/**
 * Remove consecutive duplicate points from a polyline
 * @param polyline - Polyline to clean
 * @returns Cleaned polyline without consecutive duplicates
 */
export function removeDuplicatePoints(
  polyline: Types.Point2[]
): Types.Point2[] {
  if (!polyline || polyline.length < 2) {
    return polyline;
  }

  const cleaned: Types.Point2[] = [polyline[0]]; // Always keep the first point

  for (let i = 1; i < polyline.length; i++) {
    const currentPoint = polyline[i];
    const lastPoint = cleaned[cleaned.length - 1];

    // Check if current point is different from the last added point
    const dx = Math.abs(currentPoint[0] - lastPoint[0]);
    const dy = Math.abs(currentPoint[1] - lastPoint[1]);

    if (dx > TOLERANCE || dy > TOLERANCE) {
      cleaned.push(currentPoint);
    }
  }

  return cleaned;
}

/**
 * Helper function to clean up polylines by removing duplicates and invalid polylines
 * @param polylines - Array of polylines to clean up
 * @returns Cleaned array of polylines
 */
export function cleanupPolylines(
  polylines: Types.Point2[][]
): Types.Point2[][] {
  const validPolylines: Types.Point2[][] = [];
  const seenPolylines = new Set<string>();

  for (let polyline of polylines) {
    // Skip invalid polylines
    if (!polyline || polyline.length < 3) {
      continue;
    }

    // Remove consecutive duplicate points
    polyline = removeDuplicatePoints(polyline);

    // Skip if after cleanup it's too small
    if (polyline.length < 3) {
      continue;
    }

    // Create a string representation for duplicate detection
    // Sort points to handle polylines that are the same but start from different points
    const sortedPoints = [...polyline].sort((a, b) => {
      if (a[0] !== b[0]) {
        return a[0] - b[0];
      }
      return a[1] - b[1];
    });
    const polylineKey = sortedPoints
      .map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`)
      .join('|');

    if (!seenPolylines.has(polylineKey)) {
      seenPolylines.add(polylineKey);
      validPolylines.push(polyline);
    }
  }

  return validPolylines;
}
