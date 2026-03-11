import type { Point2, Point3 } from '../../types';
import type {
  BaseViewportRenderContext,
  DataAddOptions,
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
 * loaded logical data, mounted renderings, camera state, and per-dataset
 * render-state forwarding. It does not know how CPU, VTK, DOM, image, volume,
 * or media runtimes work internally.
 *
 * Concrete viewport families are expected to stay thin and provide:
 * - a render context for their render paths
 * - a data provider
 * - a render path resolver when the default is not enough
 * - viewport-family-specific public APIs
 *
 * Concrete render paths are expected to own:
 * - runtime add/remove lifecycle
 * - camera interpretation for that render path
 * - per-dataset render-state application
 * - render-path-specific coordinate transforms
 *
 * This split keeps migration from legacy viewports incremental without
 * centralizing render-mode-specific behavior in the controller.
 */
abstract class ViewportV2<
  TCamera,
  TDataPresentation = unknown,
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
> implements ViewportController<TCamera, TDataPresentation>
{
  abstract readonly id: ViewportId;
  abstract readonly type: ViewportType;

  protected dataProvider: DataProvider;
  protected renderPathResolver: RenderPathResolver;
  protected renderContext: TContext;

  protected bindings = new Map<DataId, RenderingBinding<TDataPresentation>>();
  protected dataPresentation = new Map<DataId, TDataPresentation>();
  protected camera!: TCamera;

  /**
   * Loads a logical dataset through the viewport data provider and adds it
   * through the render-path resolver.
   */
  async setDataId(
    dataId: DataId,
    options: DataAddOptions
  ): Promise<RenderingId> {
    const data = await this.dataProvider.load(dataId, options);
    return this.addLoadedData(dataId, data, options);
  }

  /**
   * Converts loaded logical data into a mounted rendering binding.
   *
   * The binding stores render-path callbacks so future per-dataset render
   * state, camera, transform, resize, and render requests can be routed back
   * to the correct render-path runtime.
   */
  protected async addLoadedData(
    dataId: DataId,
    data: LogicalDataObject,
    options: DataAddOptions
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
      existing.removeData();
    }

    const rendering = await renderPath.addData(ctx, dataId, data, options);

    this.bindings.set(dataId, {
      dataId,
      data,
      rendering,
      updateDataPresentation: (props) => {
        renderPath.updateDataPresentation(ctx, rendering, props);
      },
      updateCamera: (camera) => {
        renderPath.updateCamera(ctx, rendering, camera);
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
      removeData: () => {
        renderPath.removeData(ctx, rendering);
      },
    });

    const binding = this.bindings.get(dataId);

    if (!binding) {
      throw new Error(`Failed to bind rendering for ${dataId}`);
    }

    const props = this.dataPresentation.get(dataId);
    if (props !== undefined) {
      binding.updateDataPresentation(props);
    }

    binding.updateCamera(this.camera);
    this.render();
    return rendering.id;
  }

  /**
   * Stores per-dataset render state and forwards it immediately when
   * that dataset is already added.
   */
  protected setDataPresentationState(
    dataId: DataId,
    props: TDataPresentation
  ): void {
    this.dataPresentation.set(dataId, props);
    const binding = this.bindings.get(dataId);

    if (!binding) {
      return;
    }

    binding.updateDataPresentation(props);
    this.render();
  }

  /**
   * Returns the last render state stored for a dataset, even if that dataset is
   * not currently mounted.
   */
  protected getDataPresentationState(
    dataId: DataId
  ): TDataPresentation | undefined {
    return this.dataPresentation.get(dataId);
  }

  /**
   * Stores object-like defaults for a dataset without clobbering
   * any values already tracked for that dataset.
   */
  protected setDefaultDataPresentation(
    dataId: DataId,
    defaults: TDataPresentation
  ): TDataPresentation {
    const nextPresentation = {
      ...(defaults as Record<string, unknown>),
      ...((this.getDataPresentationState(dataId) || {}) as Record<
        string,
        unknown
      >),
    } as TDataPresentation;

    this.setDataPresentationState(dataId, nextPresentation);

    return nextPresentation;
  }

  /**
   * Merges object-like updates into the stored per-dataset render state and
   * forwards the result immediately when mounted.
   */
  protected mergeDataPresentation(
    dataId: DataId,
    props: Partial<TDataPresentation>
  ): TDataPresentation {
    const nextPresentation = {
      ...((this.getDataPresentationState(dataId) || {}) as Record<
        string,
        unknown
      >),
      ...(props as Record<string, unknown>),
    } as TDataPresentation;

    this.setDataPresentationState(dataId, nextPresentation);

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
   * Updates the stored per-dataset presentation state for a specific dataset.
   */
  setDataPresentation(dataId: DataId, props: Partial<TDataPresentation>): void {
    this.mergeDataPresentation(dataId, props);
  }

  /**
   * Returns the stored presentation state for a specific dataset.
   */
  getDataPresentation(dataId: DataId): TDataPresentation | undefined {
    return this.getDataPresentationState(dataId);
  }

  /**
   * Returns the mounted render mode for a specific dataset when present.
   */
  getDataRenderMode(dataId: DataId): string | undefined {
    return this.getBinding(dataId)?.rendering.renderMode;
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
   * Removes one dataset binding and clears any stored per-dataset render
   * state for that dataset.
   */
  removeDataId(dataId: DataId): void {
    const binding = this.bindings.get(dataId);

    if (!binding) {
      return;
    }

    binding.removeData();
    this.bindings.delete(dataId);
    this.dataPresentation.delete(dataId);
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
   * Returns the first mounted binding when a viewport family does not have a
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
   * Iterates mounted bindings without exposing the underlying map to
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
   * Invokes resize on each mounted binding.
   */
  protected resizeBindings(): void {
    this.forEachBinding((binding) => {
      binding.resize?.();
    });
  }

  /**
   * Pushes the current shared camera state to every binding and schedules a
   * render.
   */
  protected modified(): void {
    this.forEachBinding((binding) => {
      binding.updateCamera(this.camera);
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
