import {
  getEnabledElement,
  utilities as csUtils,
  Types,
} from '@cornerstonejs/core';
import { ContourSegmentationAnnotation } from '../../../types/ContourSegmentationAnnotation';
import {
  getViewportForAnnotation,
  math,
  triggerAnnotationRenderForViewportIds,
} from '../../../utilities';
import { getViewportIdsWithToolToRender } from '../../../utilities/viewportFilters';
import {
  getAnnotations,
  addAnnotation,
  removeAnnotation,
  getAllAnnotations,
} from '../../../stateManagement/annotation/annotationState';
import { AnnotationCompletedEventType } from '../../../types/EventTypes';
import * as contourUtils from '../../../utilities/contours';
import * as contourSegUtils from '../../../utilities/contourSegmentation';
import { ToolGroupManager, hasTool as cstHasTool } from '../../../store';
import { PlanarFreehandContourSegmentationTool } from '../../../tools';

const DEFAULT_CONTOUR_SEG_TOOLNAME = 'PlanarFreehandContourSegmentationTool';

export default function contourSegmentationCompletedListener(
  evt: AnnotationCompletedEventType
) {
  const sourceAnnotation = evt.detail
    .annotation as ContourSegmentationAnnotation;

  if (!contourSegUtils.isContourSegmentationAnnotation(sourceAnnotation)) {
    return;
  }

  const viewport = getViewportForAnnotation(sourceAnnotation);
  const contourSegmentationAnnotations =
    getValidContourSegmentationAnnotations(sourceAnnotation);

  if (!contourSegmentationAnnotations.length) {
    return;
  }

  const sourcePolyline = convertContourPolylineToCanvasSpace(
    sourceAnnotation.data.contour.polyline,
    viewport
  );

  const targetAnnotationInfo = findIntersectingContour(
    viewport,
    sourcePolyline,
    contourSegmentationAnnotations
  );

  if (!targetAnnotationInfo) {
    return;
  }

  if (!isFreehandContourSegToolRegistered(viewport)) {
    return;
  }

  const { targetAnnotation, targetPolyline } = targetAnnotationInfo;

  processContours(
    viewport,
    sourceAnnotation,
    sourcePolyline,
    targetAnnotation,
    targetPolyline
  );
}

function isFreehandContourSegToolRegistered(viewport: Types.IViewport) {
  const { toolName } = PlanarFreehandContourSegmentationTool;

  if (!cstHasTool(PlanarFreehandContourSegmentationTool)) {
    console.warn(`${toolName} is not registered in cornerstone`);
    return false;
  }

  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewport.id,
    viewport.renderingEngineId
  );

  if (!toolGroup.hasTool(toolName)) {
    console.warn(`Tool ${toolName} not added to ${toolGroup.id} toolGroup`);
    return false;
  }

  if (!toolGroup.getToolOptions(toolName)) {
    console.warn(`Tool ${toolName} must be in active/passive state`);
    return false;
  }

  return true;
}

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

function convertPolylineToWorldSpace(
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

function getValidContourSegmentationAnnotations(
  sourceAnnotation: ContourSegmentationAnnotation
): ContourSegmentationAnnotation[] {
  const { annotationUID: sourceAnnotationUID } = sourceAnnotation;

  // Get all annotations and filter all contour segmentations locally
  const allAnnotations = getAllAnnotations();

  return allAnnotations.filter(
    (targetAnnotation) =>
      targetAnnotation.annotationUID &&
      targetAnnotation.annotationUID !== sourceAnnotationUID &&
      contourSegUtils.isContourSegmentationAnnotation(targetAnnotation) &&
      contourSegUtils.areSameSegment(targetAnnotation, sourceAnnotation) &&
      contourUtils.areCoplanarContours(targetAnnotation, sourceAnnotation)
  ) as ContourSegmentationAnnotation[];
}

function findIntersectingContour(
  viewport: Types.IViewport,
  sourcePolyline: Types.Point2[],
  contourSegmentationAnnotations: ContourSegmentationAnnotation[]
): {
  targetAnnotation: ContourSegmentationAnnotation;
  targetPolyline: Types.Point2[];
} {
  const sourceAABB = math.polyline.getAABB(sourcePolyline);

  for (let i = 0; i < contourSegmentationAnnotations.length; i++) {
    const targetAnnotation = contourSegmentationAnnotations[i];
    const targetPolyline = convertContourPolylineToCanvasSpace(
      targetAnnotation.data.contour.polyline,
      viewport
    );

    const targetAABB = math.polyline.getAABB(targetPolyline);
    const polylinesIntersect =
      math.aabb.intersectAABB(sourceAABB, targetAABB) &&
      math.polyline.intersectPolyline(sourcePolyline, targetPolyline);

    if (polylinesIntersect) {
      return { targetAnnotation, targetPolyline };
    }
  }
}

function processContours(
  viewport: Types.IViewport,
  sourceAnnotation: ContourSegmentationAnnotation,
  sourcePolyline: Types.Point2[],
  targetAnnotation: ContourSegmentationAnnotation,
  targetPolyline: Types.Point2[]
) {
  const sourceStartPoint = sourcePolyline[0];
  const mergePolylines = math.polyline.containsPoint(
    targetPolyline,
    sourceStartPoint
  );

  const newPolylines = [];

  if (mergePolylines) {
    const mergedPolyline = math.polyline.mergePolylines(
      targetPolyline,
      sourcePolyline
    );

    newPolylines.push(mergedPolyline);
  } else {
    const subtractedPolylines = math.polyline.subtractPolylines(
      targetPolyline,
      sourcePolyline
    );

    subtractedPolylines.forEach((newPolyline) =>
      newPolylines.push(newPolyline)
    );
  }

  removeAnnotation(sourceAnnotation.annotationUID);
  removeAnnotation(targetAnnotation.annotationUID);

  const { element } = viewport;
  const enabledElement = getEnabledElement(element);
  const { renderingEngine } = enabledElement;
  const { metadata, data } = targetAnnotation;
  const { handles, segmentation } = data;
  const { textBox } = handles;

  for (let i = 0; i < newPolylines.length; i++) {
    const polyline = convertPolylineToWorldSpace(newPolylines[i], viewport);
    const startPoint = polyline[0];
    const endPoint = polyline[polyline.length - 1];
    const newAnnotation = {
      metadata: {
        ...metadata,
        toolName: DEFAULT_CONTOUR_SEG_TOOLNAME,
      },
      data: {
        cachedStats: {},
        handles: {
          points: [startPoint, endPoint],
          textBox: textBox ? { ...textBox } : undefined,
        },
        contour: {
          polyline,
          closed: true,
        },
        segmentation: {
          ...segmentation,
        },
      },
      annotationUID: csUtils.uuidv4() as string,
      highlighted: true,
      invalidated: true,
      isLocked: false,
      isVisible: undefined,
    };

    addAnnotation(newAnnotation, element);

    // Updating a Spline contours, for example, should also update freehand contours
    const updatedTtoolNames = new Set([
      DEFAULT_CONTOUR_SEG_TOOLNAME,
      targetAnnotation.metadata.toolName,
    ]);

    for (const toolName of updatedTtoolNames.values()) {
      const viewportIdsToRender = getViewportIdsWithToolToRender(
        element,
        toolName
      );
      triggerAnnotationRenderForViewportIds(
        renderingEngine,
        viewportIdsToRender
      );
    }
  }
}
