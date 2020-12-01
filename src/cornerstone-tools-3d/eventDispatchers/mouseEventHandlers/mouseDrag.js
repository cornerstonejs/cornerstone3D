import ICornerstoneMouseEvent from './../../ICornerstoneMouseEvent.ts';
import { ToolBindings, ToolModes } from './../../enums/index';
import {
  // getters,
  state,
  ToolGroupManager,
} from './../../store/index.ts';

export default function(evt) {
  if (state.isToolLocked) {
    return;
  }

  const { renderingEngineUID, sceneUID, viewportUID } = evt.detail;
  const mouseEvent = evt.detail.event;
  const toolGroups = ToolGroupManager.getToolGroups(
    renderingEngineUID,
    sceneUID,
    viewportUID
  );

  /**
   * Iterate tool group tools until we find a tool that has a "ToolBinding"
   * that matches our MouseEvent's `buttons`. It's possible there will be
   * no match (no active tool for that mouse button combination).
   */
  let foundTool;
  for (let i = 0; i < toolGroups.length; i++) {
    const toolGroup = toolGroups[i];
    const toolGroupToolNames = Object.keys(toolGroup.tools);

    for (let j = 0; j < toolGroupToolNames.length; j++) {
      const toolName = toolGroupToolNames[j];
      const tool = toolGroup.tools[toolName];
      if (tool.bindings.includes(mouseEvent.buttons)) {
        // This should be behind some API. Too much knowledge of ToolGroup
        // inner workings leaking out
        foundTool = toolGroup._tools[toolName];
        break;
      }
    }

    if (foundTool) {
      break;
    }
  }

  const noFoundToolOrDoesNotHaveMouseDragCallback =
    !foundTool || typeof foundTool.mouseDragCallback !== 'function';
  if (noFoundToolOrDoesNotHaveMouseDragCallback) {
    return;
  }

  foundTool.mouseDragCallback(evt);
}
