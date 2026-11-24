import { Enums, EVENTS } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { Events } = Enums;

export function listen(element: HTMLDivElement, restartCine: () => void) {
  element.addEventListener(Events.VIEWPORT_NEW_IMAGE_SET, restartCine);
  element.addEventListener(
    Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
    restartCine
  );

  element.addEventListener(Events.STACK_NEW_IMAGE, (evt) => {
    const { imageIdIndex, imageId } = evt.detail;

    console.log(imageIdIndex, imageId, evt.detail['imageIdIndex']);
  });

  element.addEventListener(EVENTS.VOLUME_NEW_IMAGE, onVolumeImage);
}

function onVolumeImage({ detail }) {
  const { imageIndex: index = 0 } = detail;

  return index / detail.numberOfSlices + detail.imageIndex;
}

export class Scrollbar {
  index = 0;

  onStackImage = (evt: Types.EventTypes.StackNewImageEvent) => {
    this.index = evt.detail.imageIdIndex;
  };

  onNewStack(evt: Types.EventTypes.StackViewportNewStackEvent) {
    return evt.detail.viewportId;
  }
}
