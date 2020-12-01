// State

import {
  // getters,
  state,
  // @ts-ignore
} from './../../store/index.ts';
// import { getToolState } from './../../stateManagement/toolState.js';
// // Util
// import getToolsWithMoveableHandles from '../../store/getToolsWithMoveableHandles.js';
// import { findHandleDataNearImagePoint } from '../../util/findAndMoveHelpers.js';
// import getInteractiveToolsForElement from './../../store/getInteractiveToolsForElement.js';
// import getToolsWithDataForElement from './../../store/getToolsWithDataForElement.js';
// import filterToolsUseableWithMultiPartTools from './../../store/filterToolsUsableWithMultiPartTools.js';

export default function(evt) {
  if (state.isToolLocked) {
    return;
  }

  // const eventData = evt.detail;
  // const element = evt.detail.element;
  // const coords = evt.detail.currentPoints.canvas;

  // // High level filtering
  // const activeAndPassiveTools = getInteractiveToolsForElement(
  //   element,
  //   getters.mouseTools()
  // );

  // // ACTIVE TOOL W/ PRE CALLBACK?
  // // Note: In theory, this should only ever be a single tool.
  // let activeTools = activeAndPassiveTools.filter(
  //   tool =>
  //     tool.mode === 'active' &&
  //     Array.isArray(tool.options.mouseButtonMask) &&
  //     tool.options.mouseButtonMask.includes(eventData.buttons) &&
  //     tool.options.isMouseActive
  // );

  // if (state.isMultiPartToolActive) {
  //   activeTools = filterToolsUseableWithMultiPartTools(activeTools);
  // }

  // // If any tools are active, check if they have a special reason for dealing with the event.
  // if (activeTools.length > 0) {
  //   // TODO: If length > 1, you could assess fitness and select the ideal tool
  //   // TODO: But because we're locking this to 'active' tools, that should rarely be an issue
  //   // Super-Meta-TODO: ^ I think we should just take the approach of one active tool per mouse button?
  //   const firstActiveToolWithCallback = activeTools.find(
  //     tool => typeof tool.preMouseDownCallback === 'function'
  //   );

  //   if (firstActiveToolWithCallback) {
  //     const consumedEvent = firstActiveToolWithCallback.preMouseDownCallback(
  //       evt
  //     );

  //     if (consumedEvent) {
  //       return;
  //     }
  //   }
  // }

  // if (state.isMultiPartToolActive) {
  //   // Don't fire events to Annotation Tools during a multi part loop.
  //   return;
  // }

  // // Annotation tool specific
  // const annotationTools = getToolsWithDataForElement(
  //   element,
  //   activeAndPassiveTools
  // );

  // // NEAR HANDLES?
  // const annotationToolsWithMoveableHandles = getToolsWithMoveableHandles(
  //   element,
  //   annotationTools,
  //   coords,
  //   'mouse'
  // );

  // if (annotationToolsWithMoveableHandles.length > 0) {
  //   const firstToolWithMoveableHandles = annotationToolsWithMoveableHandles[0];
  //   const toolState = getToolState(element, firstToolWithMoveableHandles.name);

  //   const { handle, data } = findHandleDataNearImagePoint(
  //     element,
  //     toolState,
  //     firstToolWithMoveableHandles.name,
  //     coords
  //   );

  //   firstToolWithMoveableHandles.handleSelectedCallback(
  //     evt,
  //     data,
  //     handle,
  //     'mouse'
  //   );

  //   return;
  // }

  // // NEAR TOOL?
  // const annotationToolsWithPointNearClick = activeAndPassiveTools.filter(
  //   tool => {
  //     const toolState = getToolState(element, tool.name);
  //     const isNearPoint =
  //       toolState &&
  //       toolState.data &&
  //       tool.pointNearTool &&
  //       toolState.data.some(data =>
  //         tool.pointNearTool(element, data, coords, 'mouse')
  //       );

  //     return isNearPoint;
  //   }
  // );

  // if (annotationToolsWithPointNearClick.length > 0) {
  //   const firstToolNearPoint = annotationToolsWithPointNearClick[0];
  //   const toolState = getToolState(element, firstToolNearPoint.name);
  //   const firstAnnotationNearPoint = toolState.data.find(data =>
  //     firstToolNearPoint.pointNearTool(element, data, coords)
  //   );

  //   firstToolNearPoint.toolSelectedCallback(
  //     evt,
  //     firstAnnotationNearPoint,
  //     'mouse'
  //   );

  //   return;
  // }

  // // ACTIVE TOOL W/ POST CALLBACK?
  // // If any tools are active, check if they have a special reason for dealing with the event.
  // if (activeTools.length > 0) {
  //   // TODO: If length > 1, you could assess fitness and select the ideal tool
  //   // TODO: But because we're locking this to 'active' tools, that should rarely be an issue
  //   // Super-Meta-TODO: ^ I think we should just take the approach of one active tool per mouse button?
  //   const firstActiveToolWithCallback = activeTools.find(
  //     tool => typeof tool.postMouseDownCallback === 'function'
  //   );

  //   if (firstActiveToolWithCallback) {
  //     const consumedEvent = firstActiveToolWithCallback.postMouseDownCallback(
  //       evt
  //     );

  //     if (consumedEvent) {
  //       return;
  //     }
  //   }
  // }
}
