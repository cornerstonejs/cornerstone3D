import { StackViewport, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

/**
 * Gets the desired spacing for points in the polyline for the
 * `PlanarFreehandROITool` in the x and y canvas directions, as well as
 * returning these canvas directions in world space.
 *
 * The in-plane spacing/direction geometry is shared with the rest of the
 * library via `csUtils.getInPlaneSpacingAndXYDirections`; this wrapper just
 * resolves the in-plane axes from the viewport and applies the sub-pixel
 * resolution divisor.
 *
 * @param viewport - The Cornerstone3D `StackViewport` or `VolumeViewport`.
 * @param subPixelResolution - The number to divide the image pixel spacing by
 * to get the sub pixel spacing. E.g. `10` will return spacings 10x smaller than
 * the native image spacing.
 * @returns The spacings of the X and Y directions, and the 3D directions of the
 * x and y directions.
 */
const getSubPixelSpacingAndXYDirections = (
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  subPixelResolution: number
): { spacing: Types.Point2; xDir: Types.Point3; yDir: Types.Point3 } => {
  const imageData = viewport.getImageData();

  if (!imageData) {
    return;
  }

  let viewRight: Types.Point3;
  let viewUp: Types.Point3;

  if (viewport instanceof StackViewport) {
    // For a stack the image row/column directions are the in-plane axes.
    viewRight = imageData.direction.slice(0, 3) as Types.Point3;
    viewUp = imageData.direction.slice(3, 6) as Types.Point3;
  } else {
    // For a volume the in-plane axes come from the camera.
    const { viewPlaneNormal, viewUp: cameraViewUp } = viewport.getCamera();

    viewRight = vec3.cross(
      vec3.create(),
      cameraViewUp as vec3,
      viewPlaneNormal as vec3
    ) as Types.Point3;
    viewUp = cameraViewUp as Types.Point3;
  }

  const { spacing, xDir, yDir } = csUtils.getInPlaneSpacingAndXYDirections(
    { direction: imageData.direction, spacing: imageData.spacing },
    viewRight,
    viewUp
  );

  const subPixelSpacing: Types.Point2 = [
    spacing[0] / subPixelResolution,
    spacing[1] / subPixelResolution,
  ];

  return { spacing: subPixelSpacing, xDir, yDir };
};

export default getSubPixelSpacingAndXYDirections;
