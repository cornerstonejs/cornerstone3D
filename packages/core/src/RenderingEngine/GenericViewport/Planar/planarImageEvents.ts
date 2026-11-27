import { Events, OrientationAxis } from '../../../enums';
import type ImageQualityStatus from '../../../enums/ImageQualityStatus';
import eventTarget from '../../../eventTarget';
import triggerEvent from '../../../utilities/triggerEvent';
import type { IImage } from '../../../types';
import { imageQualityStatusOf } from '../../helpers/fidelityIndicator/collectFidelityLines';
import type { PlanarViewState } from './PlanarViewportTypes';

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
  viewport: { element: HTMLDivElement };
}

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

export function triggerPlanarVolumeNewImage(
  ctx: PlanarImageEventContext,
  params: {
    camera: PlanarViewState | undefined;
    acquisitionOrientation?: PlanarViewState['orientation'];
    imageIds: string[];
    imageIdIndex: number | undefined;
    maxImageIdIndex: number;
  }
): void {
  const orientation = params.camera?.orientation;
  const isAcquisitionAligned =
    !orientation ||
    orientation === OrientationAxis.ACQUISITION ||
    (params.acquisitionOrientation !== undefined &&
      orientation === params.acquisitionOrientation);

  if (
    isAcquisitionAligned &&
    typeof params.imageIdIndex === 'number' &&
    params.imageIds[params.imageIdIndex]
  ) {
    triggerPlanarNewImage(ctx, {
      imageId: params.imageIds[params.imageIdIndex],
      imageIdIndex: params.imageIdIndex,
    });
  } else {
    triggerPlanarNewImage(ctx);
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
