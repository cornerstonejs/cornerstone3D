import InterpolationType from '../enums/InterpolationType';
import VOILUTFunctionType from '../enums/VOILUTFunctionType';
import { VOIRange } from './voi';

/**
 * Stack Viewport Properties
 */
type StackViewportProperties = {
  /** voi range (upper, lower) for the viewport */
  voiRange?: VOIRange;
  /** VOILUTFunction type which is LINEAR or SAMPLED_SIGMOID */
  VOILUTFunction?: VOILUTFunctionType;
  /** invert flag - whether the image is inverted */
  invert?: boolean;
  /** interpolation type - linear or nearest neighbor */
  interpolationType?: InterpolationType;
  /** image rotation */
  rotation?: number;
  /** suppress events (optional) */
  suppressEvents?: boolean;
  /** Indicates if the voi is a computed VOI (not user set) */
  isComputedVOI?: boolean;
};

export default StackViewportProperties;
