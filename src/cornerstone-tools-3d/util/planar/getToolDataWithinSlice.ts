import { vec3 } from 'gl-matrix';
import isSameVec3 from '../isSameVec3';

export default function getToolDataWithinSlice(
  toolData,
  camera,
  spacingInNormalDirection
) {
  const { viewPlaneNormal } = camera;
  const toolDataWithSameNormal = toolData.filter(td =>
    isSameVec3(td.metadata.viewPlaneNormal, viewPlaneNormal)
  );

  // Get data in plane with focal point.

  if (!toolDataWithSameNormal.length) {
    // No in plane toolData.
    return [];
  }

  const halfSpacingInNormalDirection = spacingInNormalDirection / 2;

  const { focalPoint } = camera;

  const toolDataWithinSlice = [];

  for (let i = 0; i < toolDataWithSameNormal.length; i++) {
    // TODO -> see if annotation lies within slice distance.
    // Get vector
    const toolData = toolDataWithSameNormal[i];
    const data = toolData.data;
    const point = data.handles.points[0];

    // A = point
    // B = focal point
    // P = normal

    // B-A dot P  => Distance in the view direction.
    // this should be less than half the slice distance.

    let dir = [];

    vec3.sub(dir, focalPoint, point);

    const dot = vec3.dot(dir, viewPlaneNormal);

    if (Math.abs(dot) < halfSpacingInNormalDirection) {
      toolDataWithinSlice.push(toolData);
    }
  }

  return toolDataWithinSlice;
}
