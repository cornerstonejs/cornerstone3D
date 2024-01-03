import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import { vec3 } from 'gl-matrix';
import { BoundsIJK } from '../types';
import { getBoundingBoxAroundShapeIJK } from './boundingBox';

const { transformWorldToIndex } = csUtils;

/**
 * Given an imageData, and the great circle top and bottom points of a sphere,
 * this function will run the callback for each point of the imageData that is
 * within the sphere defined by the great circle points. If the viewport
 * is provided, region of interest will be an accurate approximation of the
 * sphere (using viewport camera), and the resulting performance will be
 * better.
 *
 * @privateRemarks great circle also known as orthodrome is the intersection of
 * the sphere and the plane that passes through the center of the sphere
 *
 * @param imageData - The volume imageData
 * @param circlePoints - bottom and top points of the great circle in world coordinates
 * @param callback - A callback function that will be called for each point in the shape.
 */
function getSphereBoundsInfo(
  circlePoints: [Types.Point3, Types.Point3],
  imageData: vtkImageData,
  viewport
): {
  boundsIJK: BoundsIJK;
  centerWorld: Types.Point3;
  radiusWorld: number;
  topLeftWorld: Types.Point3;
  bottomRightWorld: Types.Point3;
} {
  const [bottom, top] = circlePoints;

  // Sphere center in world
  const centerWorld = vec3.fromValues(
    (bottom[0] + top[0]) / 2,
    (bottom[1] + top[1]) / 2,
    (bottom[2] + top[2]) / 2
  );

  // sphere radius in world
  const radiusWorld = vec3.distance(bottom, top) / 2;

  if (!viewport) {
    throw new Error(
      'viewport is required in order to calculate the sphere bounds'
    );
  }

  const { boundsIJK, topLeftWorld, bottomRightWorld } =
    _computeBoundsIJKWithCamera(
      imageData,
      viewport,
      circlePoints,
      centerWorld,
      radiusWorld
    );

  return {
    boundsIJK,
    centerWorld: centerWorld as Types.Point3,
    radiusWorld,
    topLeftWorld: topLeftWorld as Types.Point3,
    bottomRightWorld: bottomRightWorld as Types.Point3,
  };
}

function _computeBoundsIJKWithCamera(
  imageData,
  viewport,
  circlePoints,
  centerWorld,
  radiusWorld
) {
  const [bottom, top] = circlePoints;

  const dimensions = imageData.getDimensions() as Types.Point3;

  const camera = viewport.getCamera();

  // Calculate viewRight from the camera, this will get used in order to
  // calculate circles topLeft and bottomRight on different planes of intersection
  // between sphere and viewPlane
  const viewUp = vec3.fromValues(
    camera.viewUp[0],
    camera.viewUp[1],
    camera.viewUp[2]
  );
  const viewPlaneNormal = vec3.fromValues(
    camera.viewPlaneNormal[0],
    camera.viewPlaneNormal[1],
    camera.viewPlaneNormal[2]
  );
  const viewRight = vec3.create();

  vec3.cross(viewRight, viewUp, viewPlaneNormal);

  // we need to find the bounding box of the sphere in the image, e.g., the
  // topLeftWorld and bottomRightWorld points of the bounding box.
  // We go from the sphereCenter in the normal direction of amount radius, and
  // we go left to find the topLeftWorld point of the bounding box. Next we go
  // in the opposite direction and go right to find the bottomRightWorld point
  // of the bounding box.
  const topLeftWorld = vec3.create();
  const bottomRightWorld = vec3.create();

  vec3.scaleAndAdd(topLeftWorld, top, viewPlaneNormal, radiusWorld);
  vec3.scaleAndAdd(bottomRightWorld, bottom, viewPlaneNormal, -radiusWorld);

  // go in the direction of viewRight with the value of radius
  vec3.scaleAndAdd(topLeftWorld, topLeftWorld, viewRight, -radiusWorld);
  vec3.scaleAndAdd(bottomRightWorld, bottomRightWorld, viewRight, radiusWorld);

  // In order to correctly come up with the boundsIJK, we need to consider
  // all the points IJK to get the bounds, since the viewport might have
  // rotate views and we cannot guarantee that the topLeft and bottomRight in the
  // world, are the ones that will define the bounds in IJK
  const topLeftIJK = transformWorldToIndex(
    imageData,
    topLeftWorld as Types.Point3
  );
  const bottomRightIJK = transformWorldToIndex(
    imageData,
    bottomRightWorld as Types.Point3
  );

  const pointsIJK = circlePoints.map((p) =>
    transformWorldToIndex(imageData, p)
  );

  // get the bounding box of the sphere in the image
  const boundsIJK = getBoundingBoxAroundShapeIJK(
    [topLeftIJK, bottomRightIJK, ...pointsIJK],
    dimensions
  );

  return { boundsIJK, topLeftWorld, bottomRightWorld };
}

export { getSphereBoundsInfo };
