import { Enums } from '@cornerstonejs/core';

export function WindowText({ element, viewport, displaySetId }) {
  element.addEventListener(Enums.Events.DISPLAY_SET_APPEARANCE_CHANGED, (evt) => {
    console.log(evt.detail.effective.voiRange.lower);
  });

  return <span>{viewport.getDisplaySetAppearance(displaySetId).voiRange.upper}</span>;
}
