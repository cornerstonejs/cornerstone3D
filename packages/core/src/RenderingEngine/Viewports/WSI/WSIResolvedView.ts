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
  /**
   * The map resolution at which the microscopy viewer fits the slide to the
   * canvas. The zoom of the projection is this over the resolution of the
   * map: 1 at the fit, 2 when the slide shows twice as large.
   */
  fitResolution?: number;
};

class WSIResolvedView extends ResolvedViewportView<WSIResolvedViewState> {
  /**
   * The slide point at a canvas point. The microscopy viewer puts the pixel
   * of column x and row y of the total pixel matrix on the map point
   * `[x, -y]`, so the y of the map point is negated to give the row before
   * the image orientation and the origin of the metadata place it on the
   * slide, as the legacy WSI viewport does.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const mapPoint = canvasToIndexForWSI({
      canvasHeight: this.state.canvasHeight,
      canvasPos,
      canvasWidth: this.state.canvasWidth,
      view: this.state.view,
    });

    return indexToWorldWSIMetadata(this.state.metadata, [
      mapPoint[0],
      -mapPoint[1],
      0,
    ]);
  }

  /**
   * The canvas point of a slide point: the inverse of `canvasToWorld`. The
   * row of the pixel is negated to give the y of its map point.
   */
  worldToCanvas(worldPos: Point3): Point2 {
    const indexPoint = worldToIndexWSIMetadata(this.state.metadata, worldPos);

    return indexToCanvasForWSI({
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      indexPos: [indexPoint[0], -indexPoint[1], 0],
      view: this.state.view,
    });
  }

  /**
   * The pan in canvas pixels on the screen: where the centre of the slide
   * shows, less the centre of the canvas. It is `[0, 0]` for a slide that is
   * centred on the canvas, as the microscopy viewer fits it, and without
   * the size of the slide.
   */
  get pan(): Point2 {
    const centre = this.getSlideCentre();

    if (!centre) {
      return [0, 0];
    }

    const canvasPoint = indexToCanvasForWSI({
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      indexPos: [centre[0], centre[1], 0],
      view: this.state.view,
    });

    return [
      canvasPoint[0] - this.state.canvasWidth / 2,
      canvasPoint[1] - this.state.canvasHeight / 2,
    ];
  }

  /**
   * The view with the centre moved so that the centre of the slide shows at
   * the given pan, at the zoom of this view state and the rotation of the
   * map. The map applies the zoom after the resolution, so the zoom gives
   * the resolution; a view state without a zoom, as `withResolution` gives
   * it, has its resolution.
   */
  withPan(pan: Point2): WSIResolvedView {
    const centre = this.getSlideCentre();

    if (!centre) {
      return this;
    }

    const { resolution, zoom } = this.state.viewState;

    return this.cloneWithViewState({
      ...this.state.viewState,
      centerIndex: this.getCenterIndexForCanvasPoint({
        canvasPoint: [
          this.state.canvasWidth / 2 + pan[0],
          this.state.canvasHeight / 2 + pan[1],
        ],
        indexPoint: centre,
        resolution:
          typeof zoom === 'number'
            ? this.getResolutionForZoom(zoom)
            : (resolution ?? this.getResolution()),
      }),
    });
  }

  /**
   * The size of a canvas pixel in world units along each canvas axis: the
   * resolution of the map, in pixels of the slide, times the spacing of the
   * slide along that axis at the rotation of the map. It is worked out from
   * the view and the metadata, not through the transforms of the slide,
   * which keep single precision.
   */
  get canvasPixelSize(): Point2 {
    const resolution = this.getResolution();
    const rotation = this.state.view.getRotation?.() ?? 0;
    const [spacingX, spacingY] = this.state.metadata?.spacing ?? [1, 1];
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    return [
      resolution * Math.hypot(cos * spacingX, sin * spacingY),
      resolution * Math.hypot(sin * spacingX, cos * spacingY),
    ];
  }

  getFrameOfReferenceUID(): string | undefined {
    return this.state.frameOfReferenceUID || undefined;
  }

  /**
   * The view at a zoom level of the map, about a canvas point when one is
   * given: the slide point under it stays there.
   */
  withZoom(zoom: number, canvasPoint?: Point2): WSIResolvedView {
    const nextZoom = Math.max(zoom, 0.001);

    return this.withMapResolution(
      this.getResolutionForZoom(nextZoom),
      nextZoom,
      canvasPoint
    );
  }

  /**
   * The view at a resolution of the map, about a canvas point when one is
   * given: the slide point under it stays there. The view state has the
   * resolution and no zoom level, so the map takes the resolution as it is.
   */
  withResolution(resolution: number, canvasPoint?: Point2): WSIResolvedView {
    return this.withMapResolution(
      Math.max(resolution, 0.000001),
      undefined,
      canvasPoint
    );
  }

  /**
   * The view at a resolution and a zoom level of the map, about a canvas
   * point when one is given.
   */
  private withMapResolution(
    resolution: number,
    zoom: number | undefined,
    canvasPoint?: Point2
  ): WSIResolvedView {
    if (!canvasPoint) {
      return this.cloneWithViewState({
        ...this.state.viewState,
        resolution,
        zoom,
      });
    }

    const indexPoint = this.canvasToIndex(canvasPoint);

    return this.cloneWithViewState({
      ...this.state.viewState,
      centerIndex: this.getCenterIndexForCanvasPoint({
        canvasPoint,
        indexPoint,
        resolution,
      }),
      resolution,
      zoom,
    });
  }

  /**
   * The camera of the view, as the legacy WSI viewport gives it: the focal
   * point at the centre of the canvas, a fixed view up and the canvas height
   * in world units as the parallel scale. The rotation is the one of the
   * view state, on top of the orientation of the slide.
   */
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
      rotation: this.state.viewState.rotation ?? 0,
    };
  }

  /**
   * The centre of the slide as a point of the map, where the pixel of column
   * x and row y is `[x, -y]`. It is the origin of the pan. Undefined without
   * the size of the slide.
   */
  private getSlideCentre(): Point2 | undefined {
    const dimensions = this.state.metadata?.dimensions;

    return dimensions ? [dimensions[0] / 2, -dimensions[1] / 2] : undefined;
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
    const halfCanvasX = Math.max(this.state.canvasWidth, 1) / 2;
    const halfCanvasY = Math.max(this.state.canvasHeight, 1) / 2;
    const deltaCanvasX = canvasPoint[0] - halfCanvasX;
    const deltaCanvasY = canvasPoint[1] - halfCanvasY;
    const rotation = this.state.view.getRotation();
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
