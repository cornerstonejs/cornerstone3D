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

export interface MountedRendering<TRuntime = unknown> {
  id: RenderingId;
  dataId: DataId;
  role: string;
  renderMode: string;
  runtime: TRuntime;
}

export interface BaseViewportRenderContext {
  viewportId: ViewportId;
  type: ViewportKind;
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
  TRootContext extends BaseViewportRenderContext = BaseViewportRenderContext,
  TAdapterContext extends BaseViewportRenderContext = TRootContext,
> {
  id: string;
  type: ViewportKind;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean;

  createAdapter(): RenderingAdapter<TAdapterContext>;

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
    type: ViewportKind,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): RenderPathDefinition<TContext, BaseViewportRenderContext>;
}

export interface DataProvider {
  load(dataId: DataId, options?: unknown): Promise<LogicalDataObject>;
}

export interface RenderingBinding<TPresentation = unknown> {
  data: LogicalDataObject;
  rendering: MountedRendering;
  updatePresentation(props: TPresentation): void;
  updateCamera(camera: unknown): void;
  updateProperties(properties: unknown): void;
  render?(): void;
  resize?(): void;
  detach(): void;
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
