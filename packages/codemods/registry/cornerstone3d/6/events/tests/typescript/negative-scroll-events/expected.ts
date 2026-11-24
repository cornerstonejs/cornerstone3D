import { Enums, eventTarget, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

export function listen(element: HTMLDivElement, viewport: Types.IViewport) {
  element.addEventListener(Enums.Events.CAMERA_MODIFIED, (evt) => {
    const { direction, currentImageId } = evt.detail;

    console.log(direction, currentImageId, evt.detail.direction);
  });

  eventTarget.addEventListener(Enums.Events.IMAGE_RENDERED, (evt) => {
    console.log(evt.detail.currentImageId);
  });

  utilities.scroll(viewport, { delta: -1, loop: true, scrollSlabs: true });
}

export function wheel(scroll: { direction: number; currentImageId: string }) {
  return scroll.direction + scroll.currentImageId.length;
}
