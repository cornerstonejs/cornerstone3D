import InterpolationType from '../enums/InterpolationType'
import { VOIRange } from './voi'

/**
 * Stack Viewport Properties
 */
type StackViewportProperties = {
  /** voi range (upper, lower) for the viewport */
  voiRange?: VOIRange
  /** invert flag - whether the image is inverted */
  invert?: boolean
  /** interpolation type - linear or nearest neighbor */
  interpolationType?: InterpolationType
  /** image rotation */
  rotation?: number
  /** flip horizontal flag */
  flipHorizontal?: boolean
  /** flip vertical flag */
  flipVertical?: boolean
}

export default StackViewportProperties
