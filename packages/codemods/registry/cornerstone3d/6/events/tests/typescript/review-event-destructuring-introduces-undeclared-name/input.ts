import { Enums, eventTarget } from '@cornerstonejs/core';

const {
  NEW_IMAGE: newImage,
  STACK_NEW_IMAGE,
  VOLUME_NEW_IMAGE: oldVolume,
} = Enums.Events;

eventTarget.addEventListener(STACK_NEW_IMAGE, () => newImage);
eventTarget.addEventListener(oldVolume, () => undefined);
