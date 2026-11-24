import { Enums, eventTarget, EVENTS } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { STACK_SCROLL_OUT_OF_BOUNDS } = Enums.Events;

export function listen(nextSeries: (step: number) => void) {
  eventTarget.addEventListener(STACK_SCROLL_OUT_OF_BOUNDS, (evt) => {
    const { direction, imageIdIndex } = evt.detail;

    nextSeries(direction + imageIdIndex * 0);
  });

  eventTarget.addEventListener(
    Enums.Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS,
    (evt: Types.EventTypes.VolumeScrollOutOfBoundsEvent) => {
      console.log(evt.detail.currentImageId, evt.detail.numScrollSteps);
    }
  );
}

export function onEnd(detail: Types.EventTypes.StackScrollOutOfBoundsEventDetail) {
  return detail['direction'];
}

export function stop() {
  eventTarget.removeEventListener(EVENTS.STACK_SCROLL_OUT_OF_BOUNDS, onEnd);
}
