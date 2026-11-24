import { Enums, eventTarget, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { Events } = Enums;

export function listen(element: HTMLDivElement, viewport: Types.IViewport) {
  element.addEventListener(Events.CAMERA_MODIFIED, (evt) => {
    const { direction, viewport: shown } = evt.detail;

    console.log(evt.detail.direction, evt.detail.currentImageId, direction, shown);
  });

  eventTarget.addEventListener(Events.SCROLL_OUT_OF_BOUNDS, (evt) => {
    console.log(evt.detail.sliceIndex, evt.detail.delta);
  });

  utilities.scroll(viewport, { delta: 1, loop: true });
}

export function wheel(evt: WheelEvent, scroll: { direction: number }) {
  return { direction: scroll.direction, delta: evt.deltaY };
}
