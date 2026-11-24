import { Enums, EVENTS, eventTarget } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { Events } = Enums;

export function listen(element: HTMLDivElement, nextSeries: (step: number) => void) {
  eventTarget.addEventListener(Enums.Events.STACK_SCROLL_OUT_OF_BOUNDS, (evt) => {
    nextSeries(evt.detail.direction);
  });

  element.addEventListener(Events.STACK_SCROLL_OUT_OF_BOUNDS, (evt) => {
    const { direction } = evt.detail;

    console.log(direction, evt.detail['direction']);
  });

  eventTarget.removeEventListener(
    Enums.Events['STACK_SCROLL_OUT_OF_BOUNDS'],
    () => undefined
  );
}

function onStackEnd({ detail }) {
  const { direction: step = 1 } = detail;

  return step + detail.imageIdIndex;
}

export function listenByName() {
  eventTarget.addEventListener(EVENTS.STACK_SCROLL_OUT_OF_BOUNDS, onStackEnd);
}

export function onVolumeEnd(evt: Types.EventTypes.VolumeScrollOutOfBoundsEvent) {
  const detail: Types.EventTypes.VolumeScrollOutOfBoundsEventDetail = evt.detail;
  const { currentImageId, volumeId } = evt.detail;

  console.log(currentImageId, volumeId, detail.currentImageId, detail.delta);

  return [detail.numScrollSteps, detail.viewport, detail.currentStepIndex];
}

export function onScroll(element: HTMLDivElement, update: () => void) {
  element.addEventListener(Events.VOLUME_VIEWPORT_SCROLL, update);
}
