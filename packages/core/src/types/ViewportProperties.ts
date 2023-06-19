import { VOILUTFunctionType } from '../enums';
import { VOIRange } from './voi';

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
};

export type { ViewportProperties };
