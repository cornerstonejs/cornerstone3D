import { vec3 } from 'gl-matrix';
import { Types } from '@cornerstonejs/core';

function _getAreaVector(polyline: Types.Point3[]): Types.Point3 {
  const vecArea = vec3.create();

  // Reference point can be any point on the same plane
  const refPoint = polyline[0];

  // Takes three points, reference point and two other points from each line
  // segment, and calculate the area with cross product. The magnitude of the
  // vector returned by a cross product is equal to the area of the parallelogram
  // that the vectors span which is two times the area of the triangle.
  //
  // Not calling vec3 mathods makes the function run much faster since polylines
  // may have thousands of points when using freehand ROI tool and that would
  // increase considerably the number of function calls.
  for (let i = 0, len = polyline.length; i < len; i++) {
    const p1 = polyline[i];
    // Using ternary instead of % (mod) operator to make it faster
    const p2Index = i === len - 1 ? 0 : i + 1;
    const p2 = polyline[p2Index];

    const aX = p1[0] - refPoint[0];
    const aY = p1[1] - refPoint[1];
    const aZ = p1[2] - refPoint[2];
    const bX = p2[0] - refPoint[0];
    const bY = p2[1] - refPoint[1];
    const bZ = p2[2] - refPoint[2];

    // Cross product without calling vec3.cross() for better performance
    vecArea[0] += aY * bZ - aZ * bY;
    vecArea[1] += aZ * bX - aX * bZ;
    vecArea[2] += aX * bY - aY * bX;
  }

  // Divide by two because cross product returns two times the area for each triangle
  vec3.scale(vecArea, vecArea, 0.5);

  // The magnitude of the vector is the area of the polyline
  return <Types.Point3>vecArea;
}

/**
 * Calculate the normal of a 3D planar polyline
 * @param polyline - Planar polyline in 3D space
 * @returns Normal of the 3D planar polyline
 */
export default function getNormal3(polyline: Types.Point3[]): Types.Point3 {
  const vecArea = _getAreaVector(polyline);

  return vec3.normalize(vecArea, vecArea) as Types.Point3;
}
