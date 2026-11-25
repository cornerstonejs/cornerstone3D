import type { ICamera, Point2, Point3 } from '../../../types';
import ResolvedViewportView from '../ResolvedViewportView';
import type {
  WSIImageDataMetadata,
  WSIMapViewLike,
} from '../../../utilities/WSIUtilities';
import {
  canvasToIndexForWSI,
  indexToCanvasForWSI,
  indexToWorldWSIMetadata,
  worldToIndexWSIMetadata,
} from './wsiTransformUtils';
import type { WSIViewState } from './WSIViewportTypes';

type WSIResolvedViewState = {
  viewState: WSIViewState;
  canvasHeight: number;
  canvasWidth: number;
  frameOfReferenceUID?: string | null;
  metadata?: WSIImageDataMetadata;
  view: WSIMapViewLike;
};

class WSIResolvedView extends ResolvedViewportView<WSIResolvedViewState> {
  canvasToWorld(canvasPos: Point2): Point3 {
    const indexPoint = canvasToIndexForWSI({
      canvasHeight: this.state.canvasHeight,
      canvasPos,
      canvasWidth: this.state.canvasWidth,
      view: this.state.view,
    });

    return indexToWorldWSIMetadata(this.state.metadata, indexPoint);
  }

  worldToCanvas(worldPos: Point3): Point2 {
    return indexToCanvasForWSI({
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      indexPos: worldToIndexWSIMetadata(this.state.metadata, worldPos),
      view: this.state.view,
    });
  }

  getFrameOfReferenceUID(): string | undefined {
    return this.state.frameOfReferenceUID || undefined;
  }

  withZoom(zoom: number, canvasPoint?: Point2): WSIResolvedView {
    const nextZoom = Math.max(zoom, 0.001);
    const nextResolution = this.getResolutionForZoom(nextZoom);

    if (!canvasPoint) {
      return this.cloneWithViewState({
        ...this.state.viewState,
        resolution: nextResolution,
        zoom: nextZoom,
      });
    }

    const indexPoint = this.canvasToIndex(canvasPoint);

    return this.cloneWithViewState({
      ...this.state.viewState,
      centerIndex: this.getCenterIndexForCanvasPoint({
        canvasPoint,
        indexPoint,
        resolution: nextResolution,
      }),
      resolution: nextResolution,
      zoom: nextZoom,
    });
  }

  protected buildICamera(): ICamera {
    const focalPoint = this.canvasToWorld([
      this.state.canvasWidth / 2,
      this.state.canvasHeight / 2,
    ]);
    const xSpacing = this.state.metadata?.spacing?.[0] || 1;
    const resolution = this.getResolution();

    return {
      parallelProjection: true,
      focalPoint,
      position: focalPoint,
      viewUp: [0, -1, 0],
      parallelScale: this.state.canvasHeight * resolution * xSpacing,
      viewPlaneNormal: [0, 0, 1],
      rotation:
        this.state.view.getRotation?.() || this.state.viewState.rotation || 0,
    };
  }

  private canvasToIndex(canvasPos: Point2): Point2 {
    const indexPoint = canvasToIndexForWSI({
      canvasHeight: this.state.canvasHeight,
      canvasPos,
      canvasWidth: this.state.canvasWidth,
      view: this.state.view,
    });

    return [indexPoint[0], indexPoint[1]];
  }

  private getResolution(): number {
    return (
      this.state.view.getResolution?.() || this.state.viewState.resolution || 1
    );
  }

  private getResolutionForZoom(zoom: number): number {
    const viewZoom =
      this.state.view.getZoom?.() || this.state.viewState.zoom || 1;

    return (
      this.state.view.getResolutionForZoom?.(zoom) ??
      this.getResolution() / Math.pow(2, zoom - viewZoom)
    );
  }

  private getCenterIndexForCanvasPoint(args: {
    canvasPoint: Point2;
    indexPoint: Point2;
    resolution: number;
  }): [number, number] {
    const { canvasPoint, indexPoint, resolution } = args;
    const pixelRatio =
      typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const halfCanvasX = Math.max(this.state.canvasWidth, 1) / 2;
    const halfCanvasY = Math.max(this.state.canvasHeight, 1) / 2;
    const deltaCanvasX = canvasPoint[0] * pixelRatio - halfCanvasX;
    const deltaCanvasY = canvasPoint[1] * pixelRatio - halfCanvasY;
    const rotation =
      this.state.view.getRotation?.() || this.state.viewState.rotation || 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const rotatedDeltaX = cos * deltaCanvasX + sin * deltaCanvasY;
    const rotatedDeltaY = -sin * deltaCanvasX + cos * deltaCanvasY;

    return [
      indexPoint[0] - rotatedDeltaX * resolution,
      indexPoint[1] + rotatedDeltaY * resolution,
    ];
  }

  private cloneWithViewState(viewState: WSIViewState): WSIResolvedView {
    return new WSIResolvedView({
      ...this.state,
      viewState,
    });
  }
}

export type { WSIResolvedViewState };
export default WSIResolvedView;
