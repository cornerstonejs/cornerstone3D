import { Enums, EVENTS } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { Events } = Enums;

export function listen(element: HTMLDivElement, restartCine: () => void) {
  element.addEventListener(Events.DISPLAY_SETS_CHANGED, restartCine);
  element.addEventListener(
    Enums.Events.DISPLAY_SETS_CHANGED,
    restartCine
  );

  element.addEventListener(Events.NEW_IMAGE, (evt) => {
    const { sliceIndex, imageId } = evt.detail;

    console.log(sliceIndex, imageId, evt.detail['sliceIndex']);
  });

  element.addEventListener(EVENTS.NEW_IMAGE, onVolumeImage);
}

function onVolumeImage({ detail }) {
  const { sliceIndex: index = 0 } = detail;

  return index / detail.numberOfSlices + detail.sliceIndex;
}

export class Scrollbar {
  index = 0;

  onStackImage = (evt: Types.EventTypes.NewImageEvent) => {
    this.index = evt.detail.sliceIndex;
  };

  onNewStack(evt: Types.EventTypes.DisplaySetsChangedEvent) {
    return evt.detail.viewportId;
  }
}
