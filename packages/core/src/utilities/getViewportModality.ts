import type { IViewport } from '../types/IViewport';
import type IStackViewport from '../types/IStackViewport';
import type IVolumeViewport from '../types/IVolumeViewport';
import { isGenericViewport } from './viewportCapabilities';

function _getViewportModality(
  viewport: IViewport,
  volumeId?: string,
  getVolume?: (
    volumeId: string
  ) => { metadata: { Modality: string } } | undefined
): string {
  if (!getVolume) {
    throw new Error('getVolume is required, use the utilities export instead ');
  }

  if ((viewport as IStackViewport).modality) {
    return (viewport as IStackViewport).modality;
  }

  if ((viewport as IVolumeViewport).setVolumes) {
    volumeId = volumeId ?? (viewport as IVolumeViewport).getVolumeId();

    if (!volumeId || !getVolume) {
      return;
    }

    const volume = getVolume(volumeId);
    return volume.metadata.Modality;
  }

  // Generic ("next") viewports expose neither `.modality` (stack) nor
  // `.setVolumes` (volume). Resolve the modality from the explicitly requested
  // volume, then the bound default actor's referenced volume, then the image
  // data metadata, so VOI tooling (e.g. getVOIMultipliers / the colorbar) works
  // on a PLANAR_NEXT viewport instead of throwing "Invalid viewport type".
  if (isGenericViewport(viewport)) {
    const genericViewport = viewport as IViewport & {
      getDefaultActor?: () => { referencedId?: string } | undefined;
      getImageData?: () => { metadata?: { Modality?: string } } | undefined;
    };

    const resolvedVolumeId =
      volumeId ?? genericViewport.getDefaultActor?.()?.referencedId;
    const volume = resolvedVolumeId ? getVolume(resolvedVolumeId) : undefined;

    if (volume?.metadata?.Modality) {
      return volume.metadata.Modality;
    }

    return genericViewport.getImageData?.()?.metadata?.Modality;
  }

  throw new Error('Invalid viewport type');
}

export { _getViewportModality };
