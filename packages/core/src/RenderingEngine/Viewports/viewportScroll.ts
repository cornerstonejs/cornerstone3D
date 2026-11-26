import { Events, ViewportType } from '../../enums';
import { SpeedUnit } from '../../enums/VideoEnums';
import type {
  ActorSliceRange,
  EventTypes,
  ICamera,
  IViewport,
  ScrollOptions,
} from '../../types';
import eventTarget from '../../eventTarget';
import getTargetVolumeAndSpacingInNormalDir from '../../utilities/getTargetVolumeAndSpacingInNormalDir';
import { getVolumeId as getVolumeIdOfSpecifier } from '../../utilities/getVolumeId';
import snapFocalPointToSlice from '../../utilities/snapFocalPointToSlice';
import triggerEvent from '../../utilities/triggerEvent';
import {
  getGridSliceIndex,
  getSliceGrid,
} from '../../utilities/volumeSliceGrid';
import { getViewportContentMode } from '../../utilities/viewportCapabilities';
import type PlanarViewport from './Planar/PlanarViewport';
import { getPlanarVolumeSliceRange } from './Planar/planarSliceBasis';
import { resolveSlabThickness } from './Planar/planarVolumeSliceBlendMode';
import type VideoViewport from './Video/VideoViewport';
import { getVideoScrollStepFrames } from './Video/videoViewportCamera';

/**
 * A viewport that scrolls through the images of a list of image ids by an
 * index: a video viewport, or one that an application registers.
 */
type ImageScrollViewport = IViewport & {
  getImageIds(): string[];
  getCurrentImageIdIndex(): number;
  scroll(delta: number, debounceLoading?: boolean, loop?: boolean): unknown;
};

/**
 * A video viewport that goes to a frame by its number, as the video viewport
 * of the core does.
 */
type FrameViewport = ImageScrollViewport &
  Pick<VideoViewport, 'getNumberOfFrames' | 'pause' | 'setFrameNumber'>;

/**
 * Where one scroll request went: the position it stopped at, the number of
 * positions, whether it was stopped at the first or the last position short
 * of the position it asked for, and the keys of the detail of
 * SCROLL_OUT_OF_BOUNDS that only the family knows, read when it fires.
 */
type ScrollOutcome = {
  sliceIndex: number;
  numberOfSlices: number;
  clamped: boolean;
  requestedSliceIndex: number;
  result: Promise<string | undefined>;
  outOfBounds: () => Pick<
    EventTypes.ScrollOutOfBoundsEventDetail,
    'volumeId' | 'imageId'
  >;
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
 * The number of steps and the current step of a volume scroll: the slice
 * grid of the range with the step (`utilities/volumeSliceGrid`), which
 * `snapFocalPointToSlice` moves on.
 */
export function countPlanarVolumeScrollSteps({
  sliceRange,
  spacingInNormalDirection,
}: PlanarVolumeScrollSteps): {
  numScrollSteps: number;
  currentStepIndex: number;
} {
  const { min, max, current } = sliceRange;
  const grid = getSliceGrid(min, max, spacingInNormalDirection);

  return {
    numScrollSteps: grid.maxSliceIndex,
    currentStepIndex: getGridSliceIndex(grid, current),
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
 * The position that a scroll goes to among `numberOfSlices` positions: the
 * asked position, wrapped around with `loop`, else kept between the first
 * and the last one. With no position the asked one stays, so that the
 * viewport answers for it as it did before.
 */
function scrollTarget(
  requestedSliceIndex: number,
  numberOfSlices: number,
  loop: boolean | undefined
): { sliceIndex: number; clamped: boolean } {
  if (numberOfSlices <= 0) {
    return { sliceIndex: requestedSliceIndex, clamped: false };
  }

  if (loop) {
    return {
      sliceIndex:
        ((requestedSliceIndex % numberOfSlices) + numberOfSlices) %
        numberOfSlices,
      clamped: false,
    };
  }

  const sliceIndex = Math.min(
    Math.max(requestedSliceIndex, 0),
    numberOfSlices - 1
  );

  return { sliceIndex, clamped: sliceIndex !== requestedSliceIndex };
}

/**
 * Scrolls a planar viewport in stack or volume mode. A position is an image
 * of a stack or a slice of the source volume along the view in any
 * orientation, or a step of `getPlanarVolumeScrollSteps` with `scrollSlabs`
 * or the `volumeId` of another volume.
 */
function scrollPlanar(
  viewport: PlanarViewport,
  options: ScrollOptions
): ScrollOutcome {
  const { delta, loop } = options;
  const steps = getPlanarVolumeScrollSteps(viewport, options);
  const counted = steps ? countPlanarVolumeScrollSteps(steps) : undefined;
  const numberOfSlices = counted
    ? counted.numScrollSteps + 1
    : viewport.getNumberOfSlices();
  const currentSliceIndex = counted
    ? counted.currentStepIndex
    : viewport.getCurrentImageIdIndex();
  const requestedSliceIndex = currentSliceIndex + delta;
  const { sliceIndex, clamped } = scrollTarget(
    requestedSliceIndex,
    numberOfSlices,
    loop
  );
  let result: Promise<string | undefined>;

  if (steps) {
    scrollPlanarVolumeSteps(viewport, steps, sliceIndex - currentSliceIndex);
    result = Promise.resolve(viewport.getCurrentImageId());
  } else {
    result = viewport.setImageIdIndex(sliceIndex);
  }

  return {
    sliceIndex,
    numberOfSlices,
    clamped,
    requestedSliceIndex,
    result,
    outOfBounds: () => ({
      volumeId:
        viewport.getCurrentMode() === 'volume'
          ? (options.volumeId ?? viewport.getVolumeId())
          : undefined,
      imageId: viewport.getCurrentImageId(),
    }),
  };
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
 * Tells whether a viewport goes to a frame by its number, as the video
 * viewport of the core does.
 */
function isFrameViewport(
  viewport: ImageScrollViewport
): viewport is FrameViewport {
  const frames = viewport as Partial<FrameViewport>;

  return (
    typeof frames.setFrameNumber === 'function' &&
    typeof frames.getNumberOfFrames === 'function' &&
    typeof frames.pause === 'function'
  );
}

/**
 * Scrolls a viewport through its images by an index: a video, whose
 * positions are its frames and whose step is the `scrollStep` of its view
 * state, or a viewport that an application registers. A video of the core
 * pauses and goes to the frame; another viewport scrolls itself with the
 * request, and the positions only tell whether it stopped at an end.
 */
function scrollImages(
  viewport: ImageScrollViewport,
  options: ScrollOptions
): ScrollOutcome {
  const { delta, loop, debounceLoading } = options;
  const frameViewport = isFrameViewport(viewport) ? viewport : undefined;
  const numberOfSlices = frameViewport
    ? frameViewport.getNumberOfFrames()
    : viewport.getImageIds().length;
  const requestedSliceIndex =
    viewport.getCurrentImageIdIndex() + delta * framesPerScrollStep(viewport);
  const { sliceIndex, clamped } = scrollTarget(
    requestedSliceIndex,
    numberOfSlices,
    loop
  );

  if (!frameViewport) {
    viewport.scroll(delta, debounceLoading, loop);
  } else if (numberOfSlices > 0) {
    frameViewport.pause();
    frameViewport.setFrameNumber(sliceIndex + 1);
  }

  return {
    sliceIndex,
    numberOfSlices,
    clamped,
    requestedSliceIndex,
    result: Promise.resolve(undefined),
    outOfBounds: () => ({
      imageId: viewport.getImageIds()[Math.round(sliceIndex)],
    }),
  };
}

/**
 * Returns the source display set of a viewport: the one a planar viewport
 * names, or the display set of the role `source` of another viewport, or
 * its first display set.
 */
function getSourceDisplaySetIdOf(viewport: IViewport): string | undefined {
  const planar = viewport as Partial<
    Pick<PlanarViewport, 'getSourceDisplaySetId'>
  >;

  if (typeof planar.getSourceDisplaySetId === 'function') {
    return planar.getSourceDisplaySetId();
  }

  const displaySets =
    typeof viewport.getDisplaySets === 'function'
      ? viewport.getDisplaySets()
      : [];
  const source = displaySets.find(
    ({ options }) => (options as { role?: string })?.role === 'source'
  );

  return (source ?? displaySets[0])?.displaySetId;
}

/**
 * Fires SCROLL_OUT_OF_BOUNDS for a scroll that stopped at the first or the
 * last position, on the element of the viewport and on `eventTarget`: an
 * event of the core does not bubble, so a listener of either one hears it.
 */
function triggerScrollOutOfBounds(
  viewport: IViewport,
  { delta }: ScrollOptions,
  outcome: ScrollOutcome
): void {
  const { volumeId, imageId } = outcome.outOfBounds();
  const detail: EventTypes.ScrollOutOfBoundsEventDetail = {
    viewportId: viewport.id,
    renderingEngineId: viewport.renderingEngineId,
    displaySetId: getSourceDisplaySetIdOf(viewport),
    volumeId,
    sliceIndex: outcome.sliceIndex,
    numberOfSlices: outcome.numberOfSlices,
    delta,
    direction: outcome.requestedSliceIndex < 0 ? -1 : 1,
    imageId,
  };

  triggerEvent(viewport.element, Events.SCROLL_OUT_OF_BOUNDS, detail);
  triggerEvent(eventTarget, Events.SCROLL_OUT_OF_BOUNDS, detail);
}

/**
 * Scrolls a viewport by `options.delta` positions. It is the one scroll of
 * the core: `utilities.scroll`, `scroll()` of a planar viewport and
 * `scroll()` of a video viewport call it, so that one request gives the same
 * position and the same event by each of them.
 *
 * A position is an image of a stack, a slice of a volume along the view in
 * any orientation, a step of the slab thickness with `scrollSlabs` while the
 * source has a slab, a slice of another volume of the viewport with its
 * `volumeId`, or a frame of a video, which a step of its `scrollStep` moves
 * by.
 *
 * Without `loop` the scroll stops at the first and at the last position.
 * When it stops there short of the position it asked for,
 * SCROLL_OUT_OF_BOUNDS fires on the element of the viewport and on
 * `eventTarget`, once each, after the viewport moved. With `loop` it wraps
 * around and fires nothing. A scroll inside the range fires nothing either:
 * NEW_IMAGE and CAMERA_MODIFIED report it.
 *
 * @param viewport - A planar viewport, a video viewport, or a viewport that
 * scrolls through image ids by an index. A planar viewport with nothing
 * mounted takes the planar arm too, where `setImageIdIndex` rejects as it
 * did: the other arm would call its `scroll()`, which calls this function.
 * @param options - The delta and the options of the scroll.
 * @returns The image id of the position on a planar viewport, as
 * `setImageIdIndex` gives it; with a step of a slab or of another volume,
 * the image on display, undefined out of the acquisition plane; undefined on
 * another viewport.
 */
export default function scrollViewport(
  viewport: IViewport,
  options: ScrollOptions
): Promise<string | undefined> {
  const mode = getViewportContentMode(viewport);
  const outcome =
    mode === 'stack' ||
    mode === 'volume' ||
    viewport.type === ViewportType.PLANAR
      ? scrollPlanar(viewport as unknown as PlanarViewport, options)
      : scrollImages(viewport as ImageScrollViewport, options);

  if (outcome.clamped) {
    triggerScrollOutOfBounds(viewport, options, outcome);
  }

  return outcome.result;
}
