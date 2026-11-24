import { Events } from '../enums';
import { SpeedUnit } from '../enums/VideoEnums';
import type {
  ActorSliceRange,
  ScrollOptions,
  EventTypes,
  ICamera,
  IViewport,
} from '../types';
import type PlanarViewport from '../RenderingEngine/Viewports/Planar/PlanarViewport';
import type VideoViewport from '../RenderingEngine/Viewports/Video/VideoViewport';
import { getVideoScrollStepFrames } from '../RenderingEngine/Viewports/Video/videoViewportCamera';
import { getPlanarVolumeSliceRange } from '../RenderingEngine/Viewports/Planar/planarSliceBasis';
import { resolveSlabThickness } from '../RenderingEngine/Viewports/Planar/planarVolumeSliceBlendMode';
import getTargetVolumeAndSpacingInNormalDir from './getTargetVolumeAndSpacingInNormalDir';
import { getVolumeId as getVolumeIdOfSpecifier } from './getVolumeId';
import snapFocalPointToSlice from './snapFocalPointToSlice';
import getEnabledElement from '../getEnabledElement';
import triggerEvent from './triggerEvent';
import eventTarget from '../eventTarget';
import {
  getViewportContentMode,
  viewportIsInStackMode,
} from './viewportCapabilities';

/**
 * A viewport that scrolls through the images of a list of image ids: a
 * planar, video or ECG viewport.
 */
type ImageScrollViewport = IViewport & {
  getImageIds(): string[];
  getCurrentImageIdIndex(): number;
  scroll(delta: number, debounceLoading?: boolean, loop?: boolean): unknown;
};

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
  viewport: IViewport,
  options: ScrollOptions
): void {
  // check if viewport is disabled then throw error
  const enabledElement = getEnabledElement(viewport.element);

  if (!enabledElement) {
    throw new Error('Scroll::Viewport is not enabled (it might be disabled)');
  }

  if (
    viewportIsInStackMode(viewport) &&
    (viewport as ImageScrollViewport).getImageIds().length === 0
  ) {
    throw new Error('Scroll::Stack Viewport has no images');
  }

  const { delta } = options;

  // An ECG scrolls in time, and has no slice bounds.
  if (getViewportContentMode(viewport) === 'ecg') {
    (viewport as ImageScrollViewport).scroll(delta);
    return;
  }

  if (
    typeof (viewport as ImageScrollViewport).getCurrentImageIdIndex !==
      'function' ||
    typeof (viewport as ImageScrollViewport).scroll !== 'function'
  ) {
    // Viewports without index-based scrolling (e.g. 3D volume
    // rendering) ignore scroll requests instead of throwing.
    return;
  }

  if (isPlanarViewport(viewport)) {
    scrollPlanar(viewport, options);
    return;
  }

  const imageIdIndex = (
    viewport as ImageScrollViewport
  ).getCurrentImageIdIndex();
  const frames = delta * framesPerScrollStep(viewport);

  if (
    imageIdIndex + frames >
      (viewport as ImageScrollViewport).getImageIds().length - 1 ||
    imageIdIndex + frames < 0
  ) {
    const eventData: EventTypes.StackScrollOutOfBoundsEventDetail = {
      imageIdIndex,
      direction: delta,
    };
    triggerEvent(eventTarget, Events.STACK_SCROLL_OUT_OF_BOUNDS, eventData);
  }

  (viewport as ImageScrollViewport).scroll(
    delta,
    options.debounceLoading,
    options.loop
  );
}

/**
 * The frames that one scroll step moves: the scroll step of the view state
 * on a video, one image on any other viewport. The frame rate is read only
 * for a step in seconds, and only from a viewport that has `getFrameRate`,
 * which a registered video viewport need not have: without it a step in
 * seconds is one frame.
 */
function framesPerScrollStep(viewport: IViewport): number {
  if (getViewportContentMode(viewport) !== 'video') {
    return 1;
  }

  const video = viewport as unknown as Pick<VideoViewport, 'getViewState'> &
    Partial<Pick<VideoViewport, 'getFrameRate'>>;
  const viewState = video.getViewState();

  if (viewState.scrollStep?.unit !== SpeedUnit.SECOND) {
    return getVideoScrollStepFrames(viewState, undefined);
  }

  if (typeof video.getFrameRate !== 'function') {
    return 1;
  }

  return getVideoScrollStepFrames(viewState, video.getFrameRate());
}

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
 * Whether the viewport is a next planar viewport in stack or volume mode,
 * whose scroll options this utility works out.
 */
function isPlanarViewport(viewport: unknown): viewport is PlanarViewport {
  const mode = getViewportContentMode(viewport);

  return mode === 'stack' || mode === 'volume';
}

/**
 * The steps of a scroll of a planar viewport when a step is not one slice of
 * its source, as the legacy volume viewport steps:
 * - with `scrollSlabs`, while the appearance of the source has a slab, a
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

  const sourceDisplaySetId = viewport.getSourceDisplaySetId();
  const slabThickness = resolveSlabThickness(
    sourceDisplaySetId
      ? viewport.getDisplaySetAppearance(sourceDisplaySetId)?.slabThickness
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
      viewport,
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
 *   last slice.
 * - `loop` wraps at both ends instead, in both modes.
 * - `scrollSlabs` makes a step the slab thickness of the source in volume
 *   mode. A stack has no slab: a step stays one image.
 * - `volumeId` names another volume of the viewport whose spacing along the
 *   view gives the step in volume mode. A stack has no other volume: a step
 *   stays one image.
 *
 * The events are those of the legacy viewport of the mode. In stack mode, a
 * scroll asked to go past an end fires STACK_SCROLL_OUT_OF_BOUNDS before it
 * moves, as the legacy stack viewport did. In volume mode, every scroll fires
 * one volume scroll event after it moves, as the legacy volume viewport did
 * (see `triggerVolumeScrollEvent`).
 */
function scrollPlanar(viewport: PlanarViewport, options: ScrollOptions) {
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
  const isVolumeMode = viewport.getCurrentMode() === 'volume';

  if (
    !isVolumeMode &&
    (desiredStepIndex < 0 || desiredStepIndex > numberOfSteps - 1)
  ) {
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
  } else {
    viewport.scroll(stepDelta);
  }

  if (isVolumeMode) {
    triggerVolumeScrollEvent(viewport, options, {
      currentStepIndex,
      desiredStepIndex,
      numScrollSteps: numberOfSteps - 1,
    });
  }
}

/**
 * Fires the event of a scroll of a planar viewport in volume mode, with the
 * detail of the legacy volume viewport: VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS
 * when the scroll was asked to go past an end and the view shows an image of
 * the volume (the acquisition plane), VOLUME_VIEWPORT_SCROLL otherwise.
 * `volumeId` is the one of the options, or the volume that the viewport
 * shows when the options give none (the legacy event gave undefined there).
 * `currentImageId` is the image shown after the scroll, undefined out of the
 * acquisition plane. A volume of one slice has no step and fires nothing.
 */
function triggerVolumeScrollEvent(
  viewport: PlanarViewport,
  { volumeId, delta }: ScrollOptions,
  {
    currentStepIndex,
    desiredStepIndex,
    numScrollSteps,
  }: Pick<
    EventTypes.VolumeScrollOutOfBoundsEventDetail,
    'currentStepIndex' | 'desiredStepIndex' | 'numScrollSteps'
  >
): void {
  if (numScrollSteps <= 0) {
    return;
  }

  const currentImageId = viewport.getCurrentImageId();
  const eventData: EventTypes.VolumeScrollOutOfBoundsEventDetail = {
    volumeId: volumeId ?? viewport.getVolumeId(),
    viewport,
    delta,
    desiredStepIndex,
    currentStepIndex,
    numScrollSteps,
    currentImageId,
  };
  const outOfBounds = desiredStepIndex > numScrollSteps || desiredStepIndex < 0;

  triggerEvent(
    eventTarget,
    outOfBounds && currentImageId
      ? Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS
      : Events.VOLUME_VIEWPORT_SCROLL,
    eventData
  );
}
