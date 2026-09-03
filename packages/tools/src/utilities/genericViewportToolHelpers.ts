import {
  CONSTANTS,
  utilities as csUtils,
  type Types,
} from '@cornerstonejs/core';
import { getViewportPresentation } from './viewportPresentation';

const { RENDERING_DEFAULTS } = CONSTANTS;

/**
 * Returns the viewport's slab thickness, defaulting to the minimum slab thickness
 * for native (Generic) viewports which have no slab API.
 */
export function getSlabThicknessOrDefault(viewport: Types.IViewport): number {
  if (csUtils.isGenericViewport(viewport)) {
    return RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
  }
  return (viewport as Types.IVolumeViewport).getSlabThickness();
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
  if (csUtils.isGenericViewport(viewport)) {
    viewport.setViewReference({ cameraFocalPoint } as Types.ViewReference);
  }
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
 * Returns true when a navigation was issued.
 */
export function navigatePlanarViewportToPoint(
  viewport: Types.IViewport,
  worldPoint: Types.Point3
): boolean {
  if (!csUtils.isGenericViewport(viewport)) {
    return false;
  }

  const isStackContent = viewport.getCurrentMode?.() === 'stack';

  if (isStackContent) {
    const stackViewport = viewport as unknown as Types.IStackViewport;
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
