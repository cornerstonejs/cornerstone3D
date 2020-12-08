import VtkjsToolsEvents from '../../enums/VtkjsToolsEvents';
import triggerEvent from './../../util/triggerEvent';
import getMouseEventPoints from './getMouseEventPoints';
import { getEnabledElement } from './../../../index';

const eventName = VtkjsToolsEvents.MOUSE_MOVE;

/**
 *
 * @param evt
 */
function mouseMoveListener(evt: MouseEvent) {
  const element = evt.currentTarget as HTMLElement;

  const enabledElement = getEnabledElement(element);
  const { renderingEngineUID, sceneUID, viewportUID } = enabledElement;

  const currentPoints = getMouseEventPoints(evt);
  const eventData = {
    renderingEngineUID,
    sceneUID,
    viewportUID,
    camera: {},
    element,
    currentPoints,
    eventName,
  };

  triggerEvent(element, eventName, eventData);
}

export default mouseMoveListener;
