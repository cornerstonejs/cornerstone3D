export type ViewportId = string;
export type DataId = string;
export type RenderingId = string;
export type ViewportKind = 'planar' | 'video' | 'ecg' | string;

export interface DataAttachmentOptions {
  role: string;
  renderMode: string;
}

export interface BasePresentationProps {
  visible?: boolean;
  opacity?: number;
}

export interface LogicalDataObject<TPayload = unknown> {
  id: DataId;
  role: string;
  kind: string;
  metadata: Record<string, unknown>;
  payload: TPayload;
}

export interface MountedRendering<TBackendHandle = unknown> {
  id: RenderingId;
  dataId: DataId;
  role: string;
  renderMode: string;
  backendHandle: TBackendHandle;
}

export interface BaseViewportRenderContext {
  viewportId: ViewportId;
  viewportKind: ViewportKind;
}

/** @deprecated Use BaseViewportRenderContext instead. */
export type ViewportRenderContext = BaseViewportRenderContext;

export interface RenderingAdapter<
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
> {
  attach(
    ctx: TContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<MountedRendering>;

  updatePresentation(
    ctx: TContext,
    rendering: MountedRendering,
    props: unknown
  ): void;

  updateCamera(
    ctx: TContext,
    rendering: MountedRendering,
    camera: unknown
  ): void;

  updateProperties(
    ctx: TContext,
    rendering: MountedRendering,
    properties: unknown
  ): void;

  render?(ctx: TContext, rendering: MountedRendering): void;

  resize?(ctx: TContext, rendering: MountedRendering): void;

  detach(ctx: TContext, rendering: MountedRendering): void;
}

export interface RenderPathDefinition<
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
> {
  id: string;
  viewportKind: ViewportKind;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean;

  createAdapter(): RenderingAdapter<TContext>;
}

export interface RenderPathResolver {
  register<TContext extends BaseViewportRenderContext>(
    path: RenderPathDefinition<TContext>
  ): void;

  resolve<TContext extends BaseViewportRenderContext>(
    viewportKind: ViewportKind,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): RenderingAdapter<TContext>;
}

export interface DataProvider {
  load(dataId: DataId, options?: unknown): Promise<LogicalDataObject>;
}

export interface RenderingBinding<
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
> {
  data: LogicalDataObject;
  adapter: RenderingAdapter<TContext>;
  rendering: MountedRendering;
}

export interface ViewportController<
  TCamera = unknown,
  TProperties = unknown,
  TDataPresentation = unknown,
> {
  readonly id: ViewportId;
  readonly kind: ViewportKind;

  setDataId(
    dataId: DataId,
    options: DataAttachmentOptions
  ): Promise<RenderingId>;
  removeDataId(dataId: DataId): void;

  setPresentation(dataId: DataId, props: TDataPresentation): void;
  getPresentation(dataId: DataId): TDataPresentation | undefined;

  setCamera(camera: Partial<TCamera>): void;
  getCamera(): TCamera;

  setProperties(properties: Partial<TProperties>): void;
  getProperties(): TProperties;

  render(): void;
}
