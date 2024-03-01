import {
  cache,
  StackViewport,
  Types,
  BaseVolumeViewport,
} from '@cornerstonejs/core';

function isViewportPreScaled(
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  targetId: string
): boolean {
  if (viewport instanceof BaseVolumeViewport) {
    const targetIdTokens = targetId.split('volumeId:');
    const volumeId =
      targetIdTokens.length > 1
        ? targetIdTokens[1].split('?')[0]
        : targetIdTokens[0];
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
