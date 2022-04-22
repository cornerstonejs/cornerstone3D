import { getEnabledElement } from '@cornerstonejs/core';
import { state } from '../../../store';
import { Events } from '../../../enums';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor';
import { EventTypes } from '../../../types';
import { polyline } from '../../../utilities/math';

const { getSpacingAndXYDirections } = polyline;

function activateOpenContourEndEdit(
  evt: EventTypes.MouseDownActivateEventType,
  annotation: Types.Annotation,
  viewportIdsToRender: string[]
) {
  this.isDrawing = true;

  const eventDetail = evt.detail;
  const { currentPoints, element } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  const { spacing, xDir, yDir } = getSpacingAndXYDirections(
    viewport,
    this.configuration.subPixelResolution
  );

  const canvasPoints = annotation.data.polyline.map(viewport.worldToCanvas);
  const handleIndexGrabbed = annotation.data.handles.activeHandleIndex;

  // If 0, invert point direction, if 1, keep point direction the same.
  // This is so we can just jump as into the state as if the annotation was just being drawn.
  if (handleIndexGrabbed === 0) {
    canvasPoints.reverse();
  }

  debugger;

  this.drawData = {
    canvasPoints: canvasPoints,
    polylineIndex: canvasPoints.length - 1,
  };

  this.commonData = {
    annotation,
    viewportIdsToRender,
    spacing,
    xDir,
    yDir,
  };

  debugger;

  state.isInteractingWithTool = true;

  // Jump into drawing loop.
  element.addEventListener(Events.MOUSE_UP, this.mouseUpDrawCallback);
  element.addEventListener(Events.MOUSE_DRAG, this.mouseDragDrawCallback);
  element.addEventListener(Events.MOUSE_CLICK, this.mouseUpDrawCallback);

  hideElementCursor(element);
}

// function deactivateOpenContourEndEdit(element: HTMLDivElement) {
//   state.isInteractingWithTool = false;

//   element.removeEventListener(
//     Events.MOUSE_UP,
//     this.mouseUpOpenContourEndEditCallback
//   );
//   element.removeEventListener(
//     Events.MOUSE_DRAG,
//     this.mouseDragOpenContourEndEditCallback
//   );
//   element.removeEventListener(
//     Events.MOUSE_CLICK,
//     this.mouseUpOpenContourEndEditCallback
//   );

//   resetElementCursor(element);
// }

// function mouseDragOpenContourEndEditCallback(
//   evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
// ) {
//   console.log('TODO_JAMES -> Open Contour End editing');
// }

// function mouseUpOpenContourEndEditCallback(
//   evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
// ) {
//   const eventDetail = evt.detail;
//   const { element } = eventDetail;

//   this.deactivateOpenContourEndEdit(element);
// }

function registerOpenContourEndEditLoop(toolInstance) {
  toolInstance.activateOpenContourEndEdit =
    activateOpenContourEndEdit.bind(toolInstance);
  // toolInstance.deactivateOpenContourEndEdit =
  //   deactivateOpenContourEndEdit.bind(toolInstance);
  // toolInstance.mouseDragOpenContourEndEditCallback =
  //   mouseDragOpenContourEndEditCallback.bind(toolInstance);
  // toolInstance.mouseUpOpenContourEndEditCallback =
  //   mouseUpOpenContourEndEditCallback.bind(toolInstance);
}

export default registerOpenContourEndEditLoop;
