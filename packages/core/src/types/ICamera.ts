import Point2 from './Point2';
import Point3 from './Point3';

/**
 * Camera Interface. See {@link https://kitware.github.io/vtk-examples/site/VTKBook/03Chapter3/#35-cameras} if you
 * want to know more about the camera.
 */
interface ICamera {
  /** Camera Clipping range*/
  clippingRange?: Point2;
  /** Camera Focal point */
  focalPoint?: Point3;
  /** Camera Parallel Projection flag - whether camera is using parallel projection */
  parallelProjection?: boolean;
  /** Camera parallel scale - used for parallel projection zoom, smaller values zoom in */
  parallelScale?: number;
  /** Camera position */
  position?: Point3;
  /** Camera view angle - 90 degrees is orthographic */
  viewAngle?: number;
  /** Camera viewPlaneNormal - negative of the direction the camera is pointing or directionOfProjection*/
  viewPlaneNormal?: Point3;
  /** Camera viewUp - the direction of viewUP in camera */
  viewUp?: Point3;
  /** Camera Slab Thickness */
  slabThickness?: number;
}

export default ICamera;
