import Point3 from './Point3';
import Point2 from './Point2';

/**
 * Camera Interface. See {@link https://kitware.github.io/vtk-examples/site/VTKBook/03Chapter3/#35-cameras} if you
 * want to know more about the camera.
 */
interface ICamera {
  /** Camera Focal point */
  focalPoint?: Point3;
  /** Camera Parallel Projection flag - whether camera is using parallel projection */
  parallelProjection?: boolean;
  /** Camera parallel scale - used for parallel projection zoom, smaller values zoom in */
  parallelScale?: number;
  /**
   * Scale factor for the camera, it is the ratio of how much an image pixel takes
   * up one screen pixel
   */
  scale?: number;
  /** Camera position */
  position?: Point3;
  /** Camera view angle - 90 degrees is orthographic */
  viewAngle?: number;
  /** Camera viewPlaneNormal - negative of the direction the camera is pointing or directionOfProjection*/
  viewPlaneNormal?: Point3;
  /** Camera viewUp - the direction of viewUP in camera */
  viewUp?: Point3;
  /** flip Horizontal */
  flipHorizontal?: boolean;
  /** flip Vertical */
  flipVertical?: boolean;
  /** clipping range */
  clippingRange?: Point2;
}

export default ICamera;
