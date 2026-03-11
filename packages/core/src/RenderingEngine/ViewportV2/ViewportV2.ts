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
} from './ViewportArchitectureTypes';
import type ViewportType from '../../enums/ViewportType';

/**
 * Generic ViewportV2 controller.
 *
 * The base class owns only shared viewport state and binding orchestration:
 * loaded logical data, mounted renderings, camera state, properties, and
 * presentation forwarding. It does not know how CPU, VTK, DOM, image, volume,
 * or media runtimes work internally.
 *
 * Concrete viewport families are expected to stay thin and provide:
 * - a render context for their render paths
 * - a data provider
 * - a render path resolver when the default is not enough
 * - viewport-family-specific public APIs
 *
 * Concrete render paths are expected to own:
 * - runtime attachment and detachment
 * - camera interpretation for that render path
 * - presentation and property application
 * - render-path-specific coordinate transforms
 *
 * This split keeps migration from legacy viewports incremental without
 * centralizing render-mode-specific behavior in the controller.
 */
abstract class ViewportV2<
  TCamera,
  TProperties,
  TDataPresentation = unknown,
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
> implements ViewportController<TCamera, TProperties, TDataPresentation>
{
  abstract readonly id: ViewportId;
  abstract readonly type: ViewportType;

  protected dataProvider: DataProvider;
  protected renderPathResolver: RenderPathResolver;
  protected renderContext: TContext;

  protected bindings = new Map<DataId, RenderingBinding<TDataPresentation>>();
  protected presentations = new Map<DataId, TDataPresentation>();
  protected camera!: TCamera;
  protected properties!: TProperties;

  /**
   * Loads a logical dataset through the viewport data provider and attaches it
   * through the render-path resolver.
   */
  async setDataId(
    dataId: DataId,
    options: DataAttachmentOptions
  ): Promise<RenderingId> {
    const data = await this.dataProvider.load(dataId, options);
    return this.attachLoadedData(dataId, data, options);
  }

  /**
   * Converts loaded logical data into a mounted rendering binding.
   *
   * The binding stores render-path callbacks so future presentation, camera,
   * property, transform, resize, and render requests can be routed back to the
   * correct render-path runtime.
   */
  protected async attachLoadedData(
    dataId: DataId,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<RenderingId> {
    const path = this.renderPathResolver.resolve<TContext>(
      this.type,
      data,
      options
    );
    const renderPath = path.createRenderPath();
    const ctx = path.selectContext?.(this.renderContext) ?? this.renderContext;
    const existing = this.bindings.get(dataId);

    if (existing) {
      existing.detach();
    }

    const rendering = await renderPath.attach(ctx, data, options);

    this.bindings.set(dataId, {
      data,
      rendering,
      updatePresentation: (props) => {
        renderPath.updatePresentation(ctx, rendering, props);
      },
      updateCamera: (camera) => {
        renderPath.updateCamera(ctx, rendering, camera);
      },
      updateProperties: (properties) => {
        renderPath.updateProperties(ctx, rendering, properties);
      },
      canvasToWorld: renderPath.canvasToWorld
        ? (canvasPos) => {
            return renderPath.canvasToWorld?.(ctx, rendering, canvasPos);
          }
        : undefined,
      worldToCanvas: renderPath.worldToCanvas
        ? (worldPos) => {
            return renderPath.worldToCanvas?.(ctx, rendering, worldPos);
          }
        : undefined,
      getFrameOfReferenceUID: renderPath.getFrameOfReferenceUID
        ? () => {
            return renderPath.getFrameOfReferenceUID?.(ctx, rendering);
          }
        : undefined,
      getImageData: renderPath.getImageData
        ? () => {
            return renderPath.getImageData?.(ctx, rendering);
          }
        : undefined,
      render: renderPath.render
        ? () => {
            renderPath.render?.(ctx, rendering);
          }
        : undefined,
      resize: renderPath.resize
        ? () => {
            renderPath.resize?.(ctx, rendering);
          }
        : undefined,
      detach: () => {
        renderPath.detach(ctx, rendering);
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

  /**
   * Stores presentation state for a dataset and forwards it immediately when
   * that dataset is already attached.
   */
  setPresentation(dataId: DataId, props: TDataPresentation): void {
    this.presentations.set(dataId, props);
    const binding = this.bindings.get(dataId);

    if (!binding) {
      return;
    }

    binding.updatePresentation(props);
    this.render();
  }

  /**
   * Returns the last presentation state stored for a dataset, even if that
   * dataset is not currently mounted.
   */
  getPresentation(dataId: DataId): TDataPresentation | undefined {
    return this.presentations.get(dataId);
  }

  /**
   * Stores object-like presentation defaults for a dataset without clobbering
   * any values already tracked for that dataset.
   */
  protected setDefaultPresentation(
    dataId: DataId,
    defaults: TDataPresentation
  ): TDataPresentation {
    const nextPresentation = {
      ...(defaults as Record<string, unknown>),
      ...((this.getPresentation(dataId) || {}) as Record<string, unknown>),
    } as TDataPresentation;

    this.setPresentation(dataId, nextPresentation);

    return nextPresentation;
  }

  /**
   * Merges object-like presentation updates into the stored presentation for a
   * dataset and forwards the result immediately when attached.
   */
  protected mergePresentation(
    dataId: DataId,
    props: Partial<TDataPresentation>
  ): TDataPresentation {
    const nextPresentation = {
      ...((this.getPresentation(dataId) || {}) as Record<string, unknown>),
      ...(props as Record<string, unknown>),
    } as TDataPresentation;

    this.setPresentation(dataId, nextPresentation);

    return nextPresentation;
  }

  /**
   * Merges partial camera updates into the shared viewport camera state and
   * propagates that state to every active binding.
   */
  setCamera(camera: Partial<TCamera>): void {
    this.camera = {
      ...this.camera,
      ...camera,
    };
    this.modified();
  }

  /**
   * Returns the controller's current shared camera state.
   */
  getCamera(): TCamera {
    return this.camera;
  }

  /**
   * Compatibility helper for tool APIs that operate on scalar zoom state.
   */
  getZoom(): number {
    return (this.camera as { zoom?: number }).zoom ?? 1;
  }

  /**
   * Compatibility helper for tool APIs that operate on scalar zoom state.
   */
  setZoom(zoom: number): void {
    this.setCamera({
      zoom: Math.max(zoom, 0.001),
    } as unknown as Partial<TCamera>);
  }

  /**
   * Compatibility helper for tool APIs that operate on planar pan state.
   */
  getPan(): Point2 {
    const [x, y] = (this.camera as { pan?: [number, number] }).pan ?? [0, 0];
    return [x, y];
  }

  /**
   * Compatibility helper for tool APIs that operate on planar pan state.
   */
  setPan(pan: Point2): void {
    this.setCamera({
      pan: [pan[0], pan[1]],
    } as unknown as Partial<TCamera>);
  }

  /**
   * Uses the current binding's render-path transform when available.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    return this.getCurrentBinding()?.canvasToWorld?.(canvasPos) ?? [0, 0, 0];
  }

  /**
   * Uses the current binding's render-path transform when available.
   */
  worldToCanvas(worldPos: Point3): Point2 {
    return this.getCurrentBinding()?.worldToCanvas?.(worldPos) ?? [0, 0];
  }

  /**
   * Returns the current binding's frame of reference when one exists.
   * Falls back to a viewport-local identifier so callers still get a stable
   * value for non-referenceable viewports.
   */
  getFrameOfReferenceUID(): string {
    return (
      this.getCurrentBinding()?.getFrameOfReferenceUID?.() ??
      `${this.type}-viewport-${this.id}`
    );
  }

  /**
   * Merges partial shared property updates and propagates them to every active
   * binding.
   */
  setProperties(props: Partial<TProperties>): void {
    this.properties = {
      ...this.properties,
      ...props,
    };
    this.modified();
  }

  /**
   * Returns the controller's current shared property state.
   */
  getProperties(): TProperties {
    return this.properties;
  }

  /**
   * Detaches one dataset binding and removes any stored presentation state for
   * that dataset.
   */
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

  /**
   * Looks up a binding by dataset identifier.
   */
  protected getBinding(
    dataId: DataId
  ): RenderingBinding<TDataPresentation> | undefined {
    return this.bindings.get(dataId);
  }

  /**
   * Returns the first attached binding when a viewport family does not have a
   * stronger notion of "current" selection.
   */
  protected getFirstBinding(): RenderingBinding<TDataPresentation> | undefined {
    return this.bindings.values().next().value;
  }

  /**
   * Returns the binding used for generic transform and frame-of-reference
   * queries when a viewport family does not override the selection logic.
   */
  protected getCurrentBinding():
    | RenderingBinding<TDataPresentation>
    | undefined {
    return this.getFirstBinding();
  }

  /**
   * Iterates attached bindings without exposing the underlying map to
   * subclasses.
   */
  protected forEachBinding(
    visitor: (binding: RenderingBinding<TDataPresentation>) => void
  ): void {
    for (const binding of this.bindings.values()) {
      visitor(binding);
    }
  }

  /**
   * Invokes render on each binding and reports whether any binding handled the
   * render request directly.
   */
  protected renderBindings(): boolean {
    let renderedByAdapter = false;

    this.forEachBinding((binding) => {
      binding.render?.();
      renderedByAdapter = renderedByAdapter || Boolean(binding.render);
    });

    return renderedByAdapter;
  }

  /**
   * Invokes resize on each attached binding.
   */
  protected resizeBindings(): void {
    this.forEachBinding((binding) => {
      binding.resize?.();
    });
  }

  /**
   * Pushes the current shared camera and property state to every binding and
   * schedules a render.
   */
  protected modified(): void {
    this.forEachBinding((binding) => {
      binding.updateCamera(this.camera);
      binding.updateProperties(this.properties);
    });

    this.render();
  }

  /**
   * Requests the viewport family to render. Concrete subclasses decide whether
   * rendering is delegated to render paths, the rendering engine, or another
   * runtime.
   */
  abstract render(): void;
}

export default ViewportV2;
