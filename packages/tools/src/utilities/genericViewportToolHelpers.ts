import { utilities as csUtils, type Types } from '@cornerstonejs/core';
import type { PlanarViewport } from '@cornerstonejs/core';
import { getViewportPresentation } from './viewportPresentation';

/**
 * The full depth in mm that a viewport's slab shows, or undefined when the
 * viewport shows no slab of its own.
 *
 * A next planar viewport keeps the slab in the presentation of its source
 * display set. A `slabThickness` of `T` shows the slices within about `T` of
 * the plane on each side, as the legacy `setSlabThickness(T)` did, so the
 * depth is twice the value, as the legacy helper gave twice
 * `getSlabThickness()`. A stack has no slab, and a viewport without display
 * set presentations gives undefined.
 *
 * A caller that needs a depth, such as a brush fill, must use this function
 * and not the raw value. See
 * `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
 */
export function getViewSlabDepthOfViewport(
  viewport: Types.IViewport
): number | undefined {
  if (csUtils.viewportSupportsDisplaySetPresentation(viewport)) {
    const sourceDataId = viewport.getSourceDataId();
    const presentation = sourceDataId
      ? (viewport.getDisplaySetPresentation(sourceDataId) as
          | { slabThickness?: number }
          | undefined)
      : undefined;
    const slabThickness = presentation?.slabThickness;

    return typeof slabThickness === 'number'
      ? csUtils.getViewSlabDepth(slabThickness * 2)
      : undefined;
  }

  return undefined;
}

/**
 * Navigates a native (Generic) viewport to a focal point via its view reference.
 * Native PLANAR_NEXT has no setCamera; navigating by view reference snaps to the
 * nearest slice along the view-plane normal.
 */
export function jumpToFocalPoint(
  viewport: Types.IViewport,
  cameraFocalPoint: Types.Point3
): void {
  viewport.setViewReference({ cameraFocalPoint } as Types.ViewReference);
}

/**
 * Navigates a native (Generic) planar viewport so its displayed slice passes
 * through (or as close as possible to) the given world point, handling both
 * content modes:
 *
 * - volume-backed slices navigate by `cameraFocalPoint` (exact plane through
 *   the point, pan untouched);
 * - image stacks ignore `cameraFocalPoint` in their view-reference handling,
 *   so the closest image index to the point is resolved from the per-image
 *   plane metadata and navigated by `sliceIndex`.
 *
 * Only the distance of the point along the view counts, so a point beside the
 * data goes to the slice of its plane. A point before the first or past the
 * last slice goes to the first or the last slice, in both modes.
 *
 * Returns true when a navigation was issued. A viewport with nothing mounted
 * gives false.
 */
export function navigatePlanarViewportToPoint(
  viewport: Types.IViewport,
  worldPoint: Types.Point3
): boolean {
  if (typeof viewport.setViewReference !== 'function') {
    return false;
  }

  const contentMode = viewport.getCurrentMode?.();

  if (contentMode === 'empty') {
    return false;
  }

  if (contentMode === 'stack') {
    const stackViewport = viewport as unknown as PlanarViewport;
    if (
      typeof stackViewport.getImageIds !== 'function' ||
      typeof stackViewport.getCurrentImageIdIndex !== 'function'
    ) {
      return false;
    }

    let imageIndex: number | null = null;
    try {
      imageIndex = csUtils.getClosestStackImageIndexForPoint(
        worldPoint,
        stackViewport
      );
    } catch {
      return false;
    }

    if (imageIndex === null || imageIndex < 0) {
      return false;
    }

    viewport.setViewReference({
      sliceIndex: imageIndex,
    } as Types.ViewReference);
    return true;
  }

  viewport.setViewReference({
    cameraFocalPoint: [worldPoint[0], worldPoint[1], worldPoint[2]],
  } as Types.ViewReference);
  return true;
}

export interface NativeSourceProperties {
  /** VOI/LUT properties read via getDisplaySetPresentation. */
  properties: Record<string, unknown>;
  rotation?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  currentImageId?: string;
}

/**
 * Reads the VOI/LUT properties, rotation/flip presentation and current image id
 * from a native (Generic) source viewport, which exposes none of the legacy
 * getProperties/getViewPresentation/getCamera APIs.
 */
export function getNativeSourceProperties(
  viewport: Types.IViewport
): NativeSourceProperties {
  if (!csUtils.viewportSupportsDisplaySetPresentation(viewport)) {
    return { properties: {} };
  }
  const sourceDataId = viewport.getSourceDataId();
  const properties = {
    ...((sourceDataId
      ? (viewport.getDisplaySetPresentation(sourceDataId) as Record<
          string,
          unknown
        >)
      : {}) ?? {}),
  } as Record<string, unknown>;
  // Generic viewports expose the VOI LUT function as `voiLUTFunction`, but the
  // legacy viewport `setProperties` (used by the Magnify loupes) reads the
  // uppercase `VOILUTFunction`. Bridge the casing so a sigmoid source does not
  // silently render the loupe with a linear LUT.
  const voiLUTFunction = properties.VOILUTFunction ?? properties.voiLUTFunction;
  if (voiLUTFunction !== undefined) {
    properties.VOILUTFunction = voiLUTFunction;
  }
  const presentation = (getViewportPresentation(viewport) ?? {}) as {
    rotation?: number;
    flipHorizontal?: boolean;
    flipVertical?: boolean;
  };
  return {
    properties,
    rotation: presentation.rotation,
    flipHorizontal: presentation.flipHorizontal,
    flipVertical: presentation.flipVertical,
    currentImageId: viewport.getCurrentImageId(),
  };
}
