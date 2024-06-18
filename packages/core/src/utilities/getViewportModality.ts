import { IViewport } from '../types/index.js';
import { StackViewport, VolumeViewport } from '../RenderingEngine/index.js';
import cache from '../cache/index.js';

function getViewportModality(viewport: IViewport, volumeId?: string): string {
  if (viewport instanceof StackViewport) {
    return viewport.modality;
  }

  if (viewport instanceof VolumeViewport) {
    volumeId = volumeId ?? viewport.getDefaultActor()?.uid;

    if (!volumeId) {
      return;
    }

    return cache.getVolume(volumeId)?.metadata.Modality;
  }

  throw new Error('Invalid viewport type');
}

export { getViewportModality as default, getViewportModality };
