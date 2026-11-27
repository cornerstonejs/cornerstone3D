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
  /**
   * True when the application selected a VOILUTFunction that is different from
   * the function of the image. A selection of the function of the image (for
   * example LINEAR for an image without (0028,1056)) leaves it false.
   */
  voiLUTFunctionSetByUser?: boolean;
  /**
   * The use of the VOI LUT Sequence (0028,3010) of the image.
   *
   * - undefined: the viewport uses the sequence when the image has one, unless
   *   `voiLUTFunctionSetByUser` is true. Thus SIGMOID on a LINEAR image stops
   *   the sequence, and LINEAR on that image keeps it.
   * - true: the viewport uses the sequence, also when the application selected
   *   a different VOILUTFunction.
   * - false: the viewport ignores the sequence and uses the VOI LUT Function.
   *
   * A colormap also replaces the curve of the sequence.
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
