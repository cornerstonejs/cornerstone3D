import type { IViewport } from '../types/IViewport';
import type { ScalingDescriptor } from '../types/ScalingDescriptor';
import { resolveViewportVolumeId } from './resolveViewportVolumeId';

type VolumeLike =
  | { metadata?: { Modality?: string }; scaling?: object }
  | undefined;

/**
 * Builds a {@link ScalingDescriptor} for a viewport target, recovering the
 * modality + pre-scaled state from the cache volume bound to the resolved
 * actor (modality from its metadata, falling back to the image-data metadata;
 * pre-scaled from its SUV `scaling`).
 *
 * Returns `undefined` for no viewport, so callers that require one (e.g.
 * `getViewportModality`) can throw while tolerant callers (e.g.
 * `isViewportPreScaled`) treat it as not pre-scaled.
 *
 * `getVolume` is injected (rather than imported) to keep this utility free of
 * the cache import cycle; use the `getScalingDescriptor` export from the
 * utilities index, which supplies it.
 */
function _getScalingDescriptor(
  viewport: IViewport,
  targetId?: string,
  getVolume?: (volumeId: string) => VolumeLike
): ScalingDescriptor | undefined {
  if (!getVolume) {
    throw new Error('getVolume is required, use the utilities export instead');
  }

  if (viewport) {
    const resolvedVolumeId = resolveViewportVolumeId(viewport, targetId);
    const volume = resolvedVolumeId ? getVolume(resolvedVolumeId) : undefined;
    const imageData = (
      viewport as { getImageData?: () => { metadata?: { Modality?: string } } }
    ).getImageData?.();

    return {
      modality: volume?.metadata?.Modality ?? imageData?.metadata?.Modality,
      isPreScaled: isScalingPresent(volume?.scaling),
    };
  }

  return undefined;
}

function isScalingPresent(scaling: object | undefined): boolean {
  return !!scaling && Object.keys(scaling).length > 0;
}

export { _getScalingDescriptor };
