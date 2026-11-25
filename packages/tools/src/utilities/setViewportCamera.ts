import { utilities, Enums, type Types } from '@cornerstonejs/core';

type CameraWritableViewport = Types.IViewport & {
  setCamera?: (camera: Partial<Types.ICamera>) => void;
  setViewState?: (state: Partial<Types.ICamera>) => void;
  setViewReference?: (viewRef: Types.ViewReference) => void;
  resetCamera?: (options?: unknown) => boolean | void;
  resetViewState?: (options?: unknown) => boolean | void;
};

function normalizeVec3(v: Types.Point3): Types.Point3 {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : v;
}

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
    // A PLANAR_NEXT viewport (slab / MPR / MIP) expresses orientation through its
    // view reference (viewPlaneNormal / viewUp / focalPoint), not through
    // setViewState - PlanarViewState holds only an in-plane rotation and silently
    // drops an off-axis viewPlaneNormal, so camera-rotation tools (e.g.
    // VolumeRotate on the TMTV MIP) were no-ops. Rewrite the rotation through
    // setViewReference, deriving the view-plane normal from position -> focalPoint
    // when the camera does not carry one. VOLUME_3D_NEXT continues to apply the
    // full camera (position/parallelScale/etc.) via setViewState
    // (-> applyVolume3DCamera).
    if (
      (viewport as { type?: string }).type === Enums.ViewportType.PLANAR_NEXT &&
      typeof vp.setViewReference === 'function'
    ) {
      const ref = viewport.getViewReference();
      const focalPoint = camera.focalPoint ?? ref?.cameraFocalPoint;
      const viewUp = camera.viewUp ?? ref?.viewUp;
      let viewPlaneNormal = camera.viewPlaneNormal;

      if (!viewPlaneNormal && camera.position && focalPoint) {
        // viewPlaneNormal points from the focal point toward the camera
        // (position - focalPoint), matching cornerstone's convention; the
        // reverse sign flips the slab ~180deg, so a single rotation step would
        // jump instead of advancing by the tool's increment.
        viewPlaneNormal = normalizeVec3([
          camera.position[0] - focalPoint[0],
          camera.position[1] - focalPoint[1],
          camera.position[2] - focalPoint[2],
        ]);
      }

      // A PlanarViewport re-fits the parallel scale to the reformatted slice
      // extent for each orientation, so re-aiming the view reference would change
      // the absolute on-screen scale even though the zoom presentation is
      // unchanged - the rotation appears to zoom in/out. Legacy setCamera kept
      // parallelScale fixed during a rotation; mirror that by capturing the
      // resolved scale before the rotation and restoring it through the zoom
      // presentation afterward (zoom compensates for the per-orientation refit).
      const rotatingVp = viewport as Types.IViewport & {
        getResolvedView?: () => {
          toICamera?: () => { parallelScale?: number };
        };
        invalidateResolvedView?: () => void;
        getZoom?: () => number;
        setZoom?: (zoom: number) => void;
      };
      const readResolvedScale = () =>
        rotatingVp.getResolvedView?.()?.toICamera?.()?.parallelScale;
      const beforeScale = readResolvedScale();
      const beforeZoom = rotatingVp.getZoom?.();

      vp.setViewReference({
        ...ref,
        cameraFocalPoint: focalPoint,
        viewPlaneNormal,
        viewUp,
      } as Types.ViewReference);

      rotatingVp.invalidateResolvedView?.();
      const afterScale = readResolvedScale();

      if (
        beforeScale &&
        afterScale &&
        typeof beforeZoom === 'number' &&
        typeof rotatingVp.setZoom === 'function'
      ) {
        // resolved parallelScale is inversely proportional to zoom, so to keep the
        // absolute scale (beforeScale) at the new orientation: newZoom =
        // afterScale * beforeZoom / beforeScale.
        const newZoom = (afterScale * beforeZoom) / beforeScale;
        if (Number.isFinite(newZoom) && newZoom > 0) {
          rotatingVp.setZoom(newZoom);
        }
      }

      viewport.render();
      return;
    }

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
