import { Events } from '../enums';
import { StackViewport, VolumeViewport } from '../RenderingEngine';
import type {
  ScrollOptions,
  EventTypes,
  IViewport,
  IVideoViewport,
  IStackViewport,
} from '../types';
import getVolumeViewportScrollInfo from './getVolumeViewportScrollInfo';
import snapFocalPointToSlice from './snapFocalPointToSlice';
import getEnabledElement from '../getEnabledElement';
import triggerEvent from './triggerEvent';
import eventTarget from '../eventTarget';

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
  viewport: IViewport | IVideoViewport,
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
        (viewport as IStackViewport).getImageIds().length - 1 ||
      imageIdIndex + delta < 0
    ) {
      const eventData: EventTypes.StackScrollOutOfBoundsEventDetail = {
        imageIdIndex,
        direction: delta,
      };
      triggerEvent(eventTarget, Events.STACK_SCROLL_OUT_OF_BOUNDS, eventData);
    }

    (viewport as IStackViewport).scroll(
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
    getVolumeViewportScrollInfo(viewport, volumeId, useSlabThickness);

  if (!sliceRangeInfo) {
    return;
  }

  const { sliceRange, spacingInNormalDirection, camera } = sliceRangeInfo;
  const { focalPoint, viewPlaneNormal, position } = camera;

  const { newFocalPoint, newPosition } = snapFocalPointToSlice(
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
    viewport.getCurrentImageId() // Check that we are in the plane of acquisition
  ) {
    // One common use case of this trigger might be to load the next
    // volume in a time series or the next segment of a partially loaded volume.

    triggerEvent(
      eventTarget,
      Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS,
      VolumeScrollEventDetail
    );
  } else {
    triggerEvent(
      eventTarget,
      Events.VOLUME_VIEWPORT_SCROLL,
      VolumeScrollEventDetail
    );
  }
}
