import type { InterpolationType, VOILUTFunctionType } from '../enums';
import type { VOIRange } from './voi';
import type { ColormapPublic } from './Colormap';

/**
 * Shared Viewport Properties between Stack and Volume Viewports
 */
export interface ViewportProperties {
  /** voi range (upper, lower) for the viewport */
  voiRange?: VOIRange;
  /** VOILUTFunction type which is LINEAR, LINEAR_EXACT or SAMPLED_SIGMOID */
  VOILUTFunction?: VOILUTFunctionType;
  /** True when the application selected VOILUTFunction. */
  voiLUTFunctionSetByUser?: boolean;
  /**
   * The use of the VOI LUT Sequence (0028,3010) of the image. If this property
   * is undefined, the viewport uses the sequence when the image has one. If it
   * is false, the viewport ignores the sequence and uses the VOI LUT Function.
   */
  useVOILUTSequence?: boolean;
  /** invert flag - whether the image is inverted */
  invert?: boolean;
  /** Colormap applied to the viewport*/
  colormap?: ColormapPublic;
  /** interpolation type */
  interpolationType?: InterpolationType;

  preset?: string;

  sampleDistanceMultiplier?: number;

  /** Image sharpening settings */
  sharpening?: number;
  /** Image smoothing settings */
  smoothing?: number;
}
