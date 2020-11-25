import VtkjsEvents from './../../events';

function mouseMove(e: MouseEvent) {
  const element = e.currentTarget;
  const enabledElement = external.cornerstone.getEnabledElement(element);

  if (!enabledElement.image) {
    return;
  }

  const eventType = VtkjsEvents.MOUSE_MOVE;

  const startPoints = {
    page: external.cornerstoneMath.point.pageToPoint(e),
    image: external.cornerstone.pageToPixel(element, e.pageX, e.pageY),
    client: {
      x: e.clientX,
      y: e.clientY,
    },
  };

  startPoints.canvas = external.cornerstone.pixelToCanvas(
    element,
    startPoints.image
  );

  let lastPoints = copyPoints(startPoints);

  // Calculate our current points in page and image coordinates
  const currentPoints = {
    page: external.cornerstoneMath.point.pageToPoint(e),
    image: external.cornerstone.pageToPixel(element, e.pageX, e.pageY),
    client: {
      x: e.clientX,
      y: e.clientY,
    },
  };

  currentPoints.canvas = external.cornerstone.pixelToCanvas(
    element,
    currentPoints.image
  );

  // Calculate delta values in page and image coordinates
  const deltaPoints = {
    page: external.cornerstoneMath.point.subtract(
      currentPoints.page,
      lastPoints.page
    ),
    image: external.cornerstoneMath.point.subtract(
      currentPoints.image,
      lastPoints.image
    ),
    client: external.cornerstoneMath.point.subtract(
      currentPoints.client,
      lastPoints.client
    ),
    canvas: external.cornerstoneMath.point.subtract(
      currentPoints.canvas,
      lastPoints.canvas
    ),
  };

  const eventData = {
    viewport: external.cornerstone.getViewport(element),
    image: enabledElement.image,
    element,
    startPoints,
    lastPoints,
    currentPoints,
    deltaPoints,
    type: eventType,
  };

  triggerEvent(element, eventType, eventData);

  // Update the last points
  lastPoints = copyPoints(currentPoints);
}
