import type { Types } from '@cornerstonejs/core';
import { Enums } from '@cornerstonejs/core';

const { IMAGE_RENDERED, CAMERA_MODIFIED, STACK_NEW_IMAGE } = Enums.Events;

element.addEventListener(STACK_NEW_IMAGE, ((
  evt: Types.EventTypes.StackNewImageEvent
) => {
  const { imageId } = evt.detail;

  updateLastEvents(STACK_NEW_IMAGE, imageId);
}) as EventListener);

element.addEventListener(IMAGE_RENDERED, () =>
  updateLastEvents(CAMERA_MODIFIED, '')
);

export function onVolume(detail: Types.EventTypes.VolumeNewImageEventDetail) {
  return detail.imageIndex;
}
