import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';

/** Turns the camera of one viewport to an exact oblique angle. */
export interface ObliqueAngleController {
  /**
   * Rotates the viewport to `degrees` from the camera that the controller
   * captured. The angle is absolute and not relative, so the same value always
   * gives the same plane, and 0 gives the captured camera again.
   */
  setAngle(degrees: number): void;
}

/**
 * Creates a controller that rotates a volume viewport about the world X axis
 * by an exact angle.
 *
 * An example uses this controller to make a plane oblique. An oblique plane
 * has no shared X, Y or Z value across the points of a shape, so the plane
 * cuts the voxel grid at an angle. A tool that walks an axis-aligned box, or
 * that carries a depth tolerance of its own, fails on such a plane, which is
 * why the segmentation examples test on one.
 *
 * The controller reads the camera of `viewport` one time, at construction, and
 * every later angle turns that captured camera. Construct the controller after
 * the viewport renders the volume, because a viewport with no volume reports
 * no useful camera.
 *
 * The rotation keeps the focal point of the captured camera, so the plane
 * always turns about the centre of the volume.
 *
 * @param viewport - The viewport to rotate.
 */
export default function createObliqueAngleController(
  viewport: Types.IVolumeViewport
): ObliqueAngleController {
  const { viewPlaneNormal, viewUp, focalPoint, position } =
    viewport.getCamera();

  const base = {
    viewPlaneNormal: [...viewPlaneNormal] as Types.Point3,
    viewUp: [...viewUp] as Types.Point3,
    focalPoint: [...focalPoint] as Types.Point3,
    distance: vec3.distance(position as vec3, focalPoint as vec3),
  };

  return {
    setAngle(degrees: number) {
      const radians = (degrees * Math.PI) / 180;
      const origin: Types.Point3 = [0, 0, 0];
      const nextNormal = vec3.create();
      const nextViewUp = vec3.create();

      vec3.rotateX(nextNormal, base.viewPlaneNormal, origin, radians);
      vec3.rotateX(nextViewUp, base.viewUp, origin, radians);

      // The view plane normal points from the focal point towards the camera.
      // `setCamera` must also get the new position, because `viewPlaneNormal`
      // alone turns the camera about its position, and that moves the focal
      // point out of the volume.
      const nextPosition = vec3.scaleAndAdd(
        vec3.create(),
        base.focalPoint as vec3,
        nextNormal,
        base.distance
      );

      viewport.setCamera({
        focalPoint: base.focalPoint,
        position: Array.from(nextPosition) as Types.Point3,
        viewPlaneNormal: Array.from(nextNormal) as Types.Point3,
        viewUp: Array.from(nextViewUp) as Types.Point3,
      });

      // The focal point above is the centre of the volume, and the centre does
      // not sit on the grid of slice positions of the new normal. A fill would
      // then write a plane that lies between two slice positions, and the
      // neighbouring slices would each show a part of that plane. `scroll(0)`
      // moves no slice, and it rounds the focal point onto the nearest slice
      // position.
      viewport.scroll(0);
      viewport.render();
    },
  };
}
