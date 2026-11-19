import type {
  Volume3DCamera,
  Volume3DViewportRenderContext,
} from './viewport3DTypes';
import setVtkCameraClippingRange from '../setVtkCameraClippingRange';

/**
 * Writes the fields of a camera patch into the vtk.js camera of a 3D
 * viewport, then fits the clipping range with `fitVolume3DClippingRange`. A
 * `clippingRange` of the patch is not applied: the legacy 3D viewport fitted
 * the range after each `setCamera` too.
 */
export default function applyVolume3DCamera(
  ctx: Pick<Volume3DViewportRenderContext, 'vtk'>,
  camera?: Partial<Volume3DCamera>
): void {
  if (!camera) {
    return;
  }

  const vtkCamera = ctx.vtk.renderer.getActiveCamera();

  if (camera.parallelProjection !== undefined) {
    vtkCamera.setParallelProjection(camera.parallelProjection);
  }

  if (camera.viewUp) {
    vtkCamera.setViewUp(...camera.viewUp);
  }

  if (camera.viewPlaneNormal) {
    vtkCamera.setDirectionOfProjection(
      -camera.viewPlaneNormal[0],
      -camera.viewPlaneNormal[1],
      -camera.viewPlaneNormal[2]
    );
  }

  if (camera.position) {
    vtkCamera.setPosition(...camera.position);
  }

  if (camera.focalPoint) {
    vtkCamera.setFocalPoint(...camera.focalPoint);
  }

  if (camera.parallelScale !== undefined) {
    vtkCamera.setParallelScale(camera.parallelScale);
  }

  if (camera.viewAngle !== undefined) {
    vtkCamera.setViewAngle(camera.viewAngle);
  }

  fitVolume3DClippingRange(ctx);
}

/**
 * Fits the clipping range of the camera of a 3D viewport to the bounds of
 * every visible prop of its renderer (the display sets and the props that a
 * tool or the application added), as the legacy 3D viewport did at
 * `setVolumes`, `setCamera` and `resetCamera`. With nothing visible the range
 * is the default of the projection.
 */
export function fitVolume3DClippingRange(
  ctx: Pick<Volume3DViewportRenderContext, 'vtk'>
): void {
  setVtkCameraClippingRange(ctx.vtk.renderer.getActiveCamera());
  ctx.vtk.renderer.resetCameraClippingRange();
}
