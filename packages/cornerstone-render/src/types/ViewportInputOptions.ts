import Orientation from './Orientation'

/**
 * @type ViewportInputOptions
 * This type defines the shape of viewport input options, so we can throw when it is incorrect.
 */
type ViewportInputOptions = {
  background?: [number, number, number]
  orientation?: Orientation
  suppressEvents?: boolean
}

export default ViewportInputOptions
