import Orientation from './Orientation';

/**
 * This type defines the shape of viewport input options, so we can throw when it is incorrect.
 */
type ViewportInputOptions = {
  /** background color */
  background?: [number, number, number];
  /** orientation of the viewport - e.g., Axial, Coronal, Sagittal, or custom oblique with sliceNormal and viewUp */
  orientation?: Orientation;
  /** whether the events should be suppressed and not fired*/
  suppressEvents?: boolean;
};

export default ViewportInputOptions;
