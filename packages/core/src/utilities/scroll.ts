import { Events } from '../enums';
import type {
  ActorSliceRange,
  ScrollOptions,
  EventTypes,
  ICamera,
  IViewport,
  IVideoViewport,
  IStackViewport,
  IVolumeViewport,
} from '../types';
import type PlanarViewport from '../RenderingEngine/GenericViewport/Planar/PlanarViewport';
import { getPlanarVolumeSliceRange } from '../RenderingEngine/GenericViewport/Planar/planarSliceBasis';
import { resolveSlabThickness } from '../RenderingEngine/GenericViewport/Planar/planarVolumeSliceBlendMode';
import getTargetVolumeAndSpacingInNormalDir from './getTargetVolumeAndSpacingInNormalDir';
import { getVolumeId as getVolumeIdOfSpecifier } from './getVolumeId';
import getVolumeViewportScrollInfo from './getVolumeViewportScrollInfo';
import snapFocalPointToSlice from './snapFocalPointToSlice';
import getEnabledElement from '../getEnabledElement';
import triggerEvent from './triggerEvent';
import eventTarget from '../eventTarget';
import {
  getViewportContentMode,
  isGenericViewport,
  viewportIsInStackMode,
} from './viewportCapabilities';

/**
 * It scrolls one slice in the Stack or Volume Viewport, it uses the options provided
 * to determine the slice to scroll to. For Stack Viewport, it scrolls in the 1 or -1
 * direction, for Volume Viewport, it uses the camera and focal point to determine the
 * slice to scroll to based on the spacings.
 *
 * A next planar viewport takes the options here, in stack mode and in volume
 * mode (see `scrollNextPlanar`): `delta`, `loop`, `scrollSlabs` and
 * `volumeId`. It has no debounce, so `debounceLoading` has no effect on it.
 *
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
    viewportIsInStackMode(viewport) &&
    (viewport as IStackViewport).getImageIds().length === 0
  ) {
    throw new Error('Scroll::Stack Viewport has no images');
  }

  const { volumeId, delta, scrollSlabs } = options;

  if (
    getViewportContentMode(viewport) === 'volume' &&
    !isGenericViewport(viewport)
  ) {
    scrollVolume(viewport as IVolumeViewport, volumeId, delta, scrollSlabs);
  } else {
    // An ECG scrolls in time, and has no slice bounds.
    if (getViewportContentMode(viewport) === 'ecg') {
      (viewport as unknown as IStackViewport).scroll(delta);
      return;
    }

    if (
      typeof (viewport as IStackViewport).getCurrentImageIdIndex !==
        'function' ||
      typeof (viewport as IStackViewport).scroll !== 'function'
    ) {
      // Viewports without index-based scrolling (e.g. Generic 3D volume
      // rendering) ignore scroll requests instead of throwing.
      return;
    }

    if (isNextPlanarViewport(viewport)) {
      scrollNextPlanar(viewport, options);
      return;
    }

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

    if (getViewportContentMode(viewport) === 'volume') {
      (viewport as ViewportWithScrollOptions).scroll(
        delta,
        options.debounceLoading,
        options.loop,
        { volumeId, scrollSlabs }
      );
      return;
    }

    (viewport as IStackViewport).scroll(
      delta,
      options.debounceLoading,
      options.loop
    );
  }
}

/**
 * A generic viewport in volume mode whose `scroll` also takes the volume
 * options of a scroll. The planar legacy adapter reads them; other viewports
 * ignore the fourth argument.
 */
type ViewportWithScrollOptions = {
  scroll(
    delta: number,
    debounce?: boolean,
    loop?: boolean,
    options?: Pick<ScrollOptions, 'volumeId' | 'scrollSlabs'>
  ): unknown;
};

/**
 * The steps of a scroll of a planar viewport in volume mode that are not the
 * slices of its source: the slice range of the target volume along the view,
 * the step along the normal and the camera they were measured on.
 */
export type PlanarVolumeScrollSteps = {
  camera: ICamera;
  sliceRange: ActorSliceRange;
  spacingInNormalDirection: number;
};

/**
 * Whether the viewport is a next planar viewport, whose scroll options this
 * utility works out. A legacy adapter is not one: the rendering engine was
 * asked for a legacy type (`requestedType`), and the adapter takes the
 * options in its own `scroll`.
 */
function isNextPlanarViewport(viewport: unknown): viewport is PlanarViewport {
  const mode = getViewportContentMode(viewport);
  const { requestedType, type } = viewport as IViewport;

  return (
    isGenericViewport(viewport) &&
    (mode === 'stack' || mode === 'volume') &&
    (requestedType === undefined || requestedType === type)
  );
}

/**
 * The steps of a scroll of a planar viewport when a step is not one slice of
 * its source, as the legacy volume viewport steps:
 * - with `scrollSlabs`, while the presentation of the source has a slab, a
 *   step is the slab thickness;
 * - with a `volumeId` of another volume that the viewport shows, a step is
 *   the spacing of that volume along the view.
 *
 * Undefined when a step is one slice of the source: without these options,
 * for a `volumeId` that names no other volume of the viewport, and in stack
 * mode, where there is no slab and no other volume.
 */
export function getPlanarVolumeScrollSteps(
  viewport: PlanarViewport,
  { volumeId, scrollSlabs }: Pick<ScrollOptions, 'volumeId' | 'scrollSlabs'>
): PlanarVolumeScrollSteps | undefined {
  if ((!scrollSlabs && !volumeId) || viewport.getCurrentMode() !== 'volume') {
    return;
  }

  const sourceDataId = viewport.getSourceDataId();
  const slabThickness = resolveSlabThickness(
    sourceDataId
      ? viewport.getDisplaySetPresentation(sourceDataId)?.slabThickness
      : undefined
  );
  const stepsBySlab = Boolean(scrollSlabs) && slabThickness > 0;
  const otherVolumeId = volumeId ? getVolumeIdOfSpecifier(volumeId) : undefined;
  const otherVolume =
    Boolean(otherVolumeId) &&
    otherVolumeId !== viewport.getVolumeId() &&
    viewport.hasVolumeId(otherVolumeId);

  if (!stepsBySlab && !otherVolume) {
    return;
  }

  const camera = viewport.getResolvedView()?.toICamera() as ICamera | undefined;

  if (!camera) {
    return;
  }

  const { imageVolume, spacingInNormalDirection } =
    getTargetVolumeAndSpacingInNormalDir(
      viewport as unknown as IVolumeViewport,
      camera,
      otherVolume ? volumeId : undefined
    );
  const sliceRange = imageVolume
    ? getPlanarVolumeSliceRange(
        imageVolume,
        camera.viewPlaneNormal,
        camera.focalPoint
      )
    : undefined;

  if (!sliceRange) {
    return;
  }

  return {
    camera,
    sliceRange,
    spacingInNormalDirection: stepsBySlab
      ? slabThickness
      : spacingInNormalDirection,
  };
}

/**
 * The number of steps and the current step of a volume scroll, as the
 * legacy `getVolumeViewportScrollInfo` counts them.
 */
export function countPlanarVolumeScrollSteps({
  sliceRange,
  spacingInNormalDirection,
}: PlanarVolumeScrollSteps): {
  numScrollSteps: number;
  currentStepIndex: number;
} {
  const { min, max, current } = sliceRange;
  const range = max - min;

  if (range === 0) {
    return { numScrollSteps: 0, currentStepIndex: 0 };
  }

  const numScrollSteps = Math.round(range / spacingInNormalDirection);
  const currentStepIndex = Math.round(
    ((current - min) / range) * numScrollSteps
  );

  return {
    numScrollSteps,
    currentStepIndex: Number.isFinite(currentStepIndex) ? currentStepIndex : 0,
  };
}

/**
 * Moves the slice of a planar viewport in volume mode by a number of steps,
 * as the legacy `scrollVolume` moves it: the slice snaps to the steps of the
 * range and stays inside it.
 */
export function scrollPlanarVolumeSteps(
  viewport: PlanarViewport,
  { camera, sliceRange, spacingInNormalDirection }: PlanarVolumeScrollSteps,
  delta: number
): void {
  const { newFocalPoint } = snapFocalPointToSlice(
    camera.focalPoint,
    camera.position,
    sliceRange,
    camera.viewPlaneNormal,
    spacingInNormalDirection,
    delta
  );

  viewport.setViewState({
    slice: { kind: 'volumePoint', sliceWorldPoint: newFocalPoint },
  });
}

/**
 * Scrolls a next planar viewport by the options, in stack mode and in volume
 * mode.
 *
 * - `delta` is a number of steps. A step is one image of a stack or one
 *   slice of the source volume. The scroll stops at the first and at the
 *   last slice, and fires STACK_SCROLL_OUT_OF_BOUNDS when it is asked to go
 *   past one.
 * - `loop` wraps at both ends instead, in both modes.
 * - `scrollSlabs` makes a step the slab thickness of the source in volume
 *   mode. A stack has no slab: a step stays one image.
 * - `volumeId` names another volume of the viewport whose spacing along the
 *   view gives the step in volume mode. A stack has no other volume: a step
 *   stays one image.
 */
function scrollNextPlanar(viewport: PlanarViewport, options: ScrollOptions) {
  const { delta, loop } = options;
  const steps = getPlanarVolumeScrollSteps(viewport, options);
  const counted = steps ? countPlanarVolumeScrollSteps(steps) : undefined;
  const numberOfSteps = counted
    ? counted.numScrollSteps + 1
    : viewport.getNumberOfSlices();
  const currentStepIndex = counted
    ? counted.currentStepIndex
    : viewport.getCurrentImageIdIndex();
  const desiredStepIndex = currentStepIndex + delta;

  if (desiredStepIndex < 0 || desiredStepIndex > numberOfSteps - 1) {
    const eventData: EventTypes.StackScrollOutOfBoundsEventDetail = {
      imageIdIndex: currentStepIndex,
      direction: delta,
    };

    triggerEvent(eventTarget, Events.STACK_SCROLL_OUT_OF_BOUNDS, eventData);
  }

  const stepDelta =
    loop && numberOfSteps > 0
      ? (((desiredStepIndex % numberOfSteps) + numberOfSteps) % numberOfSteps) -
        currentStepIndex
      : delta;

  if (steps) {
    scrollPlanarVolumeSteps(viewport, steps, stepDelta);
    return;
  }

  viewport.scroll(stepDelta);
}

export function scrollVolume(
  viewport: IVolumeViewport,
  volumeId: string,
  delta: number,
  scrollSlabs = false
) {
  const useSlabThickness = scrollSlabs;

  const { numScrollSteps, currentStepIndex, sliceRangeInfo } =
    getVolumeViewportScrollInfo(viewport, volumeId, useSlabThickness);

  if (numScrollSteps === 0) return;

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
