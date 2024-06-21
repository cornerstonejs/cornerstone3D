import {
  cache,
  StackViewport,
  Types,
  BaseVolumeViewport,
  utilities,
} from '@cornerstonejs/core';

function isViewportPreScaled(
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  targetId: string
): boolean {
  if (viewport instanceof BaseVolumeViewport) {
    const volumeId = utilities.getVolumeId(targetId);
    const volume = cache.getVolume(volumeId);
    return !!volume?.scaling && Object.keys(volume.scaling).length > 0;
  } else if (viewport instanceof StackViewport) {
    const { preScale } = viewport.getImageData() || {};
    return !!preScale?.scaled;
  } else {
    return false;
  }
}

export { isViewportPreScaled };
