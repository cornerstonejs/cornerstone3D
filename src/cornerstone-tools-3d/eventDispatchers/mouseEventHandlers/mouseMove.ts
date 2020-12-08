// // State
import { state, ToolGroupManager } from './../../store/index';
import { ToolModes } from './../../enums/index';
import { getEnabledElement } from '../../../index';

// // Util
import getToolsWithDataForElement from '../../store/getToolsWithDataForElement';

const { Active, Passive } = ToolModes;

/**
 * This is mostly used to update the [un]hover state
 * of a tool.
 */
export default function(evt) {
  if (state.isToolLocked || state.isMultiPartToolActive) {
    return;
  }

  const eventData = evt.detail;
  const { renderingEngineUID, sceneUID, viewportUID, element } = eventData;

  const toolGroups = ToolGroupManager.getToolGroups(
    renderingEngineUID,
    sceneUID,
    viewportUID
  );

  let activeAndPassiveTools = [];

  for (let i = 0; i < toolGroups.length; i++) {
    const toolGroup = toolGroups[i];
    const toolGroupToolNames = Object.keys(toolGroup.tools);

    for (let j = 0; j < toolGroupToolNames.length; j++) {
      const toolName = toolGroupToolNames[j];
      const tool = toolGroup.tools[toolName];

      if (tool.mode === Passive || tool.mode === Active) {
        const toolInstance = toolGroup._tools[toolName];
        activeAndPassiveTools.push(toolInstance);
      }
    }
  }

  // Annotation tool specific
  const annotationTools = getToolsWithDataForElement(
    element,
    activeAndPassiveTools
  );

  const numAnnotationTools = annotationTools.length;
  let imageNeedsUpdate = false;

  for (let t = 0; t < numAnnotationTools; t++) {
    const { tool, toolState } = annotationTools[t];
    if (typeof tool.mouseMoveCallback === 'function') {
      imageNeedsUpdate =
        tool.mouseMoveCallback(evt, toolState) || imageNeedsUpdate;
    }
  }
  // Tool data activation status changed, redraw the image
  if (imageNeedsUpdate === true) {
    const enabledElement = getEnabledElement(element);

    const { viewport } = enabledElement;

    viewport.render();
  }
}
