import type { IViewport } from '../types/IViewport';
import { _getScalingDescriptor } from './getScalingDescriptor';

/**
 * Resolves the modality of a viewport target across the stack / volume / generic
 * ("next") families.
 *
 * Thin wrapper over {@link _getScalingDescriptor} so modality and pre-scaled
 * detection share one family-aware source of truth. Throws "Invalid viewport
 * type" for families with no modality concept (video / WSI / 3D), preserving the
 * historical contract.
 *
 * `getVolume` is injected to avoid the cache import cycle; use the
 * `getViewportModality` export from the utilities index, which supplies it.
 */
function _getViewportModality(
  viewport: IViewport,
  volumeId?: string,
  getVolume?: (
    volumeId: string
  ) => { metadata: { Modality: string } } | undefined
): string {
  const descriptor = _getScalingDescriptor(viewport, volumeId, getVolume);

  if (!descriptor) {
    throw new Error('Invalid viewport type');
  }

  return descriptor.modality;
}

export { _getViewportModality };
