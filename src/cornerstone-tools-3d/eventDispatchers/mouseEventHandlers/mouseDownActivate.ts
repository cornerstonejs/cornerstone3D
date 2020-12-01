// import addNewMeasurement from './addNewMeasurement.js';
// @ts-ignore
import { state } from './../../store/index.ts';
// import BaseAnnotationTool from './../../tools/base/BaseAnnotationTool.js';
// import getActiveTool from '../../util/getActiveTool';

export default function(evt) {
  if (state.isToolLocked) {
    return;
  }

  // const { element, buttons } = evt.detail;
  // const activeTool = getActiveTool(element, buttons, 'mouse');

  // if (!activeTool) {
  //   return;
  // }

  // if (typeof activeTool.preMouseDownActivateCallback === 'function') {
  //   const consumedEvent = activeTool.preMouseDownActivateCallback(evt);

  //   if (consumedEvent) {
  //     return;
  //   }
  // }

  // if (state.isMultiPartToolActive) {
  //   return;
  // }

  // // Note: custom `addNewMeasurement` will need to prevent event bubbling
  // if (activeTool.addNewMeasurement) {
  //   activeTool.addNewMeasurement(evt, 'mouse');
  // } else if (activeTool instanceof BaseAnnotationTool) {
  //   addNewMeasurement(evt, activeTool);
  // }
}
