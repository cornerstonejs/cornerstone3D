import { Enums, EVENTS, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { DisplaySetService } from '@ohif/core';

const { Events } = Enums;

export function subscribe(servicesManager, element: HTMLDivElement) {
  const { displaySetService } = servicesManager.services;

  displaySetService.subscribe(
    displaySetService.EVENTS.DISPLAY_SETS_CHANGED,
    () => element.dispatchEvent(new Event('refresh'))
  );
  displaySetService.subscribe(DisplaySetService.EVENTS.DISPLAY_SETS_CHANGED, () =>
    console.log(EVENTS.NEW_IMAGE)
  );
}

export async function jump(viewport: Types.IStackViewport, imageIdIndex: number) {
  const current = viewport.getCurrentImageIdIndex();
  const descriptor = { imageIds: [], initialImageIdIndex: imageIdIndex };

  await viewport.setImageIdIndex(current + 1);
  utilities.jumpToSlice(viewport.element, { imageIndex: imageIdIndex });

  return descriptor;
}

export function onOutOfBounds(element: HTMLDivElement) {
  element.addEventListener(Events.IMAGE_RENDERED, (evt) => {
    const { imageIdIndex } = evt.detail;

    console.log(evt.detail.imageIdIndex, imageIdIndex);
  });
}

export function rows(items: Array<{ imageIdIndex: number }>) {
  return items.map((item) => item.imageIdIndex);
}
