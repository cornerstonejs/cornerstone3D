import type { IImageVolume } from '../../types';

type Claim = { volume: IImageVolume; name: string; held: boolean };

const claims = new WeakMap<object, Claim>();

/**
 * Claims the texture set that a legacy volume actor draws, and ties the claim
 * to that actor.
 *
 * A render path claims and releases its set itself. A legacy viewport has no
 * render path, so the claim follows its actor: `Viewport` gives the claim back
 * when it removes the actor or ends, and takes it again when it adds the actor
 * back. A budget can then evict the set of a volume that no viewport draws,
 * while that volume stays in the cache.
 */
export function claimLegacyActorTextureSet(
  actor: object,
  volume: IImageVolume,
  name: string
): void {
  if (volume.claimTextureSet(name)) {
    claims.set(actor, { volume, name, held: true });
  }
}

/**
 * Takes or gives back the claim of a legacy actor. An actor that holds no
 * claim of this kind, for example the actor of a render path, changes nothing.
 */
export function holdLegacyActorTextureSet(actor: object, held: boolean): void {
  const claim = claims.get(actor);

  if (!claim || claim.held === held) {
    return;
  }

  if (held) {
    claim.held = claim.volume.claimTextureSet(claim.name);
  } else {
    claim.volume.releaseTextureSet(claim.name);
    claim.held = false;
  }
}
