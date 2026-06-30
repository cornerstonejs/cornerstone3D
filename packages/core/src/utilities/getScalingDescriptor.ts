import type { IViewport } from '../types/IViewport';
import type IStackViewport from '../types/IStackViewport';
import type IVolumeViewport from '../types/IVolumeViewport';
import type { ScalingDescriptor } from '../types/ScalingDescriptor';
import { isGenericViewport } from './viewportCapabilities';
import { getVolumeId } from './getVolumeId';
import { resolveGenericViewportVolumeId } from './resolveGenericViewportVolumeId';

type VolumeLike =
  | { metadata?: { Modality?: string }; scaling?: object }
  | undefined;

/**
 * Builds a {@link ScalingDescriptor} for a viewport target, recovering the
 * modality + pre-scaled state uniformly across the three viewport families.
 *
 * The native ("next" / PLANAR_NEXT) viewport exposes neither the StackViewport
 * `.modality` / `.preScale` surface nor the VolumeViewport `.setVolumes` API, so
 * each family is read from its own source of truth:
 *  - generic: the cache volume bound to the resolved actor (modality from its
 *    metadata, falling back to the image-data metadata; pre-scaled from its
 *    SUV `scaling`);
 *  - volume: the cache volume's metadata + `scaling`;
 *  - stack: the public `.modality` field + the rendered image's `preScale`.
 *
 * Families are discriminated by method presence (`setStack` / `setVolumes` /
 * the generic surface) rather than `instanceof`, to avoid importing the viewport
 * classes into core utilities (circular dependency).
 *
 * Returns `undefined` for viewport families with no modality-scaling concept
 * (video / WSI / 3D), so callers that require one (e.g. `getViewportModality`)
 * can throw while tolerant callers (e.g. `isViewportPreScaled`) treat it as
 * not pre-scaled.
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

  if (isGenericViewport(viewport)) {
    const resolvedVolumeId = resolveGenericViewportVolumeId(viewport, targetId);
    const volume = resolvedVolumeId ? getVolume(resolvedVolumeId) : undefined;
    const imageData = (
      viewport as { getImageData?: () => { metadata?: { Modality?: string } } }
    ).getImageData?.();

    return {
      modality: volume?.metadata?.Modality ?? imageData?.metadata?.Modality,
      isPreScaled: isScalingPresent(volume?.scaling),
    };
  }

  if (typeof (viewport as IVolumeViewport).setVolumes === 'function') {
    const volumeViewport = viewport as IVolumeViewport;
    const volumeId = targetId
      ? getVolumeId(targetId)
      : volumeViewport.getVolumeId();
    const volume = volumeId ? getVolume(volumeId) : undefined;

    return {
      modality: volume?.metadata?.Modality,
      isPreScaled: isScalingPresent(volume?.scaling),
    };
  }

  if (typeof (viewport as IStackViewport).setStack === 'function') {
    const stackViewport = viewport as IStackViewport;
    const { preScale } = stackViewport.getImageData() || {};

    return {
      modality: stackViewport.modality,
      isPreScaled: !!preScale?.scaled,
    };
  }

  return undefined;
}

function isScalingPresent(scaling: object | undefined): boolean {
  return !!scaling && Object.keys(scaling).length > 0;
}

export { _getScalingDescriptor };
