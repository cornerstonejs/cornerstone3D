import { Enums, EVENTS, cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { Events } = Enums;

export function listen(element: HTMLDivElement, restartCine: () => void) {
  element.addEventListener(Enums.Events.VIEWPORT_NEW_IMAGE_SET, restartCine);
  element.addEventListener(Events.VOLUME_VIEWPORT_NEW_VOLUME, restartCine);
  element.removeEventListener(
    Enums.Events['VIEWPORT_NEW_IMAGE_SET'],
    restartCine
  );

  element.addEventListener(Enums.Events.NEW_IMAGE, (evt) => {
    const index = evt.detail.imageIdIndex;
    const quoted = evt.detail['imageIdIndex'];

    console.log(index, quoted, cache.getCacheSize());
  });
}

const onNewImage = (evt: CustomEvent) => {
  const { imageIdIndex, numberOfSlices } = evt.detail;

  return imageIdIndex / numberOfSlices;
};

function onNewSlice({ detail }) {
  const { imageIdIndex: index = 0 } = detail;

  return index + detail.imageIdIndex;
}

export function listenByName(element: HTMLDivElement) {
  element.addEventListener(Events.NEW_IMAGE, onNewImage);
  element.addEventListener(EVENTS.NEW_IMAGE, onNewSlice);
}

export const toolbarListeners = {
  [EVENTS.VIEWPORT_NEW_IMAGE_SET]: { commandName: 'toggleImageSliceSync' },
};

export function onStack(evt: Types.EventTypes.StackViewportNewStackEvent) {
  const detail: Types.EventTypes.StackViewportNewStackEventDetail = evt.detail;

  return detail.viewportId;
}

export class Scrollbar {
  index = 0;

  onNewImage = (evt: Types.EventTypes.NewImageEvent) => {
    const { imageIdIndex = 0 } = evt.detail;

    this.index = imageIdIndex;
  };

  onTypedImage(evt) {
    this.index = evt.detail.imageIdIndex;
  }

  attach(element: HTMLDivElement) {
    element.addEventListener(Enums.Events.NEW_IMAGE, this.onTypedImage);
  }
}
