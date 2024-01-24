import {
  getEnabledElement,
  utilities as csUtils,
  Types,
  getRenderingEngine,
} from '@cornerstonejs/core';
import { ContourSegmentationAnnotation } from '../../../types/ContourSegmentationAnnotation';
import {
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
import {
  areCoplanarContours,
  isContourSegmentationAnnotation,
  areContoursFromSameSegmentIndex,
} from '.';

const DEFAULT_CONTOUR_SEG_TOOLNAME = 'PlanarFreehandContourSegmentationTool';

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
        isContourSegmentationAnnotation(targetAnnotation) &&
        areContoursFromSameSegmentIndex(targetAnnotation, sourceAnnotation) &&
        areCoplanarContours(targetAnnotation, sourceAnnotation)
    );

    return validAnnotations.concat(toolAnnotations);
  }, []);
}

function getTargetAnnotation(
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
    const targetPolyline = targetAnnotation.data.contour.polyline.map((point) =>
      viewport.worldToCanvas(point)
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

  newPolylines.forEach((newPolyline) => {
    const polyline = newPolyline.map((p) => viewport.canvasToWorld(p));
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
  });
}

export default function contourSegmentationCompletedListener(
  evt: AnnotationCompletedEventType
) {
  const sourceAnnotation = evt.detail
    .annotation as ContourSegmentationAnnotation;
  const { renderingEngineId, viewportId } = evt.detail;
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = renderingEngine.getViewport(viewportId);

  if (!isContourSegmentationAnnotation(sourceAnnotation)) {
    return;
  }

  const contourSegmentationAnnotations =
    getValidContourSegmentationAnnotations(sourceAnnotation);

  if (!contourSegmentationAnnotations.length) {
    return;
  }

  const sourcePolyline = sourceAnnotation.data.contour.polyline.map((point) =>
    viewport.worldToCanvas(point)
  );

  const targetAnnotationInfo = getTargetAnnotation(
    viewport,
    sourcePolyline,
    contourSegmentationAnnotations
  );

  if (!targetAnnotationInfo) {
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
