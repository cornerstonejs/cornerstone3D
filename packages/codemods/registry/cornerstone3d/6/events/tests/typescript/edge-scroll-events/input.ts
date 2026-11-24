import { Enums, eventTarget } from '@cornerstonejs/core';

const {
  STACK_SCROLL_OUT_OF_BOUNDS,
  VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS,
  VOLUME_VIEWPORT_SCROLL,
} = Enums.Events;

export function listen(element: HTMLDivElement, update: () => void) {
  const both = (evt) => evt.detail.direction ?? evt.detail.currentImageId;

  eventTarget.addEventListener(STACK_SCROLL_OUT_OF_BOUNDS, both);
  eventTarget.addEventListener(VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS, both);

  element.addEventListener(VOLUME_VIEWPORT_SCROLL, update);
  element.addEventListener(Enums.Events.STACK_VIEWPORT_SCROLL, update);

  const mixed = (evt) => evt.detail.direction;

  eventTarget.addEventListener(STACK_SCROLL_OUT_OF_BOUNDS, mixed);
  eventTarget.addEventListener(Enums.Events.CAMERA_MODIFIED, mixed);

  eventTarget.addEventListener('VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS', (evt) => {
    const { currentImageId: shown = '' } = evt.detail;

    return shown;
  });
}
