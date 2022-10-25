import {
  utilities,
  getEnabledElement,
  StackViewport,
} from '@cornerstonejs/core';
import CINE_EVENTS from './events';
import { addToolState, getToolState } from './state';
import { CINETypes } from '../../types';

const { triggerEvent } = utilities;

const debounced = true;
const loop = true;
/**
 * Starts playing a clip or adjusts the frame rate of an already playing clip.  framesPerSecond is
 * optional and defaults to 30 if not specified.  A negative framesPerSecond will play the clip in reverse.
 * The element must be a stack of images
 * @param element - HTML Element
 * @param framesPerSecond - Number of frames per second
 */
function playClip(
  element: HTMLDivElement,
  playClipOptions: CINETypes.PlayClipOptions
): void {
  let playClipTimeouts;
  let playClipIsTimeVarying;

  if (element === undefined) {
    throw new Error('playClip: element must not be undefined');
  }

  const enabledElement = getEnabledElement(element);

  if (!enabledElement) {
    throw new Error(
      'playClip: element must be a valid Cornerstone enabled element'
    );
  }

  const { viewport } = enabledElement;

  if (!(viewport instanceof StackViewport)) {
    throw new Error(
      'playClip: element must be a stack viewport, volume viewport playClip not yet implemented'
    );
  }

  const stackData = {
    targetImageIdIndex: viewport.getTargetImageIdIndex(),
    imageIds: viewport.getImageIds(),
  };

  let playClipData = getToolState(element);

  if (!playClipData) {
    playClipData = {
      intervalId: undefined,
      framesPerSecond: 30,
      lastFrameTimeStamp: undefined,
      ignoreFrameTimeVector: false,
      usingFrameTimeVector: false,
      frameTimeVector: playClipOptions.frameTimeVector ?? undefined,
      speed: playClipOptions.frameTimeVectorSpeedMultiplier ?? 1,
      reverse: playClipOptions.reverse ?? false,
      loop: playClipOptions.loop ?? true,
    };
    addToolState(element, playClipData);
  } else {
    // Make sure the specified clip is not running before any property update
    _stopClipWithData(playClipData);
  }

  // If a framesPerSecond is specified and is valid, update the playClipData now
  if (
    playClipOptions.framesPerSecond < 0 ||
    playClipOptions.framesPerSecond > 0
  ) {
    playClipData.framesPerSecond = Number(playClipOptions.framesPerSecond);
    playClipData.reverse = playClipData.framesPerSecond < 0;
    // If framesPerSecond is given, frameTimeVector will be ignored...
    playClipData.ignoreFrameTimeVector = true;
  }

  // Determine if frame time vector should be used instead of a fixed frame rate...
  if (
    playClipData.ignoreFrameTimeVector !== true &&
    playClipData.frameTimeVector &&
    playClipData.frameTimeVector.length === stackData.imageIds.length
  ) {
    const { timeouts, isTimeVarying } = _getPlayClipTimeouts(
      playClipData.frameTimeVector,
      playClipData.speed
    );

    playClipTimeouts = timeouts;
    playClipIsTimeVarying = isTimeVarying;
  }

  // This function encapsulates the frame rendering logic...
  const playClipAction = () => {
    // Hoisting of context variables
    const stackData = {
      targetImageIdIndex: viewport.getTargetImageIdIndex(),
      imageIds: viewport.getImageIds(),
    };
    
    let newImageIdIndex = stackData.targetImageIdIndex;
    const imageCount = stackData.imageIds.length;

    if (playClipData.reverse) {
      newImageIdIndex--;
    } else {
      newImageIdIndex++;
    }

    if (
      !playClipData.loop &&
      (newImageIdIndex < 0 || newImageIdIndex >= imageCount)
    ) {
      _stopClipWithData(playClipData);
      const eventDetail = {
        element,
      };

      triggerEvent(element, CINE_EVENTS.CLIP_STOPPED, eventDetail);

      return;
    }

    // Loop around if we go outside the stack
    if (newImageIdIndex >= imageCount) {
      newImageIdIndex = 0;
    }

    if (newImageIdIndex < 0) {
      newImageIdIndex = imageCount - 1;
    }

    if (newImageIdIndex !== stackData.targetImageIdIndex) {
      const delta = newImageIdIndex - stackData.targetImageIdIndex;
      viewport.scroll(delta, debounced, loop);
    }
  };

  // If playClipTimeouts array is available, not empty and its elements are NOT uniform ...
  // ... (at least one timeout is different from the others), use alternate setTimeout implementation
  if (
    playClipTimeouts &&
    playClipTimeouts.length > 0 &&
    playClipIsTimeVarying
  ) {
    playClipData.usingFrameTimeVector = true;
    playClipData.intervalId = window.setTimeout(
      function playClipTimeoutHandler() {
        playClipData.intervalId = window.setTimeout(
          playClipTimeoutHandler,
          playClipTimeouts[stackData.targetImageIdIndex]
        );
        playClipAction();
      },
      0
    );
  } else {
    // ... otherwise user setInterval implementation which is much more efficient.
    playClipData.usingFrameTimeVector = false;
    playClipData.intervalId = window.setInterval(
      playClipAction,
      1000 / Math.abs(playClipData.framesPerSecond)
    );
  }

  const eventDetail = {
    element,
  };

  triggerEvent(element, CINE_EVENTS.CLIP_STARTED, eventDetail);
}

/**
 * Stops an already playing clip.
 * @param element - HTML Element
 */
function stopClip(element: HTMLDivElement): void {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  const cineToolData = getToolState(viewport.element);

  if (!cineToolData) {
    return;
  }

  _stopClipWithData(cineToolData);
}

/**
 * [private] Turns a Frame Time Vector (0018,1065) array into a normalized array of timeouts. Each element
 * ... of the resulting array represents the amount of time each frame will remain on the screen.
 * @param vector - A Frame Time Vector (0018,1065) as specified in section C.7.6.5.1.2 of DICOM standard.
 * @param speed - A speed factor which will be applied to each element of the resulting array.
 * @returns An array with timeouts for each animation frame.
 */
function _getPlayClipTimeouts(vector: number[], speed: number) {
  let i;
  let sample;
  let delay;
  let sum = 0;
  const limit = vector.length;
  const timeouts = [];

  // Initialize time varying to false
  let isTimeVarying = false;

  if (typeof speed !== 'number' || speed <= 0) {
    speed = 1;
  }

  // First element of a frame time vector must be discarded
  for (i = 1; i < limit; i++) {
    // eslint-disable-next-line no-bitwise
    delay = (Number(vector[i]) / speed) | 0; // Integral part only
    timeouts.push(delay);
    if (i === 1) {
      // Use first item as a sample for comparison
      sample = delay;
    } else if (delay !== sample) {
      isTimeVarying = true;
    }

    sum += delay;
  }

  if (timeouts.length > 0) {
    if (isTimeVarying) {
      // If it's a time varying vector, make the last item an average...
      // eslint-disable-next-line no-bitwise
      delay = (sum / timeouts.length) | 0;
    } else {
      delay = timeouts[0];
    }

    timeouts.push(delay);
  }

  return { timeouts, isTimeVarying };
}

/**
 * [private] Performs the heavy lifting of stopping an ongoing animation.
 * @param playClipData - The data from playClip that needs to be stopped.
 */
function _stopClipWithData(playClipData) {
  const id = playClipData.intervalId;

  if (typeof id !== 'undefined') {
    playClipData.intervalId = undefined;
    if (playClipData.usingFrameTimeVector) {
      clearTimeout(id);
    } else {
      clearInterval(id);
    }
  }
}

export { playClip, stopClip };
