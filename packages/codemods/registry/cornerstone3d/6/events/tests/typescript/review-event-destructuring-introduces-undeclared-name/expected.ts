import { Enums, eventTarget } from '@cornerstonejs/core';

const {
  NEW_IMAGE: newImage,
  NEW_IMAGE: oldVolume,
} = Enums.Events;

eventTarget.addEventListener(newImage, () => newImage);
eventTarget.addEventListener(oldVolume, () => undefined);
