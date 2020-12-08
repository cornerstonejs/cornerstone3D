import addNewMeasurement from './addNewMeasurement';
import {
  // getters,
  state,
  ToolGroupManager,
} from './../../store/index';
import { BaseAnnotationTool } from './../../tools/base';

// import getActiveTool from '../../util/getActiveTool';

export default function(evt) {
  console.log('mouseDownActivate');
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

  // TODO refactor to getActiveTool
  let activeTool;
  for (let i = 0; i < toolGroups.length; i++) {
    const toolGroup = toolGroups[i];
    const toolGroupToolNames = Object.keys(toolGroup.tools);

    for (let j = 0; j < toolGroupToolNames.length; j++) {
      const toolName = toolGroupToolNames[j];
      const tool = toolGroup.tools[toolName];
      if (tool.bindings.includes(mouseEvent.buttons)) {
        // This should be behind some API. Too much knowledge of ToolGroup
        // inner workings leaking out
        activeTool = toolGroup._tools[toolName];
        break;
      }
    }

    if (activeTool) {
      break;
    }
  }

  if (!activeTool) {
    return;
  }

  // TODO: I've never seen us use this in cornerstoneTools
  // What can this do that preMouseDown can't, or that you can't just do in your addMeasurement call?
  if (typeof activeTool.preMouseDownActivateCallback === 'function') {
    const consumedEvent = activeTool.preMouseDownActivateCallback(evt);

    if (consumedEvent) {
      // If the tool claims it consumed the event, prevent further checks.
      return;
    }
  }

  if (state.isMultiPartToolActive) {
    return;
  }

  // Note: custom `addNewMeasurement` will need to prevent event bubbling
  if (activeTool.addNewMeasurement) {
    activeTool.addNewMeasurement(evt, 'mouse');
  } else if (activeTool instanceof BaseAnnotationTool) {
    addNewMeasurement(evt, activeTool);
  }
}
