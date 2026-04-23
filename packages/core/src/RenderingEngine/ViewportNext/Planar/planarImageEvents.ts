import { Events, OrientationAxis } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import type { IImage } from '../../../types';
import type { PlanarCamera } from './PlanarViewportTypes';

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
    camera: PlanarCamera | undefined;
    acquisitionOrientation?: PlanarCamera['orientation'];
    imageIds: string[];
    imageIdIndex: number | undefined;
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
    return;
  }

  triggerPlanarNewImage(ctx);
}
