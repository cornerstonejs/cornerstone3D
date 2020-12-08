import { vec3 } from 'gl-matrix';

export default function getSpacingInNormalDirection(
  imageVolume,
  viewPlaneNormal
) {
  const { direction, spacing } = imageVolume;

  // Calculate size of spacing vector in normal direction
  const iVector = direction.slice(0, 3);
  const jVector = direction.slice(3, 6);
  const kVector = direction.slice(6, 9);

  const dotProducts = [
    vec3.dot(iVector, viewPlaneNormal),
    vec3.dot(jVector, viewPlaneNormal),
    vec3.dot(kVector, viewPlaneNormal),
  ];

  const projectedSpacing = vec3.create();

  vec3.set(
    projectedSpacing,
    dotProducts[0] * spacing[0],
    dotProducts[1] * spacing[1],
    dotProducts[2] * spacing[2]
  );

  const spacingInNormalDirection = vec3.length(projectedSpacing);

  return spacingInNormalDirection;
}
