import type { Point2, Point3 } from '../../types';
import type ViewportType from '../../enums/ViewportType';

export type ViewportId = string;
export type DataId = string;
export type RenderingId = string;
export type ViewportRenderContextType =
  | 'planar'
  | 'video'
  | 'ecg'
  | 'wsi'
  | '3d'
  | string;
export type LogicalDataType = 'image' | 'video' | 'ecg' | 'wsi' | 'geometry';

export interface DataAddOptions {
  renderMode: string;
}

export interface BasePresentationProps {
  visible?: boolean;
  opacity?: number;
}

export interface LogicalDataObject<TPayload = unknown> {
  type: LogicalDataType;
  payload: TPayload;
}

// Mounted rendering state is render-path-specific; logical dataset identity
// lives on the binding key and explicit dataId argument. The controller treats
// this object as opaque even though adapter fields are stored flat.
export type MountedRendering<
  TRendering extends { renderMode: string } = { renderMode: string },
> = {
  id: RenderingId;
} & Omit<TRendering, 'id'>;

export interface BaseViewportRenderContext {
  viewportId: ViewportId;
  type: ViewportRenderContextType;
}

export interface RenderPath<
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
> {
  addData(
    ctx: TContext,
    dataId: DataId,
    data: LogicalDataObject,
    options: DataAddOptions
  ): Promise<MountedRendering>;

  updateDataPresentation(
    ctx: TContext,
    rendering: MountedRendering,
    props: unknown
  ): void;

  updateCamera(
    ctx: TContext,
    rendering: MountedRendering,
    camera: unknown
  ): void;

  canvasToWorld?(
    ctx: TContext,
    rendering: MountedRendering,
    canvasPos: Point2
  ): Point3;

  worldToCanvas?(
    ctx: TContext,
    rendering: MountedRendering,
    worldPos: Point3
  ): Point2;

  getFrameOfReferenceUID?(
    ctx: TContext,
    rendering: MountedRendering
  ): string | undefined;

  getImageData?(ctx: TContext, rendering: MountedRendering): unknown;

  render?(ctx: TContext, rendering: MountedRendering): void;

  resize?(ctx: TContext, rendering: MountedRendering): void;

  removeData(ctx: TContext, rendering: MountedRendering): void;
}

export interface RenderPathDefinition<
  TRootContext extends BaseViewportRenderContext = BaseViewportRenderContext,
  TAdapterContext extends BaseViewportRenderContext = TRootContext,
> {
  id: string;
  type: ViewportType;

  matches(data: LogicalDataObject, options: DataAddOptions): boolean;

  createRenderPath(): RenderPath<TAdapterContext>;

  selectContext?(rootContext: TRootContext): TAdapterContext;
}

export interface RenderPathResolver {
  register<
    TRootContext extends BaseViewportRenderContext,
    TAdapterContext extends BaseViewportRenderContext,
  >(
    path: RenderPathDefinition<TRootContext, TAdapterContext>
  ): void;

  resolve<TContext extends BaseViewportRenderContext>(
    type: ViewportType,
    data: LogicalDataObject,
    options: DataAddOptions
  ): RenderPathDefinition<TContext, BaseViewportRenderContext>;
}

export interface DataProvider {
  load(dataId: DataId, options?: unknown): Promise<LogicalDataObject>;
}

export interface RenderingBinding<TPresentation = unknown> {
  dataId: DataId;
  data: LogicalDataObject;
  rendering: MountedRendering;
  updateDataPresentation(props: TPresentation): void;
  updateCamera(camera: unknown): void;
  canvasToWorld?(canvasPos: Point2): Point3;
  worldToCanvas?(worldPos: Point3): Point2;
  getFrameOfReferenceUID?(): string | undefined;
  getImageData?(): unknown;
  render?(): void;
  resize?(): void;
  removeData(): void;
}

export interface ViewportController<
  TCamera = unknown,
  TDataPresentation = unknown,
> {
  readonly id: ViewportId;
  readonly type: ViewportType;

  setDataId(dataId: DataId, options: DataAddOptions): Promise<RenderingId>;
  removeDataId(dataId: DataId): void;

  setCamera(camera: Partial<TCamera>): void;
  getCamera(): TCamera;
  setDataPresentation(dataId: DataId, props: Partial<TDataPresentation>): void;
  getDataPresentation(dataId: DataId): TDataPresentation | undefined;
  getDataRenderMode(dataId: DataId): string | undefined;

  render(): void;
}

export interface ICanvasWorldViewport {
  canvasToWorld(canvasPos: Point2): Point3;
  worldToCanvas(worldPos: Point3): Point2;
}

export interface IZoomViewport {
  getZoom(): number;
  setZoom(zoom: number): void;
}

export interface IPanViewport {
  getPan(): Point2;
  setPan(pan: Point2): void;
}

export interface IFrameOfReferenceViewport {
  getFrameOfReferenceUID(): string;
}

export function viewportHasCanvasWorldTransform(
  viewport: unknown
): viewport is ICanvasWorldViewport {
  return Boolean(
    viewport &&
      typeof (viewport as ICanvasWorldViewport).canvasToWorld === 'function' &&
      typeof (viewport as ICanvasWorldViewport).worldToCanvas === 'function'
  );
}

export function viewportHasZoom(viewport: unknown): viewport is IZoomViewport {
  return Boolean(
    viewport &&
      typeof (viewport as IZoomViewport).getZoom === 'function' &&
      typeof (viewport as IZoomViewport).setZoom === 'function'
  );
}

export function viewportHasPan(viewport: unknown): viewport is IPanViewport {
  return Boolean(
    viewport &&
      typeof (viewport as IPanViewport).getPan === 'function' &&
      typeof (viewport as IPanViewport).setPan === 'function'
  );
}

export function viewportHasFrameOfReferenceUID(
  viewport: unknown
): viewport is IFrameOfReferenceViewport {
  return Boolean(
    viewport &&
      typeof (viewport as IFrameOfReferenceViewport).getFrameOfReferenceUID ===
        'function'
  );
}
