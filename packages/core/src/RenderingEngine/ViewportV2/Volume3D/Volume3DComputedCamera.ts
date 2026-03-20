import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { ICamera, Point2, Point3 } from '../../../types';
import {
  canvasToWorldContextPool,
  worldToCanvasContextPool,
} from '../../helpers/vtkCanvasCoordinateTransforms';
import ViewportComputedCamera from '../ViewportComputedCamera';
import type { Volume3DCamera } from './3dViewportTypes';

type Volume3DComputedCameraState = {
  camera: Volume3DCamera & ICamera;
  canvas: HTMLCanvasElement;
  frameOfReferenceUID?: string;
  renderer: vtkRenderer;
};

class Volume3DComputedCamera extends ViewportComputedCamera<Volume3DComputedCameraState> {
  canvasToWorld(canvasPos: Point2): Point3 {
    return canvasToWorldContextPool({
      canvas: this.state.canvas,
      canvasPos,
      renderer: this.state.renderer,
    });
  }

  worldToCanvas(worldPos: Point3): Point2 {
    return worldToCanvasContextPool({
      canvas: this.state.canvas,
      renderer: this.state.renderer,
      worldPos,
    });
  }

  getFrameOfReferenceUID(): string | undefined {
    return this.state.frameOfReferenceUID;
  }

  protected buildICamera(): ICamera {
    return {
      ...this.state.camera,
      clippingRange: this.state.camera.clippingRange
        ? [...this.state.camera.clippingRange]
        : this.state.camera.clippingRange,
      focalPoint: this.state.camera.focalPoint
        ? [...this.state.camera.focalPoint]
        : this.state.camera.focalPoint,
      position: this.state.camera.position
        ? [...this.state.camera.position]
        : this.state.camera.position,
      viewPlaneNormal: this.state.camera.viewPlaneNormal
        ? [...this.state.camera.viewPlaneNormal]
        : this.state.camera.viewPlaneNormal,
      viewUp: this.state.camera.viewUp
        ? [...this.state.camera.viewUp]
        : this.state.camera.viewUp,
    };
  }
}

export type { Volume3DComputedCameraState };
export default Volume3DComputedCamera;
