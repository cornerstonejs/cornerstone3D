import { Enums, EVENTS } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { DisplaySetService } from '@ohif/core';

export function subscribe(servicesManager, element: HTMLDivElement) {
  const { displaySetService } = servicesManager.services;

  displaySetService.subscribe(
    displaySetService.EVENTS.DISPLAY_SETS_CHANGED,
    () => element.dispatchEvent(new Event('refresh'))
  );
  displaySetService.subscribe(DisplaySetService.EVENTS.DISPLAY_SETS_CHANGED, () =>
    console.log(EVENTS.IMAGE_RENDERED)
  );
}

export async function jump(viewport: Types.IStackViewport, imageIdIndex: number) {
  const current = viewport.getCurrentImageIdIndex();

  await viewport.setImageIdIndex(current + 1);

  return { imageIds: [], initialImageIdIndex: imageIdIndex };
}

export function onOutOfBounds(element: HTMLDivElement) {
  element.addEventListener(Enums.Events.STACK_SCROLL_OUT_OF_BOUNDS, (evt) => {
    const { imageIdIndex } = evt.detail;

    console.log(evt.detail.imageIdIndex, imageIdIndex);
  });
}
