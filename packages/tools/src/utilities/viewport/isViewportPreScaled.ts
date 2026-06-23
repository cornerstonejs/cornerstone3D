import type { Types } from '@cornerstonejs/core';
import {
  cache,
  StackViewport,
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
  } else if (utilities.isGenericViewport(viewport)) {
    // Direct Generic ("next") viewports: `targetId` is a display-set dataId, not
    // the cache volume id. Map it to the matching actor's referencedId (the real
    // volume id) so the PT volume's SUV scaling is detected - without this, PT
    // window-level drag uses the unscaled (sensitive) multiplier instead of the
    // slow pre-scaled one.
    const actors =
      (
        viewport as { getActors?: () => Array<{ referencedId?: string }> }
      ).getActors?.() ?? [];
    const matchedActor =
      actors.find((actor) => actor.referencedId === targetId) ??
      actors.find((actor) => actor.referencedId?.includes(targetId));
    const volumeId =
      matchedActor?.referencedId ?? utilities.getVolumeId(targetId);
    const volume = cache.getVolume(volumeId);
    return !!volume?.scaling && Object.keys(volume.scaling).length > 0;
  } else {
    return false;
  }
}

export { isViewportPreScaled };
