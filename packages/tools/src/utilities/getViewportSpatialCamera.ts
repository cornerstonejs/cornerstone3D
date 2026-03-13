import type { Types } from '@cornerstonejs/core';

type SpatialCamera = Pick<
  Types.ICamera,
  'focalPoint' | 'position' | 'viewPlaneNormal' | 'viewUp'
>;

function clonePoint(point?: Types.Point3): Types.Point3 | undefined {
  if (!point) {
    return;
  }

  return [point[0], point[1], point[2]];
}

export default function getViewportSpatialCamera(
  viewport: Types.IViewport,
  viewReference: Types.ViewReference = viewport.getViewReference()
): Partial<SpatialCamera> {
  const camera = (viewport.getCamera?.() || {}) as Partial<Types.ICamera>;
  const focalPoint = clonePoint(
    viewReference?.cameraFocalPoint || camera.focalPoint
  );
  const viewPlaneNormal = clonePoint(
    viewReference?.viewPlaneNormal || camera.viewPlaneNormal
  );
  const viewUp = clonePoint(viewReference?.viewUp || camera.viewUp);
  const position = clonePoint(
    camera.position ||
      (focalPoint &&
        viewPlaneNormal && [
          focalPoint[0] - viewPlaneNormal[0],
          focalPoint[1] - viewPlaneNormal[1],
          focalPoint[2] - viewPlaneNormal[2],
        ])
  );

  return {
    focalPoint,
    position,
    viewPlaneNormal,
    viewUp,
  };
}
