import type { Point2, Point3 } from '../../types';
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

  protected bindings = new Map<DataId, RenderingBinding<TDataPresentation>>();
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
    const path = this.renderPathResolver.resolve<TContext>(
      this.kind,
      data,
      options
    );
    const adapter = path.createAdapter();
    const adapterContext =
      path.selectContext?.(this.renderContext) ?? this.renderContext;
    const existing = this.bindings.get(dataId);

    if (existing) {
      existing.detach();
    }

    const rendering = await adapter.attach(adapterContext, data, options);

    this.bindings.set(dataId, {
      data,
      rendering,
      updatePresentation: (props) => {
        adapter.updatePresentation(adapterContext, rendering, props);
      },
      updateCamera: (camera) => {
        adapter.updateCamera(adapterContext, rendering, camera);
      },
      updateProperties: (properties) => {
        adapter.updateProperties(adapterContext, rendering, properties);
      },
      canvasToWorld: adapter.canvasToWorld
        ? (canvasPos) => {
            return adapter.canvasToWorld?.(
              adapterContext,
              rendering,
              canvasPos
            );
          }
        : undefined,
      worldToCanvas: adapter.worldToCanvas
        ? (worldPos) => {
            return adapter.worldToCanvas?.(adapterContext, rendering, worldPos);
          }
        : undefined,
      getFrameOfReferenceUID: adapter.getFrameOfReferenceUID
        ? () => {
            return adapter.getFrameOfReferenceUID?.(adapterContext, rendering);
          }
        : undefined,
      render: adapter.render
        ? () => {
            adapter.render?.(adapterContext, rendering);
          }
        : undefined,
      resize: adapter.resize
        ? () => {
            adapter.resize?.(adapterContext, rendering);
          }
        : undefined,
      detach: () => {
        adapter.detach(adapterContext, rendering);
      },
    });

    const binding = this.bindings.get(dataId);

    if (!binding) {
      throw new Error(`Failed to bind rendering for ${dataId}`);
    }

    const props = this.presentations.get(dataId);
    if (props !== undefined) {
      binding.updatePresentation(props);
    }

    binding.updateCamera(this.camera);
    binding.updateProperties(this.properties);
    this.render();
    return rendering.id;
  }

  setPresentation(dataId: DataId, props: TDataPresentation): void {
    this.presentations.set(dataId, props);
    const binding = this.bindings.get(dataId);

    if (!binding) {
      return;
    }

    binding.updatePresentation(props);
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

  getZoom(): number {
    return (this.camera as { zoom?: number }).zoom ?? 1;
  }

  setZoom(zoom: number): void {
    this.setCamera({
      zoom: Math.max(zoom, 0.001),
    } as unknown as Partial<TCamera>);
  }

  getPan(): Point2 {
    const [x, y] = (this.camera as { pan?: [number, number] }).pan ?? [0, 0];
    return [x, y];
  }

  setPan(pan: Point2): void {
    this.setCamera({
      pan: [pan[0], pan[1]],
    } as unknown as Partial<TCamera>);
  }

  canvasToWorld(canvasPos: Point2): Point3 {
    return this.getCurrentBinding()?.canvasToWorld?.(canvasPos) ?? [0, 0, 0];
  }

  worldToCanvas(worldPos: Point3): Point2 {
    return this.getCurrentBinding()?.worldToCanvas?.(worldPos) ?? [0, 0];
  }

  getFrameOfReferenceUID(): string {
    return (
      this.getCurrentBinding()?.getFrameOfReferenceUID?.() ??
      `${this.kind}-viewport-${this.id}`
    );
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

    binding.detach();
    this.bindings.delete(dataId);
    this.presentations.delete(dataId);
    this.render();
  }

  protected getBinding(dataId: DataId): RenderingBinding | undefined {
    return this.bindings.get(dataId);
  }

  protected getCurrentBinding():
    | RenderingBinding<TDataPresentation>
    | undefined {
    return this.bindings.values().next().value;
  }

  protected modified(): void {
    for (const binding of this.bindings.values()) {
      binding.updateCamera(this.camera);
      binding.updateProperties(this.properties);
    }

    this.render();
  }

  abstract render(): void;
}

export default ViewportV2;
