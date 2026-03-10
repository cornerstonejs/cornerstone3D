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

export interface ViewportBackendContext {
  viewportId: ViewportId;
  viewportKind: ViewportKind;
}

export interface RenderingAdapter {
  attach(
    ctx: ViewportBackendContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<MountedRendering>;

  updatePresentation(
    ctx: ViewportBackendContext,
    rendering: MountedRendering,
    props: unknown
  ): void;

  updateViewState(
    ctx: ViewportBackendContext,
    rendering: MountedRendering,
    viewState: unknown,
    props?: unknown
  ): void;

  render?(ctx: ViewportBackendContext, rendering: MountedRendering): void;

  resize?(ctx: ViewportBackendContext, rendering: MountedRendering): void;

  detach(ctx: ViewportBackendContext, rendering: MountedRendering): void;
}

export interface RenderPathDefinition {
  id: string;
  viewportKind: ViewportKind;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean;

  createAdapter(): RenderingAdapter;
}

export interface RenderPathResolver {
  register(path: RenderPathDefinition): void;

  resolve(
    viewportKind: ViewportKind,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): RenderingAdapter;
}

export interface DataProvider {
  load(dataId: DataId): Promise<LogicalDataObject>;
}

export interface RenderingBinding {
  data: LogicalDataObject;
  adapter: RenderingAdapter;
  rendering: MountedRendering;
}

export interface ViewportController<
  TViewState = unknown,
  TPresentationProps = unknown,
> {
  readonly id: ViewportId;
  readonly kind: ViewportKind;

  setDataId(
    dataId: DataId,
    options: DataAttachmentOptions
  ): Promise<RenderingId>;
  removeDataId(dataId: DataId): void;

  setPresentation(dataId: DataId, props: TPresentationProps): void;
  getPresentation(dataId: DataId): TPresentationProps | undefined;

  setViewState(viewState: Partial<TViewState>): void;
  getViewState(): TViewState;

  render(): void;
}
