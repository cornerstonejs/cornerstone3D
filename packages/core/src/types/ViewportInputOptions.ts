import type { OrientationAxis } from '../enums';
import type OrientationVectors from './OrientationVectors';
import type DisplayArea from './displayArea';
import type RGB from './RGB';

/**
 * This type defines the shape of viewport input options, so we can throw when it is incorrect.
 */
interface ViewportInputOptions {
  /** background color */
  background?: RGB;
  /** orientation of the viewport which can be either an Enum for axis Enums.OrientationAxis.[AXIAL|SAGITTAL|CORONAL|DEFAULT] or an object with viewPlaneNormal and viewUp */
  orientation?: OrientationAxis | OrientationVectors;
  /** Planar viewport render mode selected at viewport creation time. */
  renderMode?: string;
  /** displayArea of interest */
  displayArea?: DisplayArea;
  /** whether the events should be suppressed and not fired*/
  suppressEvents?: boolean;
  /**
   * parallel projection settings. This is used by 3D volume viewports (`VOLUME_3D` and `VOLUME_3D_V2`).
   * You can't modify the parallel projection of a stack viewport or orthographic volume viewport using viewport input options.
   */
  parallelProjection?: boolean;
}

export type { ViewportInputOptions as default };
