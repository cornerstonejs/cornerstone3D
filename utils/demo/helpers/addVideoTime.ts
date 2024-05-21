import { Enums, Types } from '@cornerstonejs/core';

const seconds = (time) => `${(time || 0).toFixed(1)} s`;

/**
 * Adds a video time display after the given element.
 */
export default function addVideoTime(
  afterElement: HTMLElement,
  viewport: Types.IVideoViewport
) {
  const rangeDiv = document.createElement('div');
  rangeDiv.innerHTML =
    '<span id="time">0 s</span><input id="range" style="height:8px; width: 75%; display: inline;" value="0" type="range" /><span id="remaining">unknown</span>';
  afterElement.insertAdjacentElement('afterend', rangeDiv);
  const rangeElement = document.getElementById('range') as HTMLInputElement;
  rangeElement.onchange = () => {
    viewport.setTime(Number(rangeElement.value));
  };
  rangeElement.oninput = () => {
    viewport.setTime(Number(rangeElement.value));
  };

  viewport.element.addEventListener(Enums.Events.STACK_NEW_IMAGE, (evt) => {
    const { time, duration } = evt.detail;
    rangeElement.value = time;
    rangeElement.max = duration;
    const timeElement = document.getElementById('time');
    const frame = viewport.getCurrentImageIdIndex();
    timeElement.innerText = seconds(time);
    const remainingElement = document.getElementById('remaining');
    remainingElement.innerText = `${seconds(duration)} Frame #${frame + 1}`;
  });

  return rangeDiv;
}
