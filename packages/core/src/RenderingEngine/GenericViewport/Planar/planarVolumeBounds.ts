import cache from '../../../cache/cache';

/**
 * The world bounds that enclose every cached volume of a list, as
 * `[xMin, xMax, yMin, yMax, zMin, zMax]`, or undefined when no volume of the
 * list has bounds.
 */
export function getPlanarVolumesBounds(
  volumeIds: Iterable<string>
): number[] | undefined {
  let bounds: number[] | undefined;

  for (const volumeId of volumeIds) {
    const volumeBounds = (
      cache.getVolume(volumeId) as
        | { imageData?: { getBounds?: () => number[] } }
        | undefined
    )?.imageData?.getBounds?.();

    if (!volumeBounds) {
      continue;
    }

    bounds = bounds
      ? bounds.map((value, index) =>
          index % 2
            ? Math.max(value, volumeBounds[index])
            : Math.min(value, volumeBounds[index])
        )
      : [...volumeBounds];
  }

  return bounds;
}
