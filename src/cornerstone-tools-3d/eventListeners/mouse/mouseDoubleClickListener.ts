import VtkjsToolsEvents from '../../enums/VtkjsToolsEvents';
import triggerEvent from './../../util/triggerEvent';

/**
 * Captures and normalized the double click event. Emits as a cstools double
 * click event.
 *
 * @note This is public in the sense that the event it emits is an integration point
 * for consumers. However, this method should not be exposed/imported outside
 * of this library.
 *
 * @private
 * @param evt
 */
function mouseDoubleClickListener(evt: MouseEvent): void {
  const element = evt.currentTarget;
  const startPoints = {
    client: {
      x: evt.clientX,
      y: evt.clientY,
    },
  };

  const eventData = {
    event: evt,
    // @NOTE: This has shifted to "camera"
    // viewport: external.cornerstone.getViewport(element),
    camera: {},
    element,
    startPoints,
    lastPoints: startPoints,
    currentPoints: startPoints,
    // Note: different from schema in mouseDownListener
    deltaPoints: { x: 0, y: 0 },
    eventName: VtkjsToolsEvents.MOUSE_DOUBLE_CLICK,
  };

  triggerEvent(element, VtkjsToolsEvents.MOUSE_DOUBLE_CLICK, eventData);
}

export default mouseDoubleClickListener;
