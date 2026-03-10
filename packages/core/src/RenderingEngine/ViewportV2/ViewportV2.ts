import type {
  BaseViewportRenderContext,
  DataAttachmentOptions,
  DataId,
  DataProvider,
  LogicalDataObject,
  RenderingBinding,
  RenderingId,
  RenderPathResolver,
  ViewportController,
  ViewportId,
  ViewportKind,
} from './ViewportArchitectureTypes';

abstract class ViewportV2<
  TCamera,
  TProperties,
  TDataPresentation = unknown,
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
> implements ViewportController<TCamera, TProperties, TDataPresentation>
{
  abstract readonly id: ViewportId;
  abstract readonly kind: ViewportKind;

  protected dataProvider: DataProvider;
  protected renderPathResolver: RenderPathResolver;
  protected renderContext: TContext;

  protected bindings = new Map<DataId, RenderingBinding<TContext>>();
  protected presentations = new Map<DataId, TDataPresentation>();
  protected camera!: TCamera;
  protected properties!: TProperties;

  async setDataId(
    dataId: DataId,
    options: DataAttachmentOptions
  ): Promise<RenderingId> {
    const data = await this.dataProvider.load(dataId);
    return this.attachLoadedData(dataId, data, options);
  }

  protected async attachLoadedData(
    dataId: DataId,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<RenderingId> {
    const adapter = this.renderPathResolver.resolve<TContext>(
      this.kind,
      data,
      options
    );
    const existing = this.bindings.get(dataId);

    if (existing) {
      existing.adapter.detach(this.renderContext, existing.rendering);
    }

    const rendering = await adapter.attach(this.renderContext, data, options);

    this.bindings.set(dataId, {
      data,
      adapter,
      rendering,
    });

    const props = this.presentations.get(dataId);
    if (props !== undefined) {
      adapter.updatePresentation(this.renderContext, rendering, props);
    }

    adapter.updateCamera(this.renderContext, rendering, this.camera);
    adapter.updateProperties(this.renderContext, rendering, this.properties);
    this.render();
    return rendering.id;
  }

  setPresentation(dataId: DataId, props: TDataPresentation): void {
    this.presentations.set(dataId, props);
    const binding = this.bindings.get(dataId);

    if (!binding) {
      return;
    }

    binding.adapter.updatePresentation(
      this.renderContext,
      binding.rendering,
      props
    );
    this.render();
  }

  getPresentation(dataId: DataId): TDataPresentation | undefined {
    return this.presentations.get(dataId);
  }

  setCamera(camera: Partial<TCamera>): void {
    this.camera = {
      ...this.camera,
      ...camera,
    };
    this.modified();
  }

  getCamera(): TCamera {
    return this.camera;
  }

  setProperties(props: Partial<TProperties>): void {
    this.properties = {
      ...this.properties,
      ...props,
    };
    this.modified();
  }

  getProperties(): TProperties {
    return this.properties;
  }

  removeDataId(dataId: DataId): void {
    const binding = this.bindings.get(dataId);

    if (!binding) {
      return;
    }

    binding.adapter.detach(this.renderContext, binding.rendering);
    this.bindings.delete(dataId);
    this.presentations.delete(dataId);
    this.render();
  }

  protected getBinding(dataId: DataId): RenderingBinding | undefined {
    return this.bindings.get(dataId);
  }

  protected modified(): void {
    for (const binding of this.bindings.values()) {
      binding.adapter.updateCamera(
        this.renderContext,
        binding.rendering,
        this.camera
      );
      binding.adapter.updateProperties(
        this.renderContext,
        binding.rendering,
        this.properties
      );
    }

    this.render();
  }

  abstract render(): void;
}

export default ViewportV2;
