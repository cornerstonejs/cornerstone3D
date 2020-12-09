// State
import {
  // getters,
  state,
  ToolGroupManager,
} from './../../store/index';
// import { getToolState } from './../../stateManagement/toolState.js';

import { ToolBindings, ToolModes } from './../../enums/index';

// // Util
import getToolsWithMoveableHandles from '../../store/getToolsWithMoveableHandles';
// import { findHandleDataNearImagePoint } from '../../util/findAndMoveHelpers.js';
// import getInteractiveToolsForElement from './../../store/getInteractiveToolsForElement.js';
import getToolsWithDataForElement from '../../store/getToolsWithDataForElement';

const { Active, Passive } = ToolModes;
// import filterToolsUseableWithMultiPartTools from './../../store/filterToolsUsableWithMultiPartTools.js';

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

  let activeAndPassiveTools = [];
  let activeTool;
  let foundActiveTool = false;

  for (let i = 0; i < toolGroups.length; i++) {
    const toolGroup = toolGroups[i];
    const toolGroupToolNames = Object.keys(toolGroup.tools);

    for (let j = 0; j < toolGroupToolNames.length; j++) {
      const toolName = toolGroupToolNames[j];
      const tool = toolGroup.tools[toolName];

      if (
        !foundActiveTool &&
        tool.mode === Active &&
        tool.bindings.includes(mouseEvent.buttons)
      ) {
        // This should be behind some API. Too much knowledge of ToolGroup
        // inner workings leaking out

        activeTool = toolGroup._tools[toolName];
        foundActiveTool = true;
        activeAndPassiveTools.push(activeTool);
      } else if (tool.mode === Passive || tool.mode === Active) {
        const toolInstance = toolGroup._tools[toolName];
        activeAndPassiveTools.push(toolInstance);
      }
    }
  }

  // TODO -> multiPartTools => If activeTool is not usable with the multi-part tool, just bail.

  // Check for preMouseDownCallbacks
  if (activeTool && typeof activeTool.preMouseDownCallback === 'function') {
    const consumedEvent = activeTool.preMouseDownCallback(evt);

    if (consumedEvent) {
      // If the tool claims it consumed the event, prevent further checks.
      return;
    }
  }

  const eventData = evt.detail;
  const { element } = eventData;

  // Annotation tool specific
  const annotationTools = getToolsWithDataForElement(
    element,
    activeAndPassiveTools
  );

  const canvasCoords = eventData.currentPoints.canvas;

  // NEAR HANDLES? // TODO It feels like we'll need picking at some point, right now doing as cornerstoneTools does:
  // The first tool found that says it can be moved gets moved.
  // TODO -> We need to make sure the mouse over highlighting correctly reflects this.
  const annotationToolsWithMoveableHandles = getToolsWithMoveableHandles(
    element,
    annotationTools,
    canvasCoords,
    'mouse'
  );

  if (annotationToolsWithMoveableHandles.length > 0) {
    // Choose first tool for now.
    const { tool, toolData, handle } = annotationToolsWithMoveableHandles[0];

    tool.handleSelectedCallback(evt, toolData, handle, 'mouse');

    return;
  }
  /*

  // NEAR TOOL?
  const annotationToolsWithPointNearClick = activeAndPassiveTools.filter(
    tool => {
      const toolState = getToolState(element, tool.name);
      const isNearPoint =
        toolState &&
        toolState.data &&
        tool.pointNearTool &&
        toolState.data.some(data =>
          tool.pointNearTool(element, data, coords, 'mouse')
        );

      return isNearPoint;
    }
  );

  if (annotationToolsWithPointNearClick.length > 0) {
    const firstToolNearPoint = annotationToolsWithPointNearClick[0];
    const toolState = getToolState(element, firstToolNearPoint.name);
    const firstAnnotationNearPoint = toolState.data.find(data =>
      firstToolNearPoint.pointNearTool(element, data, coords)
    );

    firstToolNearPoint.toolSelectedCallback(
      evt,
      firstAnnotationNearPoint,
      'mouse'
    );

    return;
  }
  */

  if (activeTool && typeof activeTool.postMouseDownCallback === 'function') {
    const consumedEvent = activeTool.postMouseDownCallback(evt);

    if (consumedEvent) {
      // If the tool claims it consumed the event, prevent further checks.
      return;
    }
  }

  // // ACTIVE TOOL W/ POST CALLBACK?
  // // If any tools are active, check if they have a special reason for dealing with the event.
}
