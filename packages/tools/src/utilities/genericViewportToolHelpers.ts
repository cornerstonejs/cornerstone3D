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
