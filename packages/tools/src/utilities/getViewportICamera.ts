import { type Types, utilities } from '@cornerstonejs/core';

type ViewportICamera = Pick<
  Types.ICamera,
  'focalPoint' | 'position' | 'viewPlaneNormal' | 'viewUp'
>;

export default function getViewportICamera(
  viewport: Types.IViewport,
  viewReference: Types.ViewReference = viewport.getViewReference()
): Partial<ViewportICamera> {
  const nextViewport = viewport as Types.IViewport & {
    getResolvedView?: () =>
      | {
          toICamera?: () => Partial<Types.ICamera>;
        }
      | undefined;
  };
  const camera = (nextViewport.getResolvedView?.()?.toICamera?.() ||
    viewport.getCamera?.() ||
    {}) as Partial<Types.ICamera>;
  const focalPoint = utilities.clonePoint3(
    viewReference?.cameraFocalPoint || camera.focalPoint
  );
  const viewPlaneNormal = utilities.clonePoint3(
    viewReference?.viewPlaneNormal || camera.viewPlaneNormal
  );
  const viewUp = utilities.clonePoint3(viewReference?.viewUp || camera.viewUp);
  const position = utilities.clonePoint3(
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
