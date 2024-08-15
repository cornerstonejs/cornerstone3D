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
}
