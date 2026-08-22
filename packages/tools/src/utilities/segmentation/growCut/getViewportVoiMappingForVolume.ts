import type { Types } from '@cornerstonejs/core';

export type ViewportVoiMappingForTool = {
  voiRange: { lower: number; upper: number };
  VOILUTFunction?: string;
  /**
   * VOI LUT Sequence (0028,3010) of the image on display. The sequence is the
   * whole VOI transformation, so the mapping must use its curve and not a
   * linear ramp.
   */
  voiLUT?: Types.CPUFallbackLUT;
  /** Viewport invert flag (e.g. PET AC). Needed so display luma inverse-maps to the right raw end. */
  invert?: boolean;
};

type ViewportWithProps = Types.IViewport & {
  getProperties?: (volumeId?: string) => {
    voiRange?: { lower: number; upper: number };
    VOILUTFunction?: string;
    invert?: boolean;
  } | null;
  getCornerstoneImage?: () => Types.IImage | undefined;
};

/**
 * Reads VOI + LUT function from a volume or stack viewport for intensity mapping.
 */
export function getViewportVoiMappingForVolume(
  viewport: Types.IViewport,
  volumeId?: string
): ViewportVoiMappingForTool | null {
  const getProps = (viewport as ViewportWithProps).getProperties;
  if (typeof getProps !== 'function') {
    return null;
  }
  const props = volumeId
    ? getProps.call(viewport, volumeId)
    : getProps.call(viewport);
  if (!props?.voiRange) {
    return null;
  }
  const { lower, upper } = props.voiRange;
  if (typeof lower !== 'number' || typeof upper !== 'number') {
    return null;
  }
  // A stack viewport gives the image on display, and the image carries the
  // sequence of the file. A volume has one sequence for each instance, so the
  // volume paths keep the window of the viewport.
  const image = (viewport as ViewportWithProps).getCornerstoneImage?.();

  return {
    voiRange: { lower, upper },
    VOILUTFunction: props.VOILUTFunction,
    voiLUT: image?.voiLUT,
    invert: props.invert === true,
  };
}
