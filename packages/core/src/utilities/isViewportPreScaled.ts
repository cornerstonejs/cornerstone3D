import { IViewport } from '../types';
import { StackViewport, VolumeViewport } from '../RenderingEngine';
import cache from '../cache';

function isViewportPreScaled(viewport: IViewport, volumeId?: string) {
  if (viewport instanceof VolumeViewport) {
    const volume = cache.getVolume(volumeId);
    const { scaling } = volume;

    return !!scaling && Object.keys(scaling).length > 0;
  }

  if (viewport instanceof StackViewport) {
    const { preScale } = viewport.getImageData();
    return preScale.scaled && preScale.scalingParameters?.suvbw !== undefined;
  }
}

export { isViewportPreScaled as default, isViewportPreScaled };
