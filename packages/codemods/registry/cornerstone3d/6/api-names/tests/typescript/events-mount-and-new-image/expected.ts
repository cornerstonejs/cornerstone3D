import { Enums, EVENTS, cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { Events } = Enums;

export function listen(element: HTMLDivElement, restartCine: () => void) {
  element.addEventListener(Enums.Events.DISPLAY_SETS_CHANGED, restartCine);
  element.addEventListener(Events.DISPLAY_SETS_CHANGED, restartCine);
  element.removeEventListener(
    Enums.Events['DISPLAY_SETS_CHANGED'],
    restartCine
  );

  element.addEventListener(Enums.Events.NEW_IMAGE, (evt) => {
    const index = evt.detail.sliceIndex;
    const quoted = evt.detail['sliceIndex'];

    console.log(index, quoted, cache.getCacheSize());
  });
}

const onNewImage = (evt: CustomEvent) => {
  const { sliceIndex, numberOfSlices } = evt.detail;

  return sliceIndex / numberOfSlices;
};

function onNewSlice({ detail }) {
  const { sliceIndex: index = 0 } = detail;

  return index + detail.sliceIndex;
}

export function listenByName(element: HTMLDivElement) {
  element.addEventListener(Events.NEW_IMAGE, onNewImage);
  element.addEventListener(EVENTS.NEW_IMAGE, onNewSlice);
}

export const toolbarListeners = {
  [EVENTS.DISPLAY_SETS_CHANGED]: { commandName: 'toggleImageSliceSync' },
};

export function onStack(evt: Types.EventTypes.DisplaySetsChangedEvent) {
  const detail: Types.EventTypes.DisplaySetsChangedEventDetail = evt.detail;

  return detail.viewportId;
}

export class Scrollbar {
  index = 0;

  onNewImage = (evt: Types.EventTypes.NewImageEvent) => {
    const { sliceIndex: imageIdIndex = 0 } = evt.detail;

    this.index = imageIdIndex;
  };

  onTypedImage(evt) {
    this.index = evt.detail.sliceIndex;
  }

  attach(element: HTMLDivElement) {
    element.addEventListener(Enums.Events.NEW_IMAGE, this.onTypedImage);
  }
}
