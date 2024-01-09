import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import { vec3 } from 'gl-matrix';
import { pointInSphere } from './math/sphere';
import pointInShapeCallback, {
  PointInShapeCallback,
} from './pointInShapeCallback';
import { BoundsIJK } from '../types';
import { getBoundingBoxAroundShape } from './boundingBox';

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
export default function pointInSurroundingSphereCallback(
  imageData: vtkImageData,
  circlePoints: [Types.Point3, Types.Point3],
  callback: PointInShapeCallback,
  viewport?: Types.IVolumeViewport
): void {
  // We can run the sphere equation to determine if a point is inside
  // the sphere; however, since the imageData dimensions can be quite large, we
  // can narrow down the search by estimating the bounds of the sphere in index
  // space.
  const { boundsIJK, centerWorld, radiusWorld } = _getBounds(
    circlePoints,
    imageData,
    viewport
  );

  const sphereObj = {
    center: centerWorld,
    radius: radiusWorld,
  };

  pointInShapeCallback(
    imageData,
    (pointLPS) => pointInSphere(sphereObj, pointLPS),
    callback,
    boundsIJK
  );
}

function _getBounds(
  circlePoints: [Types.Point3, Types.Point3],
  imageData: vtkImageData,
  viewport
): {
  boundsIJK: BoundsIJK;
  centerWorld: Types.Point3;
  radiusWorld: number;
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

  let boundsIJK;

  if (!viewport) {
    // If no viewport is provide (no camera), we can estimate the bounding box
    // of the sphere in index space.
    // This is done by calculating the maximum value for radius in the index
    // space (since the radius is in world space, we need to convert it to index, and
    // each dimensions can have a different scale factor). Therefore, by finding
    // the minimum spacing value in the imageData, we can calculate the maximum
    // radius in index space and use that to calculate the bounds of the sphere
    // This will not be accurate, but it is a good first approximation.
    // sphere center in index
    const centerIJK = transformWorldToIndex(
      imageData,
      centerWorld as Types.Point3
    );

    const spacings = imageData.getSpacing();
    const minSpacing = Math.min(...spacings);

    const maxRadiusIJK = Math.ceil(radiusWorld / minSpacing);

    boundsIJK = [
      [centerIJK[0] - maxRadiusIJK, centerIJK[0] + maxRadiusIJK],
      [centerIJK[1] - maxRadiusIJK, centerIJK[1] + maxRadiusIJK],
      [centerIJK[2] - maxRadiusIJK, centerIJK[2] + maxRadiusIJK],
    ];

    return {
      boundsIJK,
      centerWorld: centerWorld as Types.Point3,
      radiusWorld,
    };
  }

  boundsIJK = _computeBoundsIJKWithCamera(
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

  // convert the world coordinates to index coordinates

  const sphereCornersIJK = [
    <Types.Point3>transformWorldToIndex(imageData, <Types.Point3>topLeftWorld),
    <Types.Point3>(
      transformWorldToIndex(imageData, <Types.Point3>bottomRightWorld)
    ),
  ];

  // get the bounding box of the sphere in the image
  const boundsIJK = getBoundingBoxAroundShape(sphereCornersIJK, dimensions);

  return boundsIJK;
}
