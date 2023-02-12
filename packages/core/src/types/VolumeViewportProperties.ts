import { VOIRange } from './voi';
import VOILUTFunctionType from '../enums/VOILUTFunctionType';

/**
 * Stack Viewport Properties
 */
type VolumeViewportProperties = {
  /** voi range (upper, lower) for the viewport */
  voiRange?: VOIRange;
  /** VOILUTFunction type which is LINEAR or SAMPLED_SIGMOID */
  VOILUTFunction?: VOILUTFunctionType;
};

export default VolumeViewportProperties;
