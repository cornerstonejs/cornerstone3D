import InterpolationType from '../enums/InterpolationType.js';
import { ViewportProperties } from './ViewportProperties.js';

/**
 * Stack Viewport Properties
 */
type StackViewportProperties = ViewportProperties & {
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
