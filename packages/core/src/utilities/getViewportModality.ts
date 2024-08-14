import type { IViewport } from '../types/IViewport';
import type IStackViewport from '../types/IStackViewport';
import type IVolumeViewport from '../types/IVolumeViewport';

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
    volumeId = volumeId ?? viewport.getDefaultActor().uid;

    if (!volumeId || !getVolume) {
      return;
    }

    const volume = getVolume(volumeId);
    return volume.metadata.Modality;
  }

  throw new Error('Invalid viewport type');
}

export { _getViewportModality };
