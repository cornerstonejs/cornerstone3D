import { eventTarget, triggerEvent, type Types } from '@cornerstonejs/core';
import type { ContourSegmentationAnnotation } from '../../../types/ContourSegmentationAnnotation';
import getViewportsForAnnotation from '../../../utilities/getViewportsForAnnotation';
import type {
  AnnotationCompletedEventType,
  ContourAnnotationCompletedEventDetail,
} from '../../../types/EventTypes';
import type { Annotation } from '../../../types';
import isContourSegmentationAnnotation from '../../../utilities/contourSegmentation/isContourSegmentationAnnotation';
import { getToolGroupForViewport } from '../../../store/ToolGroupManager';
import {
  addContourStroke,
  removeContourStroke,
} from '../../../utilities/contourSegmentation/applyContourStroke';
import { Events } from '../../../enums';

const DEFAULT_CONTOUR_SEG_TOOL_NAME = 'PlanarFreehandContourSegmentationTool';

/**
 * Event listener for ANNOTATION_COMPLETED on a contour-segmentation stroke.
 *
 * Polarity is read from `contourHoleProcessingEnabled` on the event detail:
 * the freehand tool sets it when the configured modifier (default Shift) is
 * held when the stroke starts. Per SEMANTICS.md:
 *   - shift held  → §3.1 REMOVE (always subtract from segment)
 *   - shift unheld → §3.2 ADD    (always union into segment)
 *
 * The polarity does NOT depend on stroke position, overlap with existing
 * contours, or whether the stroke encloses anything. Same-plane same-segment
 * polygons all participate in the boolean op per §5.0.
 */
export default async function contourSegmentationCompletedListener(
  evt: AnnotationCompletedEventType
): Promise<void> {
  const sourceAnnotation = evt.detail
    .annotation as ContourSegmentationAnnotation;

  if (!isContourSegmentationAnnotation(sourceAnnotation)) {
    return;
  }

  const viewport = getViewport(sourceAnnotation);

  const { contourHoleProcessingEnabled = false } =
    evt.detail as ContourAnnotationCompletedEventDetail;

  if (contourHoleProcessingEnabled) {
    removeContourStroke(viewport, sourceAnnotation);
  } else {
    addContourStroke(viewport, sourceAnnotation);
  }

  triggerEvent(eventTarget, Events.ANNOTATION_CUT_MERGE_PROCESS_COMPLETED, {
    element: viewport.element,
    sourceAnnotation,
  });
}

function isFreehandContourSegToolRegisteredForViewport(
  viewport: Types.IViewport,
  silent = false
): boolean {
  const toolName = DEFAULT_CONTOUR_SEG_TOOL_NAME;
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
    errorMessage = `Tool ${toolName} must be in active/passive state in ${toolGroup.id} toolGroup`;
  }

  if (errorMessage && !silent) {
    console.warn(errorMessage);
  }

  return !errorMessage;
}

function getViewport(annotation: Annotation): Types.IViewport {
  const viewports = getViewportsForAnnotation(annotation);
  const viewportWithToolRegistered = viewports.find((viewport) =>
    isFreehandContourSegToolRegisteredForViewport(viewport, true)
  );
  return viewportWithToolRegistered ?? viewports[0];
}
