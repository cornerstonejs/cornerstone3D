import { Enums, eventTarget, EVENTS } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { SCROLL_OUT_OF_BOUNDS } = Enums.Events;

export function listen(nextSeries: (step: number) => void) {
  eventTarget.addEventListener(SCROLL_OUT_OF_BOUNDS, (evt) => {
    const { delta, imageIdIndex } = evt.detail;

    nextSeries(delta + imageIdIndex * 0);
  });

  eventTarget.addEventListener(
    Enums.Events.SCROLL_OUT_OF_BOUNDS,
    (evt: Types.EventTypes.ScrollOutOfBoundsEvent) => {
      console.log(evt.detail.imageId, evt.detail.numScrollSteps);
    }
  );
}

export function onEnd(detail: Types.EventTypes.ScrollOutOfBoundsEventDetail) {
  return detail['delta'];
}

export function stop() {
  eventTarget.removeEventListener(EVENTS.SCROLL_OUT_OF_BOUNDS, onEnd);
}
