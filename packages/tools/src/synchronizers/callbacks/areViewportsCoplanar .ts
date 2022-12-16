import { vec3 } from 'gl-matrix';
import { Types } from '@cornerstonejs/core';

export default function areViewportsCoplanar(
  viewport1: Types.IStackViewport,
  viewport2: Types.IStackViewport
): boolean {
  const { viewPlaneNormal: viewPlaneNormal1 } = viewport1.getCamera();
  const { viewPlaneNormal: viewPlaneNormal2 } = viewport2.getCamera();
  const dotProducts = vec3.dot(viewPlaneNormal1, viewPlaneNormal2);
  return Math.abs(dotProducts) > 0.9;
}
