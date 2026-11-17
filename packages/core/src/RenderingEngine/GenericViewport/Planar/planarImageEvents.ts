import { Events, OrientationAxis } from '../../../enums';
import type ImageQualityStatus from '../../../enums/ImageQualityStatus';
import eventTarget from '../../../eventTarget';
import triggerEvent from '../../../utilities/triggerEvent';
import type { IImage } from '../../../types';
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
     * True on the legacy adapter, whose STACK_NEW_IMAGE of a volume names
     * `imageIds[imageIdIndex]`.
     */
    namesVolumeImageBySliceIndex?(): boolean;
    /**
     * True on the legacy adapter, whose volumes fire their new image events
     * as before: at the attach, and for each rendering.
     */
    firesLegacyVolumeNewImageEvents?(): boolean;
  };
}

/** The rendering of a volume on any of its three draw paths. */
type PlanarVolumeEventRendering =
  | PlanarCpuVolumeRendering
  | PlanarVolumeSliceRendering
  | PlanarSampledSliceRendering;

/** The parameters of the new image events of a volume. */
interface PlanarVolumeNewImageParams {
  camera: PlanarViewState | undefined;
  acquisitionOrientation?: PlanarViewState['orientation'];
  imageIds: string[];
  imageIdIndex: number | undefined;
  maxImageIdIndex: number;
  rendering?: PlanarVolumeEventRendering;
}

/** The volume renderings whose first slice a view state has placed. */
const renderingsWithPlacedSlice = new WeakSet<PlanarVolumeEventRendering>();

interface PlanarNewImageArgs {
  image?: IImage;
  imageId?: string;
  imageIdIndex?: number;
}

export function triggerPlanarNewImage(
  ctx: PlanarImageEventContext,
  args: PlanarNewImageArgs = {}
): void {
  triggerEvent(ctx.viewport.element, Events.STACK_NEW_IMAGE, {
    image: args.image,
    imageId: args.imageId ?? args.image?.imageId,
    imageIdIndex: args.imageIdIndex,
    viewportId: ctx.viewportId,
    renderingEngineId: ctx.renderingEngineId,
  });
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
 * Fires STACK_NEW_IMAGE and VOLUME_NEW_IMAGE for the slice of a volume that
 * the view state `camera` shows.
 *
 * The detail of STACK_NEW_IMAGE of a next viewport:
 * - `imageId` is the image of the slice on display, which is what
 *   `viewport.getCurrentImageId()` answers. It is read from `rendering`. It
 *   is undefined when the view shows no single source image, as an oblique
 *   cut or a reformat.
 * - `imageIdIndex` is the slice index of the view, which is what
 *   `viewport.getCurrentImageIdIndex()` answers, when the view is in the
 *   acquisition orientation, and undefined otherwise. It counts along the
 *   view, which can run against the order of the image ids, so it is not the
 *   place of `imageId` in the image ids.
 * - `image` is undefined: a volume has no image object for a slice.
 *
 * The legacy adapter keeps the image id it fired before,
 * `imageIds[imageIdIndex]`.
 */
export function triggerPlanarVolumeNewImage(
  ctx: PlanarImageEventContext,
  params: PlanarVolumeNewImageParams
): void {
  const orientation = params.camera?.orientation;
  const isAcquisitionAligned =
    !orientation ||
    orientation === OrientationAxis.ACQUISITION ||
    (params.acquisitionOrientation !== undefined &&
      orientation === params.acquisitionOrientation);
  const imageIdIndex =
    isAcquisitionAligned &&
    typeof params.imageIdIndex === 'number' &&
    params.imageIds[params.imageIdIndex]
      ? params.imageIdIndex
      : undefined;

  if (ctx.viewport.namesVolumeImageBySliceIndex?.()) {
    triggerPlanarNewImage(ctx, {
      imageId:
        imageIdIndex === undefined ? undefined : params.imageIds[imageIdIndex],
      imageIdIndex,
    });
  } else {
    triggerPlanarNewImage(ctx, {
      imageId: params.rendering
        ? getShownVolumeImageId(params.rendering, params.camera)
        : undefined,
      imageIdIndex,
    });
  }

  // A volume-backed slice change must also emit VOLUME_NEW_IMAGE so that
  // volume-aware consumers (volume scroll indicators, MPR slice synchronizers,
  // segmentation slice tracking) react. The native volume-slice path previously
  // emitted only STACK_NEW_IMAGE, which those consumers do not listen for, so
  // every slice change on a PLANAR_NEXT volume viewport was missed.
  //
  // Only emit when the slice index is known: defaulting an unknown index to 0
  // would incorrectly snap volume-aware consumers to the first slice (this
  // happens on oblique/reformatted planes that do not map to a discrete index).
  if (typeof params.imageIdIndex === 'number') {
    triggerEvent(ctx.viewport.element, Events.VOLUME_NEW_IMAGE, {
      imageIndex: params.imageIdIndex,
      numberOfSlices: params.maxImageIdIndex + 1,
      viewportId: ctx.viewportId,
      renderingEngineId: ctx.renderingEngineId,
    });
  }
}

/**
 * Fires the new image events of a volume as it is attached, before a view
 * state placed its first slice, with the slice index that the rendering
 * starts with. Only the legacy adapter fires them here, as it did before. A
 * next viewport fires its first events once the first slice is placed (see
 * `firesPlanarVolumeNewImage`), so it has no event for a slice that it never
 * shows.
 */
export function triggerPlanarVolumeNewImageAtAttach(
  ctx: PlanarImageEventContext,
  params: PlanarVolumeNewImageParams
): void {
  if (ctx.viewport.firesLegacyVolumeNewImageEvents?.()) {
    triggerPlanarVolumeNewImage(ctx, params);
  }
}

/**
 * Whether a volume rendering fires its new image events now that a view
 * state placed its slice.
 *
 * A next viewport fires them for its source only: once for the first slice
 * that a mount places, whatever its index, and then for each change of the
 * slice index. A rendering over the source shows the slice of the source and
 * fires nothing.
 *
 * The legacy adapter fires them as it did before: for each change of the
 * slice index of any rendering. Its first events come from the attach.
 */
export function firesPlanarVolumeNewImage(
  ctx: PlanarImageEventContext,
  args: {
    rendering: PlanarVolumeEventRendering;
    isSourceBinding: boolean;
    imageIdIndexChanged: boolean;
  }
): boolean {
  const { rendering, isSourceBinding, imageIdIndexChanged } = args;

  if (ctx.viewport.firesLegacyVolumeNewImageEvents?.()) {
    return imageIdIndexChanged;
  }

  const isFirstSlice = !renderingsWithPlacedSlice.has(rendering);

  renderingsWithPlacedSlice.add(rendering);

  return isSourceBinding && (isFirstSlice || imageIdIndexChanged);
}
