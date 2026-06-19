import { utilities, type Types } from '@cornerstonejs/core';

type CameraWritableViewport = Types.IViewport & {
  setCamera?: (camera: Partial<Types.ICamera>) => void;
  setViewState?: (state: Partial<Types.ICamera>) => void;
  resetCamera?: (options?: unknown) => boolean | void;
  resetViewState?: (options?: unknown) => boolean | void;
};

/**
 * Writes camera state to a viewport in a lane-agnostic way, the write counterpart of
 * getViewportICamera. Legacy viewports use setCamera; direct Generic ("next") viewports
 * have no setCamera. A 3D Generic viewport (VolumeViewport3D) applies the same camera
 * fields (position/focalPoint/viewUp/viewPlaneNormal/parallelScale) through setViewState
 * (-> applyVolume3DCamera on the vtk camera), so 3D-camera tooling (trackball rotate,
 * volume rotate/cropping, orientation controller) works on native 3D viewports.
 *
 * @param viewport - any cornerstone viewport
 * @param camera - the camera fields to apply
 */
export default function setViewportCamera(
  viewport: Types.IViewport,
  camera: Partial<Types.ICamera>
): void {
  const vp = viewport as CameraWritableViewport;
  if (utilities.isGenericViewport(viewport)) {
    vp.setViewState?.(camera);
    return;
  }
  vp.setCamera?.(camera);
}

/**
 * Resets a viewport's camera lane-agnostically. Legacy uses resetCamera; native uses
 * resetViewState (which resets pan/zoom/orientation/flip). Native viewports do not
 * expose resetCamera by design.
 */
export function resetViewportCamera(
  viewport: Types.IViewport,
  options?: unknown
): void {
  const vp = viewport as CameraWritableViewport;
  if (utilities.isGenericViewport(viewport)) {
    vp.resetViewState?.(options);
    return;
  }
  vp.resetCamera?.(options);
}
