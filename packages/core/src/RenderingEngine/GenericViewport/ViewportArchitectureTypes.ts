import type { ActorEntry, ICamera, Point2, Point3 } from '../../types';
import type {
  ReferenceCompatibleOptions,
  ViewPresentation,
  ViewPresentationSelector,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../types/IViewport';
import type ViewportType from '../../enums/ViewportType';
import type ResolvedViewportView from './ResolvedViewportView';

/**
 * View ownership contract:
 *
 * ViewState is the mutable viewport-local source of truth for navigation and
 * layout. ViewPresentation is persistable look state only: pan, zoom/scale,
 * rotation, flips, and display area. ViewReference is a persistable spatial
 * pointer: frame of reference, data identity, slice locator, and plane
 * restriction; it does not contain pan, zoom, rotation, flips, VOI, or opacity.
 * ResolvedView is an ephemeral snapshot produced from data, canvas geometry,
 * and ViewState; it owns world/canvas transforms and renderer geometry and is
 * never persisted. DataPresentation is per-binding render appearance such as
 * VOI, opacity, colormap, interpolation, and visibility.
 */

export type ViewportId = string;
export type DataId = string;
export type KnownViewportRenderContext =
  | 'planar'
  | 'video'
  | 'ecg'
  | 'wsi'
  | '3d';
export type ExtensionViewportRenderContext = string & {};
export type ViewportRenderContextType =
  | KnownViewportRenderContext
  | ExtensionViewportRenderContext;
export type LogicalDataType = 'image' | 'video' | 'ecg' | 'wsi' | 'geometry';
export type BindingRole = 'source' | 'overlay';
export type ViewportDataReference =
  | { kind: 'data'; dataId: string }
  | { kind: 'image'; imageId: string }
  | { kind: 'volume'; volumeId: string }
  | { kind: 'geometry'; geometryId: string }
  | {
      kind: 'segmentation';
      segmentationId: string;
      representationUID?: string;
      labelmapId?: string;
    };

export interface DataAddOptions {
  renderMode: string;
  role?: BindingRole;
}

export interface BasePresentationProps {
  visible?: boolean;
  opacity?: number;
}

export type LoadedData<TData extends object = object> = {
  id: DataId;
  type: LogicalDataType;
} & TData;

// Mounted rendering state is render-path-specific; logical dataset identity
// lives on the binding key and the loaded dataset. The controller
// treats this object as opaque even though adapter fields are stored flat.
export type MountedRendering<
  TRendering extends { renderMode: string } = { renderMode: string },
> = Omit<TRendering, 'id'>;

export interface RenderPathAttachment<TPresentation = unknown> {
  rendering: MountedRendering;
  updateDataPresentation(props: TPresentation): void;
  applyViewState(viewState: unknown): void;
  getFrameOfReferenceUID(): string | undefined;
  getActorEntry?(data: LoadedData): ActorEntry | undefined;
  getImageData?(): unknown;
  render?(): void;
  resize?(): void;
  removeData(): void;
}

export interface BaseViewportRenderContext {
  viewportId: ViewportId;
  renderingEngineId?: string;
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

export interface ViewportDataBinding<TPresentation = unknown>
  extends RenderPathAttachment<TPresentation> {
  data: LoadedData;
  role: BindingRole;
}

export interface ViewportController<
  TViewState = unknown,
  TDataPresentation = unknown,
  TViewPresentation = ViewPresentation,
> {
  readonly id: ViewportId;
  readonly type: ViewportType;

  addData(dataId: DataId, options: DataAddOptions): Promise<void>;
  setData(dataId: DataId, options: DataAddOptions): Promise<void>;
  setDataList(
    entries: Array<{ dataId: DataId; options?: unknown }>
  ): Promise<void>;
  removeData(dataId: DataId): void;

  setViewState(viewState: Partial<TViewState>): void;
  getViewState(): TViewState;
  getResolvedView():
    | ResolvedViewportView<unknown, ICamera<unknown>>
    | undefined;
  setDataPresentation(dataId: DataId, props: Partial<TDataPresentation>): void;
  getDataPresentation(dataId: DataId): TDataPresentation | undefined;
  setViewPresentation(viewPresentation?: TViewPresentation): void;
  getViewPresentation(
    selector?: ViewPresentationSelector
  ): TViewPresentation | undefined;
  setViewReference(viewReference: ViewReference): void;
  getViewReference(specifier?: ViewReferenceSpecifier): ViewReference;
  getViewReferenceId(specifier?: ViewReferenceSpecifier): string;
  isReferenceViewable(
    viewReference: ViewReference,
    options?: ReferenceCompatibleOptions
  ): boolean;
  getDataRenderMode(dataId: DataId): string | undefined;
  getDataRole(dataId: DataId): BindingRole | undefined;

  render(): void;
  setRendered(): void;
}

export interface ICanvasWorldViewport {
  canvasToWorld(canvasPos: Point2): Point3;
  worldToCanvas(worldPos: Point3): Point2;
}

export interface IZoomViewport {
  getZoom(): number;
  setZoom(zoom: number, canvasPoint?: Point2): void;
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
