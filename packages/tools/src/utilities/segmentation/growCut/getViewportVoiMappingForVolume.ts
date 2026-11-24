import { utilities } from '@cornerstonejs/core';
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

type ViewportProps = {
  voiRange?: { lower: number; upper: number };
  VOILUTFunction?: string;
  invert?: boolean;
  useVOILUTSequence?: boolean;
  voiLUTFunctionSetByUser?: boolean;
  colormap?: { name?: string };
};

type ViewportWithProps = Types.IViewport & {
  getProperties?: (volumeId?: string) => ViewportProps | null;
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
    voiLUT: getAppliedVOILUTSequence(props, image?.voiLUT),
    invert: props.invert === true,
  };
}

/**
 * The VOI LUT Sequence that the stack viewport shows, or undefined when it
 * shows the window. This is the rule of StackViewport._getVOILUTSequenceToApply
 * and setVOIGPU: `useVOILUTSequence: false` stops the sequence, a VOI LUT
 * Function that the application set stops it unless `useVOILUTSequence` is
 * true, and a colormap replaces it.
 */
function getAppliedVOILUTSequence(
  props: ViewportProps,
  voiLUT: Types.CPUFallbackLUT | undefined
): Types.CPUFallbackLUT | undefined {
  const { useVOILUTSequence, voiLUTFunctionSetByUser, colormap } = props;
  if (
    useVOILUTSequence === false ||
    (useVOILUTSequence !== true && voiLUTFunctionSetByUser) ||
    colormap?.name ||
    !utilities.isRenderableVOILUT(voiLUT)
  ) {
    return undefined;
  }

  return voiLUT;
}
