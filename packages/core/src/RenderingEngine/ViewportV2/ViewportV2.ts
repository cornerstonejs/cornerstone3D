import type {
  DataAttachmentOptions,
  DataId,
  DataProvider,
  RenderingBinding,
  RenderingId,
  RenderPathResolver,
  ViewportBackendContext,
  ViewportController,
  ViewportId,
  ViewportKind,
} from './ViewportArchitectureTypes';

abstract class ViewportV2<TViewState, TPresentationProps>
  implements ViewportController<TViewState, TPresentationProps>
{
  abstract readonly id: ViewportId;
  abstract readonly kind: ViewportKind;

  protected dataProvider: DataProvider;
  protected renderPathResolver: RenderPathResolver;
  protected backendContext: ViewportBackendContext;

  protected bindings = new Map<DataId, RenderingBinding>();
  protected presentations = new Map<DataId, TPresentationProps>();
  protected viewState!: TViewState;

  async setDataId(
    dataId: DataId,
    options: DataAttachmentOptions
  ): Promise<RenderingId> {
    const data = await this.dataProvider.load(dataId);
    const adapter = this.renderPathResolver.resolve(this.kind, data, options);
    const existing = this.bindings.get(dataId);

    if (existing) {
      existing.adapter.detach(this.backendContext, existing.rendering);
    }

    const rendering = await adapter.attach(this.backendContext, data, options);

    this.bindings.set(dataId, {
      data,
      adapter,
      rendering,
    });

    const props = this.presentations.get(dataId);
    if (props !== undefined) {
      adapter.updatePresentation(this.backendContext, rendering, props);
    }

    adapter.updateViewState(
      this.backendContext,
      rendering,
      this.viewState,
      props
    );
    this.render();
    return rendering.id;
  }

  setPresentation(dataId: DataId, props: TPresentationProps): void {
    this.presentations.set(dataId, props);
    const binding = this.bindings.get(dataId);

    if (!binding) {
      return;
    }

    binding.adapter.updatePresentation(
      this.backendContext,
      binding.rendering,
      props
    );
    binding.adapter.updateViewState(
      this.backendContext,
      binding.rendering,
      this.viewState,
      props
    );
    this.render();
  }

  getPresentation(dataId: DataId): TPresentationProps | undefined {
    return this.presentations.get(dataId);
  }

  setViewState(viewState: Partial<TViewState>): void {
    this.viewState = {
      ...this.viewState,
      ...viewState,
    };

    for (const [dataId, binding] of this.bindings.entries()) {
      binding.adapter.updateViewState(
        this.backendContext,
        binding.rendering,
        this.viewState,
        this.presentations.get(dataId)
      );
    }

    this.render();
  }

  getViewState(): TViewState {
    return this.viewState;
  }

  removeDataId(dataId: DataId): void {
    const binding = this.bindings.get(dataId);

    if (!binding) {
      return;
    }

    binding.adapter.detach(this.backendContext, binding.rendering);
    this.bindings.delete(dataId);
    this.presentations.delete(dataId);
    this.render();
  }

  protected getBinding(dataId: DataId): RenderingBinding | undefined {
    return this.bindings.get(dataId);
  }

  protected redrawBindings(): void {
    for (const [dataId, binding] of this.bindings.entries()) {
      binding.adapter.updateViewState(
        this.backendContext,
        binding.rendering,
        this.viewState,
        this.presentations.get(dataId)
      );
    }
  }

  abstract render(): void;
}

export default ViewportV2;
