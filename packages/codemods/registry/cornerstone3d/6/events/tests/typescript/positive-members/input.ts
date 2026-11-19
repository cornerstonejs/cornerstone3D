import * as cornerstone from '@cornerstonejs/core';
import { Enums as csEnums, eventTarget } from '@cornerstonejs/core';

const { Events } = csEnums;
const { STACK_NEW_IMAGE, VOLUME_NEW_IMAGE } = csEnums.Events;

element.addEventListener(csEnums.Events.STACK_NEW_IMAGE, onNewImage);
element.addEventListener(Events.VOLUME_NEW_IMAGE, onNewImage);
element.removeEventListener(
  cornerstone.Enums.Events.STACK_NEW_IMAGE,
  onNewImage
);
eventTarget.addEventListener(Events.IMAGE_LOAD_ERROR, onLoadError);

other.addEventListener(STACK_NEW_IMAGE, onNewImage);
other.addEventListener(VOLUME_NEW_IMAGE, onNewImage);
