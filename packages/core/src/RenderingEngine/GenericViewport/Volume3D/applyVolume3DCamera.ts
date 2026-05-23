import type {
  Volume3DCamera,
  Volume3DViewportRenderContext,
} from './3dViewportTypes';

export default function applyVolume3DCamera(
  ctx: Pick<Volume3DViewportRenderContext, 'vtk'>,
  camera?: Partial<Volume3DCamera>,
  options: { resetClippingRange?: boolean } = {}
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

  if (camera.clippingRange !== undefined) {
    vtkCamera.setClippingRange(...camera.clippingRange);
  } else if (options.resetClippingRange) {
    ctx.vtk.renderer.resetCameraClippingRange();
  }
}
