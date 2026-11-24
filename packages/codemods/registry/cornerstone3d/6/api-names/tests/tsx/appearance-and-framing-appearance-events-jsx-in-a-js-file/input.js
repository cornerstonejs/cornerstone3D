import { Enums } from '@cornerstonejs/core';

export function WindowText({ element, viewport, displaySetId }) {
  element.addEventListener(Enums.Events.VOI_MODIFIED, (evt) => {
    console.log(evt.detail.range.lower);
  });

  return <span>{viewport.getDisplaySetAppearance(displaySetId).voiRange.upper}</span>;
}
