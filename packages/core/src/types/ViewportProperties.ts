import { InterpolationType, VOILUTFunctionType } from '../enums';
import { VOIRange } from './voi';
import { ColormapPublic } from './Colormap';

/**
 * Shared Viewport Properties between Stack and Volume Viewports
 */
type ViewportProperties = {
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
  /**Rotation of the camera */
  rotation?: number;
};

export type { ViewportProperties };
