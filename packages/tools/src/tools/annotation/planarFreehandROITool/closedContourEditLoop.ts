import { state } from '../../../store';
import { Events } from '../../../enums';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor';
import { EventTypes } from '../../../types';

function activateClosedContourEdit(element: HTMLDivElement) {
  state.isInteractingWithTool = true;

  element.addEventListener(
    Events.MOUSE_UP,
    this.mouseUpClosedContourEditCallback
  );
  element.addEventListener(
    Events.MOUSE_DRAG,
    this.mouseDragClosedContourEditCallback
  );
  element.addEventListener(
    Events.MOUSE_CLICK,
    this.mouseUpClosedContourEditCallback
  );

  hideElementCursor(element);
}

function deactivateClosedContourEdit(element: HTMLDivElement) {
  state.isInteractingWithTool = false;

  element.removeEventListener(
    Events.MOUSE_UP,
    this.mouseUpClosedContourEditCallback
  );
  element.removeEventListener(
    Events.MOUSE_DRAG,
    this.mouseDragClosedContourEditCallback
  );
  element.removeEventListener(
    Events.MOUSE_CLICK,
    this.mouseUpClosedContourEditCallback
  );

  resetElementCursor(element);
}

function mouseDragClosedContourEditCallback(
  evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
) {
  console.log('TODO_JAMES -> Closed Contour editing');
}

function mouseUpClosedContourEditCallback(
  evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
) {
  const eventDetail = evt.detail;
  const { element } = eventDetail;

  this.deactivateClosedContourEdit(element);
}

function registerClosedContourEditLoop(toolInstance) {
  toolInstance.activateClosedContourEdit =
    activateClosedContourEdit.bind(toolInstance);
  toolInstance.deactivateClosedContourEdit =
    deactivateClosedContourEdit.bind(toolInstance);
  toolInstance.mouseDragClosedContourEditCallback =
    mouseDragClosedContourEditCallback.bind(toolInstance);
  toolInstance.mouseUpClosedContourEditCallback =
    mouseUpClosedContourEditCallback.bind(toolInstance);
}

export default registerClosedContourEditLoop;
