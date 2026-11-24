import { Enums, EVENTS, eventTarget } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { Events } = Enums;

export function listen(element: HTMLDivElement, nextSeries: (step: number) => void) {
  eventTarget.addEventListener(Enums.Events.SCROLL_OUT_OF_BOUNDS, (evt) => {
    nextSeries(evt.detail.delta);
  });

  element.addEventListener(Events.SCROLL_OUT_OF_BOUNDS, (evt) => {
    const { delta } = evt.detail;

    console.log(delta, evt.detail['delta']);
  });

  eventTarget.removeEventListener(
    Enums.Events['SCROLL_OUT_OF_BOUNDS'],
    () => undefined
  );
}

function onStackEnd({ detail }) {
  const { delta: step = 1 } = detail;

  return step + detail.imageIdIndex;
}

export function listenByName() {
  eventTarget.addEventListener(EVENTS.SCROLL_OUT_OF_BOUNDS, onStackEnd);
}

export function onVolumeEnd(evt: Types.EventTypes.ScrollOutOfBoundsEvent) {
  const detail: Types.EventTypes.ScrollOutOfBoundsEventDetail = evt.detail;
  const { imageId, volumeId } = evt.detail;

  console.log(imageId, volumeId, detail.imageId, detail.delta);

  return [detail.numScrollSteps, detail.viewport, detail.currentStepIndex];
}

export function onScroll(element: HTMLDivElement, update: () => void) {
  element.addEventListener(Events.VOLUME_VIEWPORT_SCROLL, update);
}
