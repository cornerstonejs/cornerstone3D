import { glMatrix, vec3 } from 'gl-matrix';
import {
  utilities as csUtils,
  getEnabledElement,
  StackViewport,
  VolumeViewport,
  cache,
} from '@cornerstonejs/core';

import { Types } from '@cornerstonejs/core';
import CINE_EVENTS from './events';
import { addToolState, getToolState } from './state';
import { CINETypes } from '../../types';
import scroll from '../scroll';

const { triggerEvent } = csUtils;

const debounced = true;
const loop = true;
const cine4DEnabled = true;

// type ScrollOptions = {
//   loop: boolean;
//   reverse: boolean;
// };

// type ScrollResult = {
//   stop: boolean;
// };

type ScrollStepsInfo = {
  numScrollSteps: number;
  currentStepIndex: number;
};

type PlayClipContext = {
  get numScrollSteps(): number;
  get currentStepIndex(): number;
  get frameTimeVectorEnabled(): boolean;
  // scroll(options: ScrollOptions): ScrollResult;
  getScrollStepsInfo(): ScrollStepsInfo;
  scroll(delta: number): void;
};

function createStackViewportPlayClipContext(
  viewport: StackViewport
): PlayClipContext {
  const imageIds = viewport.getImageIds();

  return {
    get numScrollSteps(): number {
      return imageIds.length;
    },
    get currentStepIndex(): number {
      return viewport.getTargetImageIdIndex();
    },
    get frameTimeVectorEnabled(): boolean {
      // It is always in acquired orientation
      return true;
    },
    getScrollStepsInfo(): ScrollStepsInfo {
      const currentImageIdIndex = viewport.getTargetImageIdIndex();

      return {
        numScrollSteps: imageIds.length,
        currentStepIndex: currentImageIdIndex,
      };
    },
    scroll(delta: number): void {
      scroll(viewport, { delta, debounceLoading: debounced });
    },
    // scroll(options: ScrollOptions): ScrollResult {
    //   const { loop, reverse } = options;
    //   const currentImageIdIndex = viewport.getTargetImageIdIndex();

    //   const imageCount = imageIds.length;
    //   const scrollResult = { stop: false };
    //   let newImageIdIndex = currentImageIdIndex + (reverse ? -1 : 1);

    //   if (!loop && (newImageIdIndex < 0 || newImageIdIndex >= imageCount)) {
    //     scrollResult.stop = true;
    //     return scrollResult;
    //   }

    //   // Loop around if we go outside the stack
    //   if (newImageIdIndex >= imageCount) {
    //     newImageIdIndex = 0;
    //   } else if (newImageIdIndex < 0) {
    //     newImageIdIndex = imageCount - 1;
    //   }

    //   const delta = newImageIdIndex - currentImageIdIndex;

    //   if (delta) {
    //     scroll(viewport, { delta, debounceLoading: debounced });
    //   }

    //   return scrollResult;
    // },
  };
}

function createVolumeViewportPlayClipContext(
  viewport: VolumeViewport,
  volume: Types.IImageVolume
): PlayClipContext {
  const actorEntry = viewport.getDefaultActor();

  if (!actorEntry) {
    console.warn('No actor found');
  }

  const volumeId = actorEntry.uid;
  const cachedScrollInfo = {
    viewPlaneNormal: vec3.create(),
    scrollInfo: null,
  };

  const getScrollInfo = () => {
    const camera = viewport.getCamera();
    const updateCache =
      !cachedScrollInfo.scrollInfo ||
      !vec3.equals(camera.viewPlaneNormal, cachedScrollInfo.viewPlaneNormal);

    // Number of steps would change only after rotating the volume so it
    // caches the result and recomputes only when necessary. Until it is
    // rotated the current frame is updated locally
    if (updateCache) {
      const scrollInfo = csUtils.getVolumeViewportScrollInfo(
        viewport,
        volumeId
      );

      cachedScrollInfo.viewPlaneNormal = camera.viewPlaneNormal;
      cachedScrollInfo.scrollInfo = scrollInfo;
    }

    return cachedScrollInfo.scrollInfo;
  };

  return {
    get numScrollSteps(): number {
      return getScrollInfo().numScrollSteps;
    },
    get currentStepIndex(): number {
      return getScrollInfo().currentStepIndex;
    },
    get frameTimeVectorEnabled(): boolean {
      const camera = viewport.getCamera();
      const volumeViewPlaneNormal = volume.direction
        .slice(6, 9)
        .map((x) => -x) as Types.Point3;
      const dot = vec3.dot(volumeViewPlaneNormal, camera.viewPlaneNormal);

      // Check if the volume is in acquired orientation
      // it may be flipped or rotated in plane
      return glMatrix.equals(dot, 1);
    },
    getScrollStepsInfo(): ScrollStepsInfo {
      const { numScrollSteps, currentStepIndex } = getScrollInfo();

      return {
        numScrollSteps,
        currentStepIndex,
      };
    },
    scroll(delta: number): void {
      getScrollInfo().currentStepIndex += delta;
      scroll(viewport, { delta });
    },
    // scroll(options: ScrollOptions): ScrollResult {
    //   const { loop, reverse } = options;
    //   const scrollResult = { stop: false };
    //   const scrollInfo = getScrollInfo();
    //   const { numScrollSteps, currentStepIndex } = scrollInfo;
    //   let newFrameIndex = currentStepIndex + (reverse ? -1 : 1);

    //   if (!loop && (newFrameIndex < 0 || newFrameIndex >= numScrollSteps)) {
    //     scrollResult.stop = true;
    //     return scrollResult;
    //   }

    //   // Loop around if we go outside the stack
    //   if (newFrameIndex >= numScrollSteps) {
    //     newFrameIndex = 0;
    //   } else if (newFrameIndex < 0) {
    //     newFrameIndex = numScrollSteps - 1;
    //   }

    //   const delta = newFrameIndex - currentStepIndex;

    //   if (delta) {
    //     scrollInfo.currentStepIndex = newFrameIndex;
    //     scroll(viewport, { delta });
    //   }

    //   return scrollResult;
    // },
  };
}

function createDynamicVolumeViewportPlayClipContext(
  volume: Types.IDynamicImageVolume
): PlayClipContext {
  return {
    get numScrollSteps(): number {
      return volume.numTimePoints;
    },
    get currentStepIndex(): number {
      return volume.timePointIndex;
    },
    get frameTimeVectorEnabled(): boolean {
      // Looping throught time does not uses frameTimeVector
      return false;
    },
    getScrollStepsInfo(): ScrollStepsInfo {
      const { numScrollSteps, currentStepIndex } = this;

      return {
        numScrollSteps,
        currentStepIndex,
      };
    },
    scroll(delta: number): void {
      volume.timePointIndex += delta;
    },
    // scroll(options: ScrollOptions): ScrollResult {
    //   const { loop, reverse } = options;
    //   const scrollResult = { stop: false };
    //   const { numScrollSteps, currentStepIndex } = this;
    //   let newTimepointIndex = currentStepIndex + (reverse ? -1 : 1);
    //   const timePointIndexOutOfRange =
    //     newTimepointIndex < 0 || newTimepointIndex >= numScrollSteps;

    //   if (!loop && timePointIndexOutOfRange) {
    //     scrollResult.stop = true;
    //     return scrollResult;
    //   }

    //   // Loop around if we go outside the stack
    //   if (newTimepointIndex >= numScrollSteps) {
    //     newTimepointIndex = 0;
    //   } else if (newTimepointIndex < 0) {
    //     newTimepointIndex = numScrollSteps - 1;
    //   }

    //   const delta = newTimepointIndex - currentStepIndex;

    //   if (delta) {
    //     volume.timePointIndex += delta;
    //   }

    //   return scrollResult;
    // },
  };
}

function createPlayClipContext(viewport): PlayClipContext {
  if (viewport instanceof StackViewport) {
    return createStackViewportPlayClipContext(viewport);
  }

  if (viewport instanceof VolumeViewport) {
    const actorEntry = viewport.getDefaultActor();

    if (!actorEntry) {
      console.warn('No actor found');
    }

    const volumeId = actorEntry.uid;
    const volume = cache.getVolume(volumeId);

    if (cine4DEnabled && volume.isDynamicVolume()) {
      return createDynamicVolumeViewportPlayClipContext(
        <Types.IDynamicImageVolume>volume
      );
    }

    return createVolumeViewportPlayClipContext(viewport, volume);
  }

  throw new Error('Unknown viewport type');
}

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
  const playClipContext = createPlayClipContext(viewport);
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
    playClipData.frameTimeVector.length === playClipContext.numScrollSteps &&
    playClipContext.frameTimeVectorEnabled
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
    // const scrollResult = playClipContext.scroll({
    //   loop,
    //   reverse: playClipData.reverse,
    // });

    // const { loop, reverse } = options;
    // const scrollResult = { stop: false };
    const { numScrollSteps, currentStepIndex } = playClipContext;
    console.log('>>>>> numScrollSteps :: ', numScrollSteps);
    console.log('>>>>> currentStepIndex :: ', currentStepIndex);
    let newStepIndex = currentStepIndex + (playClipData.reverse ? -1 : 1);
    console.log('>>>>> newStepIndex :: ', newStepIndex);
    const newStepIndexOutOfRange =
      newStepIndex < 0 || newStepIndex >= numScrollSteps;

    if (!loop && newStepIndexOutOfRange) {
      console.log('>>>>> STOP!');
      _stopClipWithData(playClipData);
      const eventDetail = { element };

      triggerEvent(element, CINE_EVENTS.CLIP_STOPPED, eventDetail);
      return;
    }

    // Loop around if newStepIndex is out of range
    if (newStepIndex >= numScrollSteps) {
      console.log('>>>>> newStepIndex :: SET TO ZERO');
      newStepIndex = 0;
    } else if (newStepIndex < 0) {
      newStepIndex = numScrollSteps - 1;
      console.log(`>>>>> newStepIndex :: SET TO ${newStepIndex}`);
    }

    const delta = newStepIndex - currentStepIndex;

    if (delta) {
      console.log(`>>>>> delta :: `, delta);
      playClipContext.scroll(delta);
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
          // playClipTimeouts[stackData.targetImageIdIndex]
          playClipTimeouts[playClipContext.currentStepIndex]
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
  if (!enabledElement) return;
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
