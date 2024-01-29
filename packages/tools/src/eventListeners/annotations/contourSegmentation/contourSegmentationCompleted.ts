import { glMatrix, vec2, vec3 } from 'gl-matrix';
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
} from '../../../stateManagement/annotation/annotationState';
import { AnnotationCompletedEventType } from '../../../types/EventTypes';
import * as contourUtils from '../../../utilities/contours';
import * as contourSegUtils from '../../../utilities/contourSegmentation';
import { ToolGroupManager, hasTool as cstHasTool } from '../../../store';
import { PlanarFreehandContourSegmentationTool } from '../../../tools';

const DEFAULT_CONTOUR_SEG_TOOLNAME = 'PlanarFreehandContourSegmentationTool';

function debug(annotation: ContourSegmentationAnnotation) {
  const viewport = getViewportForAnnotation(annotation);
  const polyline = convertContourPolylineToCanvasSpace(
    annotation.data.contour.polyline,
    viewport
  );
  const normal = math.polyline.getNormal2(polyline);
  console.log('>>>>> normal:', normal);

  // prettier-ignore
  const rectCW = [[200, 200], [300, 200], [300, 300], [200, 300]];
  const rectCWNormal = math.polyline.getNormal2(rectCW as Types.Point2[]);
  console.log('>>>>> rectCWNormal:', rectCWNormal);
  const rectCWWindingDir = math.polyline.getWindingDirection(
    rectCW as Types.Point2[]
  );
  console.log('>>>>> rectCWWindingDir:', rectCWWindingDir);

  // prettier-ignore
  const rectCCW = [[100, 100], [400, 100], [400, 400], [100, 400]].reverse();
  const rectCCWNormal = math.polyline.getNormal2(rectCCW as Types.Point2[]);
  console.log('>>>>> rectCCWNormal:', rectCCWNormal);
  const rectCCWWindingDir = math.polyline.getWindingDirection(
    rectCCW as Types.Point2[]
  );
  console.log('>>>>> rectCCWWindingDir:', rectCCWWindingDir);
}

export default function contourSegmentationCompletedListener(
  evt: AnnotationCompletedEventType
) {
  // debug(evt.detail.annotation as ContourSegmentationAnnotation);
  // return;

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

  console.log('>>>>> targetAnnotationInfo:', targetAnnotationInfo);
  // return;

  if (isHole) {
    // prettier-ignore
    const targetPolylineTest = [[200, 200], [300, 200], [300, 300], [200, 300]];
    // prettier-ignore
    const sourcePolylineTest = [[100, 100], [400, 100], [400, 400], [100, 400]].reverse();

    createPolylineHole(
      viewport,
      targetAnnotation,
      // targetPolyline,
      targetPolylineTest as Types.Point2[],
      sourceAnnotation,
      // sourcePolyline
      sourcePolylineTest as Types.Point2[]
    );
  } else {
    appendOrRemovePolylines(
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

function doesPolylineContainsPoints(
  polyline: Types.Point2[],
  points: Types.Point2[]
) {
  for (let i = 0, numPoint = points.length; i < numPoint; i++) {
    if (!math.polyline.containsPoint(polyline, points[i])) {
      return false;
    }
  }

  return true;
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
      doesPolylineContainsPoints(targetPolyline, sourcePolyline);

    if (lineSegmentsIntersect || isHole) {
      return { targetAnnotation, targetPolyline, isHole };
    }
  }
}

function createPolylineHole(
  viewport: Types.IViewport,
  targetAnnotation: ContourSegmentationAnnotation,
  targetPolyline: Types.Point2[],
  holeAnnotation: ContourSegmentationAnnotation,
  holePolyline: Types.Point2[]
) {
  const targetPolylineNormal = math.polyline.getNormal2(targetPolyline);
  const holePolylineNormal = math.polyline.getNormal2(holePolyline);
  const dotNormals = vec3.dot(targetPolylineNormal, holePolylineNormal);

  // Check if both normals are pointing to the same direction because the
  // polyline for the hole needs to be in a different direction
  if (glMatrix.equals(1, dotNormals)) {
    holeAnnotation.data.contour.polyline =
      holeAnnotation.data.contour.polyline.reverse();
  }

  targetAnnotation.childrenAnnotationUIDs =
    targetAnnotation.childrenAnnotationUIDs || [];

  // Link both annotations
  targetAnnotation.childrenAnnotationUIDs.push(holeAnnotation.annotationUID);
  holeAnnotation.parentAnnotationUID = targetAnnotation.annotationUID;

  // ---------------------------------------------------------------------------

  const { element } = viewport;
  const enabledElement = getEnabledElement(element);
  const { renderingEngine } = enabledElement;

  // Updating a Spline contours, for example, should also update freehand contours
  const updatedTtoolNames = new Set([
    DEFAULT_CONTOUR_SEG_TOOLNAME,
    targetAnnotation.metadata.toolName,
    holeAnnotation.metadata.toolName,
  ]);

  for (const toolName of updatedTtoolNames.values()) {
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      toolName
    );
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  }
}

function appendOrRemovePolylines(
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
}
