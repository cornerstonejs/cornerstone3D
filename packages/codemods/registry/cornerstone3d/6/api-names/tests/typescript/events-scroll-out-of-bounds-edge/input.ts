import { Enums, eventTarget } from '@cornerstonejs/core';
import { onEnd } from './handlers';

const { STACK_SCROLL_OUT_OF_BOUNDS, VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS } =
  Enums.Events;

export function listen(element: HTMLDivElement) {
  eventTarget.addEventListener(STACK_SCROLL_OUT_OF_BOUNDS, onEnd);

  const both = (evt) => evt.detail.direction;

  element.addEventListener(VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS, both);
  element.addEventListener(Enums.Events.CAMERA_MODIFIED, both);

  eventTarget.addEventListener('STACK_SCROLL_OUT_OF_BOUNDS', (evt) => {
    const { direction } = evt.detail;

    return direction;
  });
}

export function isEnd(evt: Event) {
  return (
    evt.type === Enums.Events.STACK_SCROLL_OUT_OF_BOUNDS ||
    evt.type === Enums.Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS
  );
}

export class Navigator {
  attach() {
    eventTarget.addEventListener(
      Enums.Events.STACK_SCROLL_OUT_OF_BOUNDS,
      this.onEnd.bind(this)
    );
  }

  onEnd(evt) {
    const { detail: { direction, imageIdIndex } } = evt;

    return direction * imageIdIndex;
  }
}
