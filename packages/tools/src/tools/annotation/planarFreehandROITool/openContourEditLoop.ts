import { state } from '../../../store';
import { Events } from '../../../enums';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor';
import { EventTypes } from '../../../types';

function activateOpenContourEdit(element: HTMLDivElement) {
  state.isInteractingWithTool = true;

  element.addEventListener(
    Events.MOUSE_UP,
    this.mouseUpOpenContourEditCallback
  );
  element.addEventListener(
    Events.MOUSE_DRAG,
    this.mouseDragOpenContourEditCallback
  );
  element.addEventListener(
    Events.MOUSE_CLICK,
    this.mouseUpOpenContourEditCallback
  );

  hideElementCursor(element);
}

function deactivateOpenContourEdit(element: HTMLDivElement) {
  state.isInteractingWithTool = false;

  element.removeEventListener(
    Events.MOUSE_UP,
    this.mouseUpOpenContourEditCallback
  );
  element.removeEventListener(
    Events.MOUSE_DRAG,
    this.mouseDragOpenContourEditCallback
  );
  element.removeEventListener(
    Events.MOUSE_CLICK,
    this.mouseUpOpenContourEditCallback
  );

  resetElementCursor(element);
}

function mouseDragOpenContourEditCallback(
  evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
) {
  console.log('TODO_JAMES -> Open Contour editing');
}

function mouseUpOpenContourEditCallback(
  evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
) {
  const eventDetail = evt.detail;
  const { element } = eventDetail;

  this.deactivateOpenContourEdit(element);
}

function registerOpenContourEditLoop(toolInstance) {
  toolInstance.activateOpenContourEdit =
    activateOpenContourEdit.bind(toolInstance);
  toolInstance.deactivateOpenContourEdit =
    deactivateOpenContourEdit.bind(toolInstance);
  toolInstance.mouseDragOpenContourEditCallback =
    mouseDragOpenContourEditCallback.bind(toolInstance);
  toolInstance.mouseUpOpenContourEditCallback =
    mouseUpOpenContourEditCallback.bind(toolInstance);
}

export default registerOpenContourEditLoop;
