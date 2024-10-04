import type { Types } from '@cornerstonejs/core';
import {
  StackViewport,
  VolumeViewport,
  eventTarget,
  EVENTS,
  utilities as csUtils,
  getEnabledElement,
} from '@cornerstonejs/core';
import type { ScrollOptions, EventTypes } from '../types';

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
  viewport: Types.IViewport | Types.IVideoViewport,
  options: ScrollOptions
): void {
  // check if viewport is disabled then throw error
  const enabledElement = getEnabledElement(viewport.element);

  if (!enabledElement) {
    throw new Error('Scroll::Viewport is not enabled (it might be disabled)');
  }

  if (
    viewport instanceof StackViewport &&
    viewport.getImageIds().length === 0
  ) {
    throw new Error('Scroll::Stack Viewport has no images');
  }

  const { volumeId, delta, scrollSlabs } = options;

  if (viewport instanceof VolumeViewport) {
    scrollVolume(viewport, volumeId, delta, scrollSlabs);
  } else {
    const imageIdIndex = viewport.getCurrentImageIdIndex();

    if (
      imageIdIndex + delta >
        (viewport as Types.IStackViewport).getImageIds().length - 1 ||
      imageIdIndex + delta < 0
    ) {
      const eventData: Types.EventTypes.StackScrollOutOfBoundsEventDetail = {
        imageIdIndex,
        direction: delta,
      };
      csUtils.triggerEvent(
        eventTarget,
        EVENTS.STACK_SCROLL_OUT_OF_BOUNDS,
        eventData
      );
    }

    (viewport as Types.IStackViewport).scroll(
      delta,
      options.debounceLoading,
      options.loop
    );
  }
}

export function scrollVolume(
  viewport: VolumeViewport,
  volumeId: string,
  delta: number,
  scrollSlabs = false
) {
  const useSlabThickness = scrollSlabs;

  const { numScrollSteps, currentStepIndex, sliceRangeInfo } =
    csUtils.getVolumeViewportScrollInfo(viewport, volumeId, useSlabThickness);

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

  const VolumeScrollEventDetail: EventTypes.VolumeScrollOutOfBoundsEventDetail =
    {
      volumeId,
      viewport,
      delta,
      desiredStepIndex,
      currentStepIndex,
      numScrollSteps,
      currentImageId: viewport.getCurrentImageId(),
    };

  if (
    (desiredStepIndex > numScrollSteps || desiredStepIndex < 0) &&
    viewport.getCurrentImageId() // Check that we are in the plane of acquistion
  ) {
    // One common use case of this trigger might be to load the next
    // volume in a time series or the next segment of a partially loaded volume.

    csUtils.triggerEvent(
      eventTarget,
      EVENTS.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS,
      VolumeScrollEventDetail
    );
  } else {
    csUtils.triggerEvent(
      eventTarget,
      EVENTS.VOLUME_VIEWPORT_SCROLL,
      VolumeScrollEventDetail
    );
  }
}
