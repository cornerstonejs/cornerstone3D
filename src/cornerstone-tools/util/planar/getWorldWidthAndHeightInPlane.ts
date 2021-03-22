import {Point3} from '../../types'
import { vec3 } from 'gl-matrix';

/**
 * @function getWorldWidthAndHeightInPlane Given two world positions and an
 * orthogonal view to an `imageVolume` defined by a `viewPlaneNormal` and a
 * `viewUp`, get the width and height in world coordinates of the rectangle
 * defined by the two points.
 *
 * @param {Point3} viewPlaneNormal The normal of the view.
 * @param {Point3} viewUp The up direction of the view.
 * @param {object} imageVolume The imageVolume to use to measure.
 * @param {Point3} worldPos1 The first world position.
 * @param {Point3} worldPos2 The second world position.
 *
 * @returns {object} The `worldWidth` and `worldHeight`.
 */
export default function getWorldWidthAndHeightInPlane(
  viewPlaneNormal: Point3,
  viewUp: Point3,
  imageVolume,
  worldPos1: Point3,
  worldPos2: Point3
) {
  const { direction } = imageVolume;

  const iDirection = direction.slice(0, 3);
  const jDirection = direction.slice(3, 6);
  const kDirection = direction.slice(6, 9);

  let viewRight = vec3.create();

  vec3.cross(viewRight, <vec3>viewUp, <vec3>viewPlaneNormal);

  viewRight = [-viewRight[0], -viewRight[1], -viewRight[2]];

  let xDir;
  let yDir;

  if (Math.abs(vec3.dot(iDirection, <vec3>viewUp)) > 0.999) {
    xDir = 0;
  } else if (Math.abs(vec3.dot(jDirection, <vec3>viewUp)) > 0.999) {
    xDir = 1;
  } else if (Math.abs(vec3.dot(kDirection, <vec3>viewUp)) > 0.999) {
    xDir = 2;
  } else {
    console.warn(
      'Can only currently do area calculation for orthogonal views.'
    );

    return { worldWidth: 0, worldHeight: 0 };
  }

  if (Math.abs(vec3.dot(iDirection, viewRight)) > 0.999) {
    yDir = 0;
  } else if (Math.abs(vec3.dot(jDirection, viewRight)) > 0.999) {
    yDir = 1;
  } else if (Math.abs(vec3.dot(kDirection, viewRight)) > 0.999) {
    yDir = 2;
  } else {
    console.warn(
      'Can only currently do area calculation for orthogonal views.'
    );

    return { worldWidth: 0, worldHeight: 0 };
  }

  const worldWidth = Math.abs(worldPos1[xDir] - worldPos2[xDir]);
  const worldHeight = Math.abs(worldPos1[yDir] - worldPos2[yDir]);

  return { worldWidth, worldHeight };
}
