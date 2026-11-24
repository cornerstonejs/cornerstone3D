import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { ICamera, Point2, Point3 } from '../../../types';
import {
  canvasToWorldContextPool,
  worldToCanvasContextPool,
} from '../../helpers/vtkCanvasCoordinateTransforms';
import ResolvedViewportView from '../ResolvedViewportView';
import type { Volume3DProjectionFit } from './Volume3DProjectionTypes';
import type { Volume3DCamera } from './viewport3DTypes';

type Volume3DResolvedViewState = {
  camera: Volume3DCamera & ICamera;
  canvas: HTMLCanvasElement;
  frameOfReferenceUID?: string;
  renderer: vtkRenderer;
  /**
   * Computes the fit of the viewport: the camera that `resetViewState` would
   * give now, for the direction of the camera or for another one. Undefined
   * when the viewport shows nothing to fit.
   */
  getFit?: (
    direction?: Pick<Volume3DCamera, 'viewPlaneNormal' | 'viewUp'>
  ) => Volume3DProjectionFit | undefined;
};

class Volume3DResolvedView extends ResolvedViewportView<Volume3DResolvedViewState> {
  /**
   * The fit of the viewport, the reference of the zoom and the pan of the
   * projection. It is computed when it is read.
   */
  get fit(): Volume3DProjectionFit | undefined {
    return this.state.getFit?.();
  }

  /**
   * The fit of the viewport for a camera that looks in another direction:
   * the reference of a zoom and a pan written together with that camera.
   */
  getFitFor(
    direction: Pick<Volume3DCamera, 'viewPlaneNormal' | 'viewUp'>
  ): Volume3DProjectionFit | undefined {
    return this.state.getFit?.(direction);
  }

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

export type { Volume3DResolvedViewState };
export default Volume3DResolvedView;
