import Orientation from './Orientation'

/**
 * @type ViewportInputOptions
 * This type defines the shape of viewport input options, so we can throw when it is incorrect.
 */
type ViewportInputOptions = {
  background?: Array<number>
  orientation?: Orientation
}

export default ViewportInputOptions
