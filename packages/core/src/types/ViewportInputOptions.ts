import { OrientationAxis } from '../enums';
import OrientationVectors from './OrientationVectors';

/**
 * This type defines the shape of viewport input options, so we can throw when it is incorrect.
 */
type ViewportInputOptions = {
  /** background color */
  background?: [number, number, number];
  /** orientation of the viewport which can be either an Enum for axis Enums.OrientationAxis.[AXIAL|SAGITTAL|CORONAL|DEFAULT] or an object with viewPlaneNormal and viewUp */
  orientation?: OrientationAxis | OrientationVectors;
  /** whether the events should be suppressed and not fired*/
  suppressEvents?: boolean;
  /**
   * parallel projection settings, Note that this will only be used for VOLUME_3D viewport. You can't modify the
   * parallel projection of a stack viewport or volume viewport using viewport input options.
   */
  parallelProjection?: boolean;
};

export default ViewportInputOptions;
