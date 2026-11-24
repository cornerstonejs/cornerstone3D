import type vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import { RENDERING_DEFAULTS } from '../../constants';

export default function setVtkCameraClippingRange(camera: vtkCamera): void {
  if (camera.getParallelProjection()) {
    camera.setClippingRange(
      -RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE,
      RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
    );
    return;
  }

  camera.setClippingRange(
    RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
    RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
  );
}
