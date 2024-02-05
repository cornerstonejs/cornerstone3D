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
  getChildAnnotations,
  addChildAnnotation,
} from '../../../stateManagement/annotation/annotationState';
import {
  AnnotationCompletedEventType,
  ContourAnnotationCompletedEventDetail,
} from '../../../types/EventTypes';
import * as contourUtils from '../../../utilities/contours';
import * as contourSegUtils from '../../../utilities/contourSegmentation';
import { ToolGroupManager, hasTool as cstHasTool } from '../../../store';
import { PlanarFreehandContourSegmentationTool } from '../../../tools';
import {
  ContourAnnotation,
  ContourWindingDirection,
} from '../../../types/ContourAnnotation';

const DEFAULT_CONTOUR_SEG_TOOLNAME = 'PlanarFreehandContourSegmentationTool';

export default function contourSegmentationCompletedListener(
  evt: AnnotationCompletedEventType
) {
  const { postProcessingEnabled } =
    evt.detail as ContourAnnotationCompletedEventDetail;

  // Do not append, remove or create holes when postProcessingEnabled is `false`
  if (!postProcessingEnabled) {
    return;
  }

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

  const { targetAnnotation, targetPolyline, isHole } = targetAnnotationInfo;

  if (isHole) {
    createPolylineHole(viewport, targetAnnotation, sourceAnnotation);
  } else {
    combinePolylines(
      viewport,
      targetAnnotation,
      targetPolyline,
      sourceAnnotation,
      sourcePolyline
    );
  }
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

function getValidContourSegmentationAnnotations(
  sourceAnnotation: ContourSegmentationAnnotation
): ContourSegmentationAnnotation[] {
  const { annotationUID: sourceAnnotationUID } = sourceAnnotation;
  const { FrameOfReferenceUID } = sourceAnnotation.metadata;

  // Get all annotations and filter all contour segmentations locally
  const toolName = undefined;
  const annotationsGroups = getAnnotations(toolName, FrameOfReferenceUID);
  const toolNames = Object.keys(annotationsGroups);

  return toolNames.reduce((validAnnotations, toolName) => {
    const toolAnnotations = annotationsGroups[toolName].filter(
      (targetAnnotation) =>
        targetAnnotation.annotationUID &&
        targetAnnotation.annotationUID !== sourceAnnotationUID &&
        contourSegUtils.isContourSegmentationAnnotation(targetAnnotation) &&
        contourSegUtils.areSameSegment(targetAnnotation, sourceAnnotation) &&
        contourUtils.areCoplanarContours(targetAnnotation, sourceAnnotation)
    );

    return validAnnotations.concat(toolAnnotations);
  }, []);
}

function findIntersectingContour(
  viewport: Types.IViewport,
  sourcePolyline: Types.Point2[],
  contourSegmentationAnnotations: ContourSegmentationAnnotation[]
): {
  targetAnnotation: ContourSegmentationAnnotation;
  targetPolyline: Types.Point2[];
  isHole: boolean;
} {
  const sourceAABB = math.polyline.getAABB(sourcePolyline);

  for (let i = 0; i < contourSegmentationAnnotations.length; i++) {
    const targetAnnotation = contourSegmentationAnnotations[i];
    const targetPolyline = convertContourPolylineToCanvasSpace(
      targetAnnotation.data.contour.polyline,
      viewport
    );

    const targetAABB = math.polyline.getAABB(targetPolyline);
    const aabbIntersect = math.aabb.intersectAABB(sourceAABB, targetAABB);
    const lineSegmentsIntersect =
      aabbIntersect &&
      math.polyline.intersectPolyline(sourcePolyline, targetPolyline);
    const isHole =
      aabbIntersect &&
      !lineSegmentsIntersect &&
      math.polyline.containsPoints(targetPolyline, sourcePolyline);

    if (lineSegmentsIntersect || isHole) {
      return { targetAnnotation, targetPolyline, isHole };
    }
  }
}

function createPolylineHole(
  viewport: Types.IViewport,
  targetAnnotation: ContourSegmentationAnnotation,
  holeAnnotation: ContourSegmentationAnnotation
) {
  const { windingDirection: targetWindingDirection } =
    targetAnnotation.data.contour;
  const { windingDirection: holeWindingDirection } =
    holeAnnotation.data.contour;

  // Check if both normals are pointing to the same direction because the
  // polyline for the hole needs to be in a different direction
  // if (glMatrix.equals(1, dotNormals)) {
  if (targetWindingDirection === holeWindingDirection) {
    holeAnnotation.data.contour.polyline.reverse();
    holeAnnotation.data.contour.windingDirection = targetWindingDirection * -1;
  }

  addChildAnnotation(targetAnnotation, holeAnnotation);

  const { element } = viewport;
  const enabledElement = getEnabledElement(element);
  const { renderingEngine } = enabledElement;

  // Updating a Spline contours, for example, should also update freehand contours
  const updatedToolNames = new Set([
    DEFAULT_CONTOUR_SEG_TOOLNAME,
    targetAnnotation.metadata.toolName,
    holeAnnotation.metadata.toolName,
  ]);

  for (const toolName of updatedToolNames.values()) {
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      toolName
    );
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  }
}

function getContourHolesData(
  viewport: Types.IViewport,
  annotation: ContourAnnotation
) {
  return getChildAnnotations(annotation).map((holeAnnotation) => {
    const polyline = convertContourPolylineToCanvasSpace(
      holeAnnotation.data.contour.polyline,
      viewport
    );

    return { annotation: holeAnnotation, polyline };
  });
}

function combinePolylines(
  viewport: Types.IViewport,
  targetAnnotation: ContourSegmentationAnnotation,
  targetPolyline: Types.Point2[],
  sourceAnnotation: ContourSegmentationAnnotation,
  sourcePolyline: Types.Point2[]
) {
  const sourceStartPoint = sourcePolyline[0];
  const mergePolylines = math.polyline.containsPoint(
    targetPolyline,
    sourceStartPoint
  );

  const contourHolesData = getContourHolesData(viewport, targetAnnotation);
  const unassignedContourHolesSet = new Set(contourHolesData);
  const reassignedContourHolesMap = new Map();
  const assignHoleToPolyline = (parentPolyline, holeData) => {
    let holes = reassignedContourHolesMap.get(parentPolyline);

    if (!holes) {
      holes = [];
      reassignedContourHolesMap.set(parentPolyline, holes);
    }

    holes.push(holeData);
    unassignedContourHolesSet.delete(holeData);
  };
  const newPolylines = [];

  if (mergePolylines) {
    const mergedPolyline = math.polyline.mergePolylines(
      targetPolyline,
      sourcePolyline
    );

    newPolylines.push(mergedPolyline);

    // Keep all holes because the contour can only grow when merging
    Array.from(unassignedContourHolesSet.keys()).forEach((holeData) =>
      assignHoleToPolyline(mergedPolyline, holeData)
    );
  } else {
    const subtractedPolylines = math.polyline.subtractPolylines(
      targetPolyline,
      sourcePolyline
    );

    subtractedPolylines.forEach((newPolyline) => {
      newPolylines.push(newPolyline);

      Array.from(unassignedContourHolesSet.keys()).forEach((holeData) => {
        const containsHole = math.polyline.containsPoints(
          newPolyline,
          holeData.polyline
        );

        if (containsHole) {
          assignHoleToPolyline(newPolyline, holeData);
          unassignedContourHolesSet.delete(holeData);
        }
      });
    });
  }

  const { element } = viewport;
  const enabledElement = getEnabledElement(element);
  const { renderingEngine } = enabledElement;
  const { metadata, data } = targetAnnotation;
  const { handles, segmentation } = data;
  const { textBox } = handles;

  for (let i = 0; i < newPolylines.length; i++) {
    const polyline = newPolylines[i];
    const startPoint = viewport.canvasToWorld(polyline[0]);
    const endPoint = viewport.canvasToWorld(polyline[polyline.length - 1]);
    const newAnnotation: ContourAnnotation = {
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
          polyline: [],
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

    // Calling `updateContourPolyline` method instead of setting it locally
    // because it is also responsible for checking/setting the winding direction.
    contourUtils.updateContourPolyline(
      newAnnotation,
      {
        points: polyline,
        closed: true,
        targetWindingDirection: ContourWindingDirection.Clockwise,
      },
      viewport
    );
    addAnnotation(newAnnotation, element);

    reassignedContourHolesMap
      .get(polyline)
      ?.forEach((holeData) =>
        addChildAnnotation(newAnnotation, holeData.annotation)
      );

    // Updating a Spline contours, for example, should also update freehand contours
    const updatedTtoolNames = new Set([
      DEFAULT_CONTOUR_SEG_TOOLNAME,
      targetAnnotation.metadata.toolName,
      sourceAnnotation.metadata.toolName,
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

  removeAnnotation(sourceAnnotation.annotationUID);
  removeAnnotation(targetAnnotation.annotationUID);
}
