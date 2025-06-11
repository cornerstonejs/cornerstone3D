import { eventTarget, triggerEvent, type Types } from '@cornerstonejs/core';
import type { ContourSegmentationAnnotation } from '../../../types/ContourSegmentationAnnotation';
import getViewportsForAnnotation from '../../../utilities/getViewportsForAnnotation';
import { getAllAnnotations } from '../../../stateManagement/annotation/annotationState';
import type {
  AnnotationCompletedEventType,
  ContourAnnotationCompletedEventDetail,
} from '../../../types/EventTypes';
import type { Annotation } from '../../../types';
import {
  areSameSegment,
  isContourSegmentationAnnotation,
} from '../../../utilities/contourSegmentation';
import { getToolGroupForViewport } from '../../../store/ToolGroupManager';
import { findAllIntersectingContours } from '../../../utilities/contourSegmentation/getIntersectingAnnotations';
import { processMultipleIntersections } from '../../../utilities/contourSegmentation/mergeMultipleAnnotations';
import {
  convertContourPolylineToCanvasSpace,
  createPolylineHole,
  combinePolylines,
} from '../../../utilities/contourSegmentation/sharedOperations';
import { Events } from '../../../enums';

/**
 * Default tool name for contour segmentation operations.
 * This tool is used as the default when creating new combined/subtracted contours.
 */
const DEFAULT_CONTOUR_SEG_TOOL_NAME = 'PlanarFreehandContourSegmentationTool';

/**
 * Event listener for the 'ANNOTATION_COMPLETED' event, specifically for contour segmentations.
 * This function processes a newly completed contour segmentation. If the new contour
 * intersects with existing contour segmentations on the same segment, it will
 * either combine them or use the new contour to create holes in the existing ones.
 * Now supports multiple intersections and merging multiple annotations.
 *
 * @param evt - The event object triggered when an annotation is completed.
 * @returns A promise that resolves when the processing is complete.
 */
export default async function contourSegmentationCompletedListener(
  evt: AnnotationCompletedEventType
): Promise<void> {
  const sourceAnnotation = evt.detail
    .annotation as ContourSegmentationAnnotation;

  // Ensure the completed annotation is a contour segmentation
  if (!isContourSegmentationAnnotation(sourceAnnotation)) {
    return;
  }

  const viewport = getViewport(sourceAnnotation);
  const contourSegmentationAnnotations = getValidContourSegmentationAnnotations(
    viewport,
    sourceAnnotation
  );

  // If no other relevant contour segmentations exist, there's nothing to combine or make a hole in.
  if (!contourSegmentationAnnotations.length) {
    // we trigger the event here as here is the place where the source Annotation is not removed
    triggerEvent(eventTarget, Events.ANNOTATION_CUT_MERGE_PROCESS_COMPLETED, {
      element: viewport.element,
      sourceAnnotation,
    });
    return;
  }

  const sourcePolyline = convertContourPolylineToCanvasSpace(
    sourceAnnotation.data.contour.polyline,
    viewport
  );

  // Find all intersecting contours instead of just one
  const intersectingContours = findAllIntersectingContours(
    viewport,
    sourcePolyline,
    contourSegmentationAnnotations
  );

  // If no intersecting contours are found, do nothing.
  if (!intersectingContours.length) {
    // we trigger the event here as here is the place where the source Annotation is not removed
    triggerEvent(eventTarget, Events.ANNOTATION_CUT_MERGE_PROCESS_COMPLETED, {
      element: viewport.element,
      sourceAnnotation,
    });

    return;
  }

  // Handle multiple intersections
  if (intersectingContours.length > 1) {
    // Process multiple intersections using the new utility
    processMultipleIntersections(
      viewport,
      sourceAnnotation,
      sourcePolyline,
      intersectingContours
    );

    return;
  }

  // Handle single intersection (backward compatibility)
  const { targetAnnotation, targetPolyline, isContourHole } =
    intersectingContours[0];

  if (isContourHole) {
    // Check if hole processing is enabled for this specific event
    const { contourHoleProcessingEnabled = false } =
      evt.detail as ContourAnnotationCompletedEventDetail;

    // Do not create holes when contourHoleProcessingEnabled is `false`
    if (!contourHoleProcessingEnabled) {
      return;
    }

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

/**
 * Checks if the 'PlanarFreehandContourSegmentationTool' is registered and
 * configured (active or passive) for a given viewport.
 *
 * @param viewport - The viewport to check.
 * @param silent - If true, suppresses console warnings. Defaults to false.
 * @returns True if the tool is registered and configured, false otherwise.
 */
function isFreehandContourSegToolRegisteredForViewport(
  viewport: Types.IViewport,
  silent = false
): boolean {
  const toolName = 'PlanarFreehandContourSegmentationTool';

  const toolGroup = getToolGroupForViewport(
    viewport.id,
    viewport.renderingEngineId
  );

  let errorMessage;

  if (!toolGroup) {
    errorMessage = `ToolGroup not found for viewport ${viewport.id}`;
  } else if (!toolGroup.hasTool(toolName)) {
    errorMessage = `Tool ${toolName} not added to ${toolGroup.id} toolGroup`;
  } else if (!toolGroup.getToolOptions(toolName)) {
    // getToolOptions returns undefined if the tool is not active or passive
    errorMessage = `Tool ${toolName} must be in active/passive state in ${toolGroup.id} toolGroup`;
  }

  if (errorMessage && !silent) {
    console.warn(errorMessage);
  }

  return !errorMessage;
}

/**
 * Retrieves a suitable viewport for processing the given annotation.
 * It prioritizes viewports where the 'PlanarFreehandContourSegmentationTool'
 * is registered. If no such viewport is found, it returns the first viewport
 * associated with the annotation. This is because projecting polylines for hole
 * creation might still be possible even if the full tool isn't registered for appending/removing contours.
 *
 * @param annotation - The annotation for which to find a viewport.
 * @returns The most suitable `Types.IViewport` instance, or the first associated viewport.
 */
function getViewport(annotation: Annotation): Types.IViewport {
  const viewports = getViewportsForAnnotation(annotation);
  const viewportWithToolRegistered = viewports.find((viewport) =>
    isFreehandContourSegToolRegisteredForViewport(viewport, true)
  );

  // Returns the first viewport even if freehand contour segmentation is not
  // registered because it can be used to project the polyline to create holes.
  // Another verification is done before appending/removing contours which is
  // possible only when the tool is registered.
  return viewportWithToolRegistered ?? viewports[0];
}

/**
 * Retrieves all valid contour segmentation annotations that are:
 * 1. Not the source annotation itself.
 * 2. Contour segmentation annotations.
 * 3. On the same segment as the source annotation.
 * 4. Viewable in the given viewport (i.e., on the same image plane/slice).
 *
 * @param viewport - The viewport context.
 * @param sourceAnnotation - The source contour segmentation annotation.
 * @returns An array of `ContourSegmentationAnnotation` objects that meet the criteria.
 */
function getValidContourSegmentationAnnotations(
  viewport: Types.IViewport,
  sourceAnnotation: ContourSegmentationAnnotation
): ContourSegmentationAnnotation[] {
  const { annotationUID: sourceAnnotationUID } = sourceAnnotation;

  const allAnnotations = getAllAnnotations();
  return allAnnotations.filter(
    (targetAnnotation) =>
      targetAnnotation.annotationUID &&
      targetAnnotation.annotationUID !== sourceAnnotationUID &&
      isContourSegmentationAnnotation(targetAnnotation) &&
      areSameSegment(
        targetAnnotation as ContourSegmentationAnnotation,
        sourceAnnotation
      ) &&
      viewport.isReferenceViewable(targetAnnotation.metadata) // Checks if annotation is on the same slice/orientation
  ) as ContourSegmentationAnnotation[];
}
