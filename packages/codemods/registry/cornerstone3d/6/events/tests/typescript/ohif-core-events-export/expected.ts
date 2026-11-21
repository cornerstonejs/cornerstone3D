import { eventTarget, EVENTS } from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';

export function listen(element: HTMLElement, onImage: EventListener) {
  eventTarget.addEventListener(EVENTS.IMAGE_LOAD_FAILED, onImage);
  eventTarget.addEventListener(EVENTS.IMAGE_LOAD_FAILED, onImage);
  element.addEventListener(EVENTS.NEW_IMAGE, onImage);
  element.addEventListener(cornerstone.EVENTS.NEW_IMAGE, onImage);
  element.addEventListener(EVENTS['NEW_IMAGE'], onImage);
}

export const scrollEvent = EVENTS.STACK_VIEWPORT_SCROLL;

const { NEW_IMAGE } = EVENTS;

export function listenOnce(element: HTMLElement, onImage: EventListener) {
  element.addEventListener(NEW_IMAGE, onImage);
}

export function other(EVENTS: { STACK_NEW_IMAGE: string }) {
  return EVENTS.STACK_NEW_IMAGE;
}
