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

export type LoadedData<TData = unknown> = {
  id: DataId;
  type: LogicalDataType;
} & TData;

// Mounted rendering state is render-path-specific; logical dataset identity
// lives on the binding key and the loaded dataset. The controller
// treats this object as opaque even though adapter fields are stored flat.
export type MountedRendering<
  TRendering extends { renderMode: string } = { renderMode: string },
> = {
  id: RenderingId;
} & Omit<TRendering, 'id'>;

export interface RenderPathAttachment<TPresentation = unknown> {
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

export interface BaseViewportRenderContext {
  viewportId: ViewportId;
  type: ViewportRenderContextType;
}

export interface RenderPath<
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
> {
  addData(
    ctx: TContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment>;
}

export interface RenderPathDefinition<
  TRootContext extends BaseViewportRenderContext = BaseViewportRenderContext,
  TAdapterContext extends BaseViewportRenderContext = TRootContext,
> {
  id: string;
  type: ViewportType;

  matches(data: LoadedData, options: DataAddOptions): boolean;

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
    data: LoadedData,
    options: DataAddOptions
  ): RenderPathDefinition<TContext, BaseViewportRenderContext>;
}

export interface DataProvider {
  load(dataId: DataId, options?: unknown): Promise<LoadedData>;
}

export interface RenderingBinding<TPresentation = unknown>
  extends RenderPathAttachment<TPresentation> {
  data: LoadedData;
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
