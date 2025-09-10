// // State
import { state } from '../../store/state';
import { ToolModes } from '../../enums';

// // Util
import filterToolsWithAnnotationsForElement from '../../store/filterToolsWithAnnotationsForElement';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import getToolsWithModesForMouseEvent from '../shared/getToolsWithModesForMouseEvent';
import triggerAnnotationRender from '../../utilities/triggerAnnotationRender';
import type { MouseMoveEventType } from '../../types/EventTypes';
import { setCursorForElement } from '../../cursors';
import { getStyleProperty } from '../../stateManagement/annotation/config/helpers';
import type { StyleSpecifier } from '../../types/AnnotationStyle';

const { Active, Passive } = ToolModes;

/**
 * mouseMove - On mouse move when not dragging, fire tools `mouseMoveCallback`s.
 * This is mostly used to update the [un]hover state
 * of a tool.
 *
 * @param evt - The normalized mouseDown event.
 */
export default function mouseMove(evt: MouseMoveEventType) {
  // Tool interactions when mouse moved are handled inside each tool.
  // This function is mostly used to update the [un]hover state
  if (state.isInteractingWithTool || state.isMultiPartToolActive) {
    return;
  }

  const activeAndPassiveTools = getToolsWithModesForMouseEvent(evt, [
    Active,
    Passive,
  ]);

  const eventDetail = evt.detail;
  const { element, currentPoints, renderingEngineId, viewportId } = eventDetail;

  // Annotation tool specific
  const toolsWithAnnotations = filterToolsWithAnnotationsForElement(
    element,
    activeAndPassiveTools
  );

  const toolsWithoutAnnotations = activeAndPassiveTools.filter((tool) => {
    const doesNotHaveAnnotations = !toolsWithAnnotations.some(
      (toolAndAnnotation) =>
        toolAndAnnotation.tool.getToolName() === tool.getToolName()
    );

    return doesNotHaveAnnotations;
  });

  let annotationsNeedToBeRedrawn = false;
  let showCrosshairsCursor = false;

  for (const { tool, annotations } of toolsWithAnnotations) {
    if (typeof tool.mouseMoveCallback === 'function') {
      annotationsNeedToBeRedrawn =
        tool.mouseMoveCallback(evt, annotations) || annotationsNeedToBeRedrawn;

      for (const annotation of annotations) {
        showCrosshairsCursor =
          !!tool.getHandleNearImagePoint(
            element,
            annotation,
            currentPoints.canvas,
            6
          ) || showCrosshairsCursor;
      }
    }
  }

  const showHandlesAlways = Boolean(
    getStyleProperty('showHandlesAlways', {} as StyleSpecifier)
  );

  if (showCrosshairsCursor && showHandlesAlways) {
    setCursorForElement(element, 'move');
  } else {
    const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);
    const activeTool = toolGroup?.getActivePrimaryMouseButtonTool();
    if (activeTool) {
      setCursorForElement(element, activeTool);
    } else {
      setCursorForElement(element, 'default');
    }
  }

  // Run mouse move handlers for non-annotation tools
  toolsWithoutAnnotations.forEach((tool) => {
    if (typeof tool.mouseMoveCallback === 'function') {
      tool.mouseMoveCallback(evt);
    }
  });

  // Annotation activation status changed, redraw the annotations
  if (annotationsNeedToBeRedrawn === true) {
    triggerAnnotationRender(element);
  }
}
