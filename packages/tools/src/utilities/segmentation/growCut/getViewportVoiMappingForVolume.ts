import { utilities as csUtils } from '@cornerstonejs/core';
import type { PlanarViewport, Types } from '@cornerstonejs/core';

export type ViewportVoiMappingForTool = {
  voiRange: { lower: number; upper: number };
  VOILUTFunction?: string;
  /** Viewport invert flag (e.g. PET AC). Needed so display luma inverse-maps to the right raw end. */
  invert?: boolean;
};

type PlanarVoiPresentation = {
  voiRange?: { lower: number; upper: number };
  voiLUTFunction?: string;
  invert?: boolean;
};

/**
 * Reads the VOI range, the VOI LUT function and the invert flag that a planar
 * viewport shows, for intensity mapping: those of the display set of a
 * volume, or of the source when no volume id is given or the viewport does
 * not show that volume. They come from the presentation of the display set,
 * and from the defaults of its data where the presentation does not set them.
 * Null for a viewport that keeps no VOI of a display set, as a 3D viewport.
 */
export function getViewportVoiMappingForVolume(
  viewport: Types.IViewport,
  volumeId?: string
): ViewportVoiMappingForTool | null {
  if (!csUtils.viewportSupportsDisplaySetPresentation(viewport)) {
    return null;
  }

  const planarViewport = viewport as typeof viewport &
    Pick<PlanarViewport, 'findDataIdByVolumeId' | 'getDefaultInvert'>;
  const dataId =
    (volumeId && planarViewport.findDataIdByVolumeId(volumeId)) ||
    viewport.getSourceDataId();

  if (!dataId) {
    return null;
  }

  const presentation = viewport.getDisplaySetPresentation(dataId) as
    | PlanarVoiPresentation
    | undefined;
  const voiRange =
    presentation?.voiRange ?? viewport.getDefaultVOIRange(dataId);

  if (
    typeof voiRange?.lower !== 'number' ||
    typeof voiRange?.upper !== 'number'
  ) {
    return null;
  }

  return {
    voiRange: { lower: voiRange.lower, upper: voiRange.upper },
    VOILUTFunction: presentation?.voiLUTFunction,
    invert:
      (presentation?.invert ?? planarViewport.getDefaultInvert(dataId)) ===
      true,
  };
}
