import type { VideoGenericViewport } from '@cornerstonejs/core';
import { Enums } from '@cornerstonejs/core';

const seconds = (time) => `${(time || 0).toFixed(1)} s`;

/**
 * The time and the length of the video, in seconds, in the detail of the
 * `IMAGE_RENDERED` event of a video viewport.
 */
type VideoRenderedEvent = CustomEvent<{ time: number; duration: number }>;

/**
 * Adds a video time display after the given element: a slider that seeks
 * the video, the time of the frame on display, the length of the video and
 * the frame number. The display follows each render of the video.
 */
export default function addVideoTime(
  afterElement: HTMLElement,
  viewport: VideoGenericViewport
) {
  const rangeDiv = document.createElement('div');
  rangeDiv.innerHTML =
    '<span id="time">0 s</span><input id="range" style="height:8px; width: 75%; display: inline;" value="0" type="range" /><span id="remaining">unknown</span>';
  afterElement.insertAdjacentElement('afterend', rangeDiv);
  const rangeElement = document.getElementById('range') as HTMLInputElement;
  rangeElement.onchange = () => {
    viewport.seek(Number(rangeElement.value));
  };
  rangeElement.oninput = () => {
    viewport.seek(Number(rangeElement.value));
  };

  viewport.element.addEventListener(Enums.Events.IMAGE_RENDERED, (evt) => {
    const { time, duration } = (evt as VideoRenderedEvent).detail;
    rangeElement.value = String(time);
    rangeElement.max = String(duration);
    const timeElement = document.getElementById('time');
    const frame = viewport.getCurrentImageIdIndex();
    timeElement.innerText = seconds(time);
    const remainingElement = document.getElementById('remaining');
    remainingElement.innerText = `${seconds(duration)} Frame #${frame + 1}`;
  });

  return rangeDiv;
}
