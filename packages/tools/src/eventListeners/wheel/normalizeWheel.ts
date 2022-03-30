// Reasonable defaults
const PIXEL_STEP = 10;
const LINE_HEIGHT = 40;
const PAGE_HEIGHT = 800;

/**
 * Normalizes wheel events and provides properties that are more
 * consistent and helpful across different browsers
 *
 * @param event - the original mouse event
 * @returns a normalized eventDetail
 */
export default function normalizeWheel(event) {
  let spinX = 0,
    spinY = 0,
    pixelX = 0,
    pixelY = 0;

  // Legacy
  if ('detail' in event) {
    spinY = event.detail;
  }
  if ('wheelDelta' in event) {
    spinY = -event.wheelDelta / 120;
  }
  if ('wheelDeltaY' in event) {
    spinY = -event.wheelDeltaY / 120;
  }
  if ('wheelDeltaX' in event) {
    spinX = -event.wheelDeltaX / 120;
  }

  pixelX = spinX * PIXEL_STEP;
  pixelY = spinY * PIXEL_STEP;

  if ('deltaY' in event) {
    pixelY = event.deltaY;
  }
  if ('deltaX' in event) {
    pixelX = event.deltaX;
  }

  if ((pixelX || pixelY) && event.deltaMode) {
    if (event.deltaMode === 1) {
      // Delta in LINE units
      pixelX *= LINE_HEIGHT;
      pixelY *= LINE_HEIGHT;
    } else {
      // Delta in PAGE units
      pixelX *= PAGE_HEIGHT;
      pixelY *= PAGE_HEIGHT;
    }
  }

  // Fall-back if spin cannot be determined
  if (pixelX && !spinX) {
    spinX = pixelX < 1 ? -1 : 1;
  }
  if (pixelY && !spinY) {
    spinY = pixelY < 1 ? -1 : 1;
  }

  return {
    spinX,
    spinY,
    pixelX,
    pixelY,
  };
}
