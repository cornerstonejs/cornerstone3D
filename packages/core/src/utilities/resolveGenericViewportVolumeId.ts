import type { IViewport } from '../types/IViewport';
import { getVolumeId } from './getVolumeId';

type GenericViewportActorSurface = IViewport & {
  getActors?: () => Array<{ referencedId?: string }>;
  getDefaultActor?: () => { referencedId?: string } | undefined;
};

/**
 * Resolves the cache volume id backing a generic ("next" / PLANAR_NEXT)
 * viewport target.
 *
 * VOI tooling and the colorbar identify a target by its display-set `dataId`,
 * which is NOT the cache volume id - the volume id ends in `:<dataId>`. This
 * maps the `dataId` to the matching actor's `referencedId` (the real volume id):
 * an exact match first, then the `<scheme>:<dataId>` suffix. Anchoring to the
 * `:` separator avoids the unintended-actor matches a loose substring search
 * could produce in a fusion viewport. When no `targetId` is given (or it matches
 * nothing) it falls back to the bound default actor's referenced volume.
 *
 * This idiom was previously duplicated verbatim in `getViewportModality` and
 * `isViewportPreScaled`; it now lives here as the single source of truth and
 * feeds the shared {@link getScalingDescriptor}.
 */
export function resolveGenericViewportVolumeId(
  viewport: IViewport,
  targetId?: string
): string | undefined {
  const genericViewport = viewport as GenericViewportActorSurface;
  const actors = genericViewport.getActors?.() ?? [];

  const matchedActor = targetId
    ? (actors.find((actor) => actor.referencedId === targetId) ??
      actors.find((actor) => actor.referencedId?.endsWith(`:${targetId}`)))
    : undefined;

  return (
    matchedActor?.referencedId ??
    (targetId ? getVolumeId(targetId) : undefined) ??
    genericViewport.getDefaultActor?.()?.referencedId
  );
}
