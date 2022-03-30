// // State
import { state } from '../../store';
import { ToolModes } from '../../enums';

// // Util
import filterToolsWithAnnotationsForElement from '../../store/filterToolsWithAnnotationsForElement';
import getToolsWithModesForMouseEvent from '../shared/getToolsWithModesForMouseEvent';
import triggerAnnotationRender from '../../utilities/triggerAnnotationRender';
import { MouseMoveEventType } from '../../types/EventTypes';

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
  const { element } = eventDetail;

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

  for (const { tool, annotations } of toolsWithAnnotations) {
    if (typeof tool.mouseMoveCallback === 'function') {
      annotationsNeedToBeRedrawn =
        tool.mouseMoveCallback(evt, annotations) || annotationsNeedToBeRedrawn;
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
