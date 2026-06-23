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
      getActors?: () => Array<{ referencedId?: string }>;
      getDefaultActor?: () => { referencedId?: string } | undefined;
      getImageData?: () => { metadata?: { Modality?: string } } | undefined;
    };

    // The passed `volumeId` may be a display-set dataId (the identifier VOI
    // tooling and the colorbar use), not the cache volume id. Map it to the
    // matching actor's referencedId (the real volume id) before the cache
    // lookup, otherwise getVolume misses and we fall back to the source layer's
    // modality - e.g. reporting CT for the PT layer of a fusion, which makes
    // window-level drag use the wrong (non-PT) multipliers. Fall back to the
    // default actor when no id was given.
    const actors = genericViewport.getActors?.() ?? [];
    // Match the volume id exactly, then by the `<scheme>:<dataId>` suffix (a
    // display-set dataId maps to a volume id ending in `:<dataId>`). Anchoring to
    // the separator avoids the unintended-actor matches a loose substring search
    // could produce in a fusion viewport.
    const matchedActor = volumeId
      ? (actors.find((actor) => actor.referencedId === volumeId) ??
        actors.find((actor) => actor.referencedId?.endsWith(`:${volumeId}`)))
      : undefined;
    const resolvedVolumeId =
      matchedActor?.referencedId ??
      volumeId ??
      genericViewport.getDefaultActor?.()?.referencedId;
    const volume = resolvedVolumeId ? getVolume(resolvedVolumeId) : undefined;

    if (volume?.metadata?.Modality) {
      return volume.metadata.Modality;
    }

    return genericViewport.getImageData?.()?.metadata?.Modality;
  }

  throw new Error('Invalid viewport type');
}

export { _getViewportModality };
