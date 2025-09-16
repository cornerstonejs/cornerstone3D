import type { InterpolationType, VOILUTFunctionType } from '../enums';
import type { VOIRange } from './voi';
import type { ColormapPublic } from './Colormap';

/**
 * Shared Viewport Properties between Stack and Volume Viewports
 */
export interface ViewportProperties {
  /** voi range (upper, lower) for the viewport */
  voiRange?: VOIRange;
  /** VOILUTFunction type which is LINEAR or SAMPLED_SIGMOID */
  VOILUTFunction?: VOILUTFunctionType;
  /** invert flag - whether the image is inverted */
  invert?: boolean;
  /** Colormap applied to the viewport*/
  colormap?: ColormapPublic;
  /** interpolation type */
  interpolationType?: InterpolationType;

  preset?: string;

  sampleDistanceMultiplier?: number;

  /** Image sharpening settings */
  sharpening?: {
    /** Enable/disable sharpening */
    enabled: boolean;
    /** Sharpening intensity (0-1, where 0 is no sharpening, 1 is maximum) */
    intensity?: number;
  };
}
