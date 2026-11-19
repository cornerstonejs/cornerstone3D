import * as cornerstone from '@cornerstonejs/core';
import { Enums as csEnums, eventTarget } from '@cornerstonejs/core';

const { Events } = csEnums;
const { NEW_IMAGE } = csEnums.Events;

element.addEventListener(csEnums.Events.NEW_IMAGE, onNewImage);
element.addEventListener(Events.NEW_IMAGE, onNewImage);
element.removeEventListener(
  cornerstone.Enums.Events.NEW_IMAGE,
  onNewImage
);
eventTarget.addEventListener(Events.IMAGE_LOAD_FAILED, onLoadError);

other.addEventListener(NEW_IMAGE, onNewImage);
other.addEventListener(NEW_IMAGE, onNewImage);
