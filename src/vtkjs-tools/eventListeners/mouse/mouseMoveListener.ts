import VtkjsToolsEvents from './../../VtkjsToolsEvents';
import triggerEvent from './../../util/triggerEvent';

/**
 *
 * @param evt
 */
function mouseMoveListener(evt: MouseEvent) {
  const element = evt.currentTarget;
  const eventName = VtkjsToolsEvents.MOUSE_MOVE;

  const startPoints = {
    // page: external.cornerstoneMath.point.pageToPoint(e),
    // image: external.cornerstone.pageToPixel(element, e.pageX, e.pageY),
    // canvas: external.cornerstone.pixelToCanvas(element,startPoints.image)
    client: {
      x: evt.clientX,
      y: evt.clientY,
    },
  };

  // Calculate delta values in page and image coordinates
  const deltaPoints = {
    // distance between currentPoints and lastPoints (x,y)
    // page: external.cornerstoneMath.point.subtract(currentPoints.page, lastPoints.page),
  };

  const eventData = {
    camera: {},
    element,
    startPoints,
    lastPoints: startPoints,
    currentPoints: startPoints,
    deltaPoints: { x: 0, y: 0 }, // not actual schema
    eventName,
  };

  triggerEvent(element, eventName, eventData);
}

export default mouseMoveListener;
