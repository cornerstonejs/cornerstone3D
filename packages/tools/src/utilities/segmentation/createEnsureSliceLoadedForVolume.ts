import { imageLoader } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

/**
 * Builds an idempotent per-slice loader for volumes backed by `imageIds` (e.g. streaming stacks).
 * No-op when `imageIds` is missing or empty. Uses `imageLoader.loadImage` for the slice imageId.
 */
export function createEnsureSliceLoadedForVolume(
  volume: Types.IImageVolume
): (z: number) => Promise<void> {
  const numSlices = volume.dimensions[2];
  const imageIds = volume.imageIds;
  if (!imageIds?.length) {
    return async () => undefined;
  }

  const inFlight = new Map<number, Promise<void>>();

  return async function ensureSliceLoaded(z: number): Promise<void> {
    if (!Number.isFinite(z) || z < 0 || z >= numSlices) {
      return;
    }

    const existing = inFlight.get(z);
    if (existing) {
      return existing;
    }

    const imageId = imageIds[z];
    if (!imageId) {
      return;
    }

    const promise = imageLoader
      .loadImage(imageId)
      .then(() => undefined)
      .finally(() => {
        inFlight.delete(z);
      });

    inFlight.set(z, promise);
    return promise;
  };
}
