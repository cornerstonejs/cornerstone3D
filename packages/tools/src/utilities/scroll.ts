import {
  StackViewport,
  Types,
  VolumeViewport,
  eventTarget,
  EVENTS,
  utilities as csUtils,
} from '@cornerstonejs/core';
import { ScrollOptions, EventTypes } from '../types';

/**
 * It scrolls one slice in the Stack or Volume Viewport, it uses the options provided
 * to determine the slice to scroll to. For Stack Viewport, it scrolls in the 1 or -1
 * direction, for Volume Viewport, it uses the camera and focal point to determine the
 * slice to scroll to based on the spacings.
 * @param viewport - The viewport in which to scroll
 * @param options - Options to use for scrolling, including direction, invert, and volumeId
 * @returns
 */
export default function scroll(
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  options: ScrollOptions
): void {
  const { type: viewportType } = viewport;
  const { volumeId, delta } = options;

  if (viewport instanceof StackViewport) {
    viewport.scroll(delta, options.debounceLoading, options.loop);
  } else if (viewport instanceof VolumeViewport) {
    scrollVolume(viewport, volumeId, delta);
  } else {
    throw new Error(`Not implemented for Viewport Type: ${viewportType}`);
  }
}

export function scrollVolume(
  viewport: VolumeViewport,
  volumeId: string,
  delta: number
) {
  const { numScrollSteps, currentStepIndex, sliceRangeInfo } =
    csUtils.getVolumeViewportScrollInfo(viewport, volumeId);

  if (!sliceRangeInfo) {
    return;
  }

  const { sliceRange, spacingInNormalDirection, camera } = sliceRangeInfo;
  const { focalPoint, viewPlaneNormal, position } = camera;

  const { newFocalPoint, newPosition } = csUtils.snapFocalPointToSlice(
    focalPoint,
    position,
    sliceRange,
    viewPlaneNormal,
    spacingInNormalDirection,
    delta
  );

  viewport.setCamera({
    focalPoint: newFocalPoint,
    position: newPosition,
  });
  viewport.render();

  const desiredStepIndex = currentStepIndex + delta;

  if (
    (desiredStepIndex > numScrollSteps || desiredStepIndex < 0) &&
    viewport.getCurrentImageId() // Check that we are in the plane of acquistion
  ) {
    // One common use case of this trigger might be to load the next
    // volume in a time series or the next segment of a partially loaded volume.

    const VolumeScrollEventDetail = {
      volumeId,
      viewport,
      delta,
      desiredStepIndex,
      currentStepIndex,
      numScrollSteps,
      currentImageId: viewport.getCurrentImageId(),
    };

    csUtils.triggerEvent(
      eventTarget,
      EVENTS.VOLUME_SCROLL_OUT_OF_BOUNDS,
      VolumeScrollEventDetail as EventTypes.VolumeScrollOutOfBoundsEventDetail
    );
  }
}
