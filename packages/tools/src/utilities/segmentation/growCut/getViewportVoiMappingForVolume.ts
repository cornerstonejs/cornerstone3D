import type { Types } from '@cornerstonejs/core';

export type ViewportVoiMappingForTool = {
  voiRange: { lower: number; upper: number };
  VOILUTFunction?: string;
  /** Viewport invert flag (e.g. PET AC). Needed so display luma inverse-maps to the right raw end. */
  invert?: boolean;
};

type ViewportWithProps = Types.IViewport & {
  getProperties?: (volumeId?: string) => {
    voiRange?: { lower: number; upper: number };
    VOILUTFunction?: string;
    invert?: boolean;
  } | null;
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
  return {
    voiRange: { lower, upper },
    VOILUTFunction: props.VOILUTFunction,
    invert: props.invert === true,
  };
}
