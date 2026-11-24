import { Enums, eventTarget } from '@cornerstonejs/core';

const sliceIndex = 3;

export function getImageIndexFromEvent(event) {
  return event.detail.imageIdIndex;
}

export function listen(element: HTMLDivElement, eventName: string) {
  const update = (evt) => {
    const { imageIdIndex } = evt.detail;

    return imageIdIndex;
  };

  element.addEventListener(eventName, update);

  element.addEventListener(Enums.Events.NEW_IMAGE, (evt) => {
    const { sliceIndex: imageIdIndex } = evt.detail;

    return { imageIdIndex, sliceIndex };
  });

  element.addEventListener(
    Enums.Events.NEW_IMAGE,
    ({ detail: { sliceIndex: imageIdIndex } }) => imageIdIndex + 1
  );

  element.addEventListener('CORNERSTONE_NEW_IMAGE', (evt) => {
    const { detail: { sliceIndex: shown } } = evt;

    return evt.detail?.sliceIndex ?? shown;
  });

  const both = (evt) => evt.detail.imageIdIndex;

  element.addEventListener(Enums.Events.NEW_IMAGE, both);
  element.addEventListener(Enums.Events.CAMERA_MODIFIED, both);

  eventTarget.addEventListener('CORNERSTONE_VOLUME_VIEWPORT_NEW_VOLUME', () =>
    console.log('volume')
  );
}
