import { Events, OrientationAxis } from '../../../enums';
import type ImageQualityStatus from '../../../enums/ImageQualityStatus';
import eventTarget from '../../../eventTarget';
import triggerEvent from '../../../utilities/triggerEvent';
import type { EventTypes, IImage } from '../../../types';
import getClosestImageId from '../../../utilities/getClosestImageId';
import { imageQualityStatusOf } from '../../helpers/fidelityIndicator/collectFidelityLines';
import { resolvePlanarViewportView } from './PlanarResolvedView';
import type { PlanarViewState } from './PlanarViewportTypes';
import type {
  PlanarCpuVolumeRendering,
  PlanarSampledSliceRendering,
  PlanarVolumeSliceRendering,
} from './planarRuntimeTypes';

/**
 * Calls `onBetterStage` when a progressive load delivers a better stage of the
 * image that a stack rendering shows, as the legacy stack viewport draws each
 * stage. The progressive loader fires `IMAGE_LOADED` for each stage. A stage
 * that arrives while a load of another index is in flight is ignored.
 *
 * @returns the function that removes the listener
 */
export function subscribeToBetterImageStages(
  rendering: {
    imageQualityStatus?: ImageQualityStatus;
    currentImageIdIndex: number;
    lastRequestedImageIdIndex?: number;
  },
  shownImageId: () => string | undefined,
  onBetterStage: (image: IImage) => void
): () => void {
  const listener = (evt: CustomEvent<{ image?: IImage }>) => {
    const { image } = evt.detail;
    const { currentImageIdIndex, lastRequestedImageIdIndex } = rendering;

    if (
      image?.imageId === shownImageId() &&
      (lastRequestedImageIdIndex ?? currentImageIdIndex) ===
        currentImageIdIndex &&
      imageQualityStatusOf(image) > rendering.imageQualityStatus
    ) {
      onBetterStage(image);
    }
  };

  eventTarget.addEventListener(Events.IMAGE_LOADED, listener);

  return () => eventTarget.removeEventListener(Events.IMAGE_LOADED, listener);
}

interface PlanarImageEventContext {
  viewportId: string;
  renderingEngineId: string;
  viewport: {
    element: HTMLDivElement;
    /**
     * True on the legacy adapter, whose volumes also fire STACK_NEW_IMAGE and
     * VOLUME_NEW_IMAGE as before: at the attach, and for each change of the
     * slice index of any rendering.
     */
    firesLegacyVolumeNewImageEvents?(): boolean;
  };
}

/** The rendering of a volume on any of its three draw paths. */
type PlanarVolumeEventRendering =
  | PlanarCpuVolumeRendering
  | PlanarVolumeSliceRendering
  | PlanarSampledSliceRendering;

/** The volume renderings whose first slice a view state has placed. */
const renderingsWithPlacedSlice = new WeakSet<PlanarVolumeEventRendering>();

/**
 * Fires NEW_IMAGE for the image of a stack that the viewport shows now: the
 * image object and its image id, its index in the stack and the number of
 * images of the stack.
 */
export function triggerPlanarNewImage(
  ctx: PlanarImageEventContext,
  args: { image: IImage; imageIdIndex: number; numberOfSlices: number }
): void {
  const detail: EventTypes.NewImageEventDetail = {
    viewportId: ctx.viewportId,
    renderingEngineId: ctx.renderingEngineId,
    imageIdIndex: args.imageIdIndex,
    numberOfSlices: args.numberOfSlices,
    imageId: args.image.imageId,
    image: args.image,
  };

  triggerEvent(ctx.viewport.element, Events.NEW_IMAGE, detail);
}

/**
 * The image id of the slice of a volume that a view state shows, which is
 * what `viewport.getCurrentImageId()` answers: the source image whose plane
 * the view cuts along. Undefined when the view shows no single source image,
 * as an oblique cut or a reformat. The size of the canvas has no part in it,
 * so none is read.
 */
function getShownVolumeImageId(
  rendering: PlanarVolumeEventRendering,
  viewState: PlanarViewState | undefined
): string | undefined {
  const camera = resolvePlanarViewportView({
    viewState: viewState ?? {},
    rendering,
    renderContext: {},
    canvasDimensions: { canvasHeight: 1, canvasWidth: 1 },
  })?.toICamera();

  if (!camera?.focalPoint || !camera.viewPlaneNormal) {
    return;
  }

  return getClosestImageId(
    rendering.imageVolume,
    camera.focalPoint,
    camera.viewPlaneNormal
  );
}

/**
 * Fires NEW_IMAGE for the slice of a volume that the view state shows:
 * - `imageIdIndex` is the slice index of the view, in any orientation, which
 *   is what `viewport.getCurrentImageIdIndex()` answers. It counts along the
 *   view, which can run against the order of the image ids, so it is not the
 *   place of `imageId` in the image ids.
 * - `numberOfSlices` is the number of slices along the view, which is what
 *   `viewport.getNumberOfSlices()` answers.
 * - `imageId` is the image of the slice on display, which is what
 *   `viewport.getCurrentImageId()` answers. It is undefined when the view
 *   shows no single source image, as an oblique cut or a reformat.
 * - `image` is undefined: a volume has no image object for a slice.
 */
function triggerPlanarVolumeNewImage(
  ctx: PlanarImageEventContext,
  rendering: PlanarVolumeEventRendering,
  viewState: PlanarViewState | undefined
): void {
  const detail: EventTypes.NewImageEventDetail = {
    viewportId: ctx.viewportId,
    renderingEngineId: ctx.renderingEngineId,
    imageIdIndex: rendering.currentImageIdIndex,
    numberOfSlices: rendering.maxImageIdIndex + 1,
    imageId: getShownVolumeImageId(rendering, viewState),
    image: undefined,
  };

  triggerEvent(ctx.viewport.element, Events.NEW_IMAGE, detail);
}

/**
 * Fires STACK_NEW_IMAGE and VOLUME_NEW_IMAGE for the slice index of a volume
 * rendering, with the details that the legacy adapter fired before. Only the
 * legacy adapter fires this pair.
 *
 * STACK_NEW_IMAGE has the slice index when the view is in the acquisition
 * orientation, with the image id `imageIds[imageIdIndex]`, and neither
 * otherwise. VOLUME_NEW_IMAGE has the slice index and the number of slices.
 */
function triggerLegacyPlanarVolumeNewImage(
  ctx: PlanarImageEventContext,
  rendering: PlanarVolumeEventRendering,
  viewState: PlanarViewState | undefined
): void {
  const { currentImageIdIndex, imageIds, maxImageIdIndex } = rendering;
  const orientation = viewState?.orientation;
  const isAcquisitionAligned =
    !orientation ||
    orientation === OrientationAxis.ACQUISITION ||
    (rendering.acquisitionOrientation !== undefined &&
      orientation === rendering.acquisitionOrientation);
  const imageIdIndex =
    isAcquisitionAligned && imageIds[currentImageIdIndex]
      ? currentImageIdIndex
      : undefined;

  triggerEvent(ctx.viewport.element, Events.STACK_NEW_IMAGE, {
    image: undefined,
    imageId: imageIdIndex === undefined ? undefined : imageIds[imageIdIndex],
    imageIdIndex,
    viewportId: ctx.viewportId,
    renderingEngineId: ctx.renderingEngineId,
  });
  triggerEvent(ctx.viewport.element, Events.VOLUME_NEW_IMAGE, {
    imageIndex: currentImageIdIndex,
    numberOfSlices: maxImageIdIndex + 1,
    viewportId: ctx.viewportId,
    renderingEngineId: ctx.renderingEngineId,
  });
}

/**
 * Fires STACK_NEW_IMAGE and VOLUME_NEW_IMAGE of a volume as it is attached,
 * before a view state placed its first slice, with the slice index that the
 * rendering starts with. Only the legacy adapter fires them here, as it did
 * before. NEW_IMAGE does not fire here: it fires once the first slice is
 * placed (see `triggerPlanarVolumeNewImageOfPlacedSlice`), so there is no
 * event for a slice that the viewport never shows.
 */
export function triggerPlanarVolumeNewImageAtAttach(
  ctx: PlanarImageEventContext,
  rendering: PlanarVolumeEventRendering,
  viewState: PlanarViewState | undefined
): void {
  if (ctx.viewport.firesLegacyVolumeNewImageEvents?.()) {
    triggerLegacyPlanarVolumeNewImage(ctx, rendering, viewState);
  }
}

/**
 * Fires the new image events of a volume rendering now that a view state
 * placed its slice.
 *
 * NEW_IMAGE fires for the source only: once for the first slice that a mount
 * places, whatever its index, and then for each change of the slice index. A
 * rendering over the source shows the slice of the source and fires nothing.
 *
 * The legacy adapter then also fires STACK_NEW_IMAGE and VOLUME_NEW_IMAGE as
 * it did before: for each change of the slice index of any rendering. Its
 * first pair comes from the attach.
 */
export function triggerPlanarVolumeNewImageOfPlacedSlice(
  ctx: PlanarImageEventContext,
  args: {
    rendering: PlanarVolumeEventRendering;
    viewState: PlanarViewState | undefined;
    isSourceBinding: boolean;
    imageIdIndexChanged: boolean;
  }
): void {
  const { rendering, viewState, isSourceBinding, imageIdIndexChanged } = args;
  const isFirstSlice = !renderingsWithPlacedSlice.has(rendering);

  renderingsWithPlacedSlice.add(rendering);

  if (isSourceBinding && (isFirstSlice || imageIdIndexChanged)) {
    triggerPlanarVolumeNewImage(ctx, rendering, viewState);
  }

  if (imageIdIndexChanged && ctx.viewport.firesLegacyVolumeNewImageEvents?.()) {
    triggerLegacyPlanarVolumeNewImage(ctx, rendering, viewState);
  }
}
