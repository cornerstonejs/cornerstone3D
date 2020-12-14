import { vec3 } from 'gl-matrix';

export default function getWorldWidthAndHeightInPlane(
  viewPlaneNormal,
  viewUp,
  imageVolume,
  worldPos1,
  worldPos2
) {
  const { direction } = imageVolume;

  const iDirection = direction.slice(0, 3);
  const jDirection = direction.slice(3, 6);
  const kDirection = direction.slice(6, 9);

  let viewRight = vec3.create();

  vec3.cross(viewRight, viewUp, viewPlaneNormal);

  viewRight = [-viewRight[0], -viewRight[1], -viewRight[2]];

  let xDir;
  let yDir;

  if (Math.abs(vec3.dot(iDirection, viewUp)) > 0.999) {
    xDir = 0;
  } else if (Math.abs(vec3.dot(jDirection, viewUp)) > 0.999) {
    xDir = 1;
  } else if (Math.abs(vec3.dot(kDirection, viewUp)) > 0.999) {
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
