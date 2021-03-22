
import { vec3 } from 'gl-matrix';
import math from '../math';
import { ToolSpecificToolState, Point3 } from '../../types'

/**
 * @function getToolStateWithinSlice given some `ToolSpecificToolState`, and the slice
 * defined by the camera's normal direction and the spacing in the normal, filter
 * the `ToolSpecificToolState` which is within the slice.
 *
 * @param {ToolSpecificToolState} toolState
 * @param {object} camera
 * @param {number} spacingInNormalDirection
 * @returns {ToolSpecificToolState} The filtered `ToolSpecificToolState`.
 */
export default function getToolStateWithinSlice(
  toolState: ToolSpecificToolState,
  camera,
  spacingInNormalDirection: number
): ToolSpecificToolState {
  const { viewPlaneNormal } = camera;
  const toolStateWithSameNormal = toolState.filter((td) => {
    const toolDataViewPlaneNormal = td.metadata.viewPlaneNormal;
    return math.vec3.isEqual(<Point3>toolDataViewPlaneNormal, viewPlaneNormal)
  });

  // Get data in plane with focal point.
  if (!toolStateWithSameNormal.length) {
    // No in plane toolState.
    return [];
  }

  const halfSpacingInNormalDirection = spacingInNormalDirection / 2;

  const { focalPoint } = camera;

  const toolStateWithinSlice = [];

  for (let i = 0; i < toolStateWithSameNormal.length; i++) {
    // TODO -> see if annotation lies within slice distance.
    // Get vector
    const toolState = toolStateWithSameNormal[i];
    const data = toolState.data;
    const point = data.handles.points[0];

    // A = point
    // B = focal point
    // P = normal

    // B-A dot P  => Distance in the view direction.
    // this should be less than half the slice distance.

    let dir = vec3.create();

    vec3.sub(dir, focalPoint, point);

    const dot = vec3.dot(dir, viewPlaneNormal);

    if (Math.abs(dot) < halfSpacingInNormalDirection) {
      toolStateWithinSlice.push(toolState);
    }
  }

  return toolStateWithinSlice;
}
