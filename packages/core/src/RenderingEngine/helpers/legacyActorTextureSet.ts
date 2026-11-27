import type { IImageVolume } from '../../types';
import Events from '../../enums/Events';
import eventTarget from '../../eventTarget';
import { getRenderingEngines } from '../getRenderingEngine';
import { resolveVolumeTexture } from './resolveVolumeTexture';
import {
  idleSampleDistanceMultiplierOf,
  sampleDistanceOf,
} from './createVolumeMapper';

type Claim = { volume: IImageVolume; name: string; held: boolean };

const claims = new WeakMap<object, Claim>();
/** The actors whose claim is held, which a change of the limits rebinds. */
const heldActors = new Set<object>();

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
    heldActors.add(actor);
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

    /**
     * The store can evict the set while no viewport holds the actor, so the
     * actor that comes back chooses its texture again.
     */
    if (!claim.held) {
      rebindLegacyActor(actor);
    }
  } else {
    claim.volume.releaseTextureSet(claim.name);
    claim.held = false;
  }

  if (claim.held) {
    heldActors.add(actor);
  } else {
    heldActors.delete(actor);
  }
}

/**
 * Chooses the texture of a held legacy actor again, under the limits that
 * apply now, and moves the claim and the mapper to that texture.
 *
 * A legacy viewport chooses its texture once, when it creates the actor. A
 * mapper that has not yet allocated that texture refuses one that the new
 * limits cannot hold, and the viewport then shows nothing. The next render
 * of the viewport draws the new texture. An actor whose set the store evicted
 * gets a texture again, even of the same name.
 *
 * @returns true when the mapper got another texture
 */
function rebindLegacyActor(actor: object): boolean {
  const claim = claims.get(actor);
  const mapper = (
    actor as {
      getMapper: () => {
        setScalarTexture?: (texture: unknown) => void;
        setSampleDistance: (distance: number) => void;
        getInputData: () => Parameters<typeof sampleDistanceOf>[0];
        modified: () => void;
      };
    }
  ).getMapper();

  // A tool can give the actor a mapper of its own for a time, such as the
  // combined labelmap actor; the claim stays with the mapper that it restores.
  if (!mapper?.setScalarTexture) {
    return false;
  }

  const { strategy, texture } = resolveVolumeTexture(claim.volume);

  if (!texture || (claim.held && strategy.name === claim.name)) {
    return false;
  }

  if (claim.held) {
    claim.volume.releaseTextureSet(claim.name);
  }

  claim.name = strategy.name;
  claim.held = claim.volume.claimTextureSet(claim.name);

  if (!claim.held) {
    heldActors.delete(actor);
  }

  mapper.setScalarTexture(texture);
  mapper.setSampleDistance(
    sampleDistanceOf(
      mapper.getInputData(),
      texture,
      idleSampleDistanceMultiplierOf(mapper)
    )
  );
  mapper.modified();

  return true;
}

/**
 * Renders each viewport that shows one of these actors. The new texture
 * allocates at the render, so a lower limit shows and frees memory at once.
 */
function renderViewportsOf(actors: Set<object>): void {
  for (const engine of getRenderingEngines()) {
    if (engine.hasBeenDestroyed) {
      continue;
    }

    for (const viewport of engine.getViewports()) {
      if (viewport.getActors().some(({ actor }) => actors.has(actor))) {
        viewport.render();
      }
    }
  }
}

eventTarget.addEventListener(Events.VOLUME_TEXTURE_LIMITS_CHANGED, () => {
  const rebound = new Set([...heldActors].filter(rebindLegacyActor));

  if (rebound.size) {
    renderViewportsOf(rebound);
  }
});
