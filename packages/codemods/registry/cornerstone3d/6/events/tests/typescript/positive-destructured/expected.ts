import type { Types } from '@cornerstonejs/core';
import { Enums } from '@cornerstonejs/core';

const { IMAGE_RENDERED, CAMERA_MODIFIED, NEW_IMAGE } = Enums.Events;

element.addEventListener(NEW_IMAGE, ((
  evt: Types.EventTypes.NewImageEvent
) => {
  const { imageId } = evt.detail;

  updateLastEvents(NEW_IMAGE, imageId);
}) as EventListener);

element.addEventListener(IMAGE_RENDERED, () =>
  updateLastEvents(CAMERA_MODIFIED, '')
);

export function onVolume(detail: Types.EventTypes.NewImageEventDetail) {
  return detail.sliceIndex;
}
