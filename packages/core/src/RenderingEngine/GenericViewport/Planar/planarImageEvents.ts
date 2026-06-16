import { Events, OrientationAxis } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import type { IImage } from '../../../types';
import type { PlanarViewState } from './PlanarViewportTypes';

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
  triggerEvent(ctx.viewport.element, Events.VOLUME_NEW_IMAGE, {
    imageIndex: params.imageIdIndex ?? 0,
    numberOfSlices: params.maxImageIdIndex + 1,
    viewportId: ctx.viewportId,
    renderingEngineId: ctx.renderingEngineId,
  });
}
