import type * as EventTypes from '../../types/EventTypes';
import type ICamera from '../../types/ICamera';
import type { Point2, Point3 } from '../../types';
import Events from '../../enums/Events';
import triggerEvent from '../../utilities/triggerEvent';
import type {
  BaseViewportRenderContext,
  DataAddOptions,
  DataId,
  DataProvider,
  LoadedData,
  RenderingBinding,
  RenderingId,
  RenderPathResolver,
  ViewportController,
  ViewportId,
} from './ViewportArchitectureTypes';
import type ViewportType from '../../enums/ViewportType';
import type { ViewportCameraBase } from './ViewportCameraTypes';
import type ViewportComputedCamera from './ViewportComputedCamera';
import type {
  ReferenceCompatibleOptions,
  ViewPresentation,
  ViewPresentationSelector,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../types/IViewport';

/**
 * Generic ViewportNext controller.
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
abstract class ViewportNext<
  TCamera extends ICamera & ViewportCameraBase<unknown>,
  TDataPresentation = unknown,
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
  TViewPresentation = ViewPresentation,
> implements ViewportController<TCamera, TDataPresentation, TViewPresentation>
{
  // ── Abstract fields ──────────────────────────────────────────────────

  abstract readonly id: ViewportId;
  abstract readonly type: ViewportType;
  abstract readonly element: HTMLDivElement;
  abstract readonly renderingEngineId: string;

  // ── Protected fields ─────────────────────────────────────────────────

  protected dataProvider: DataProvider;
  protected renderPathResolver: RenderPathResolver;
  protected renderContext: TContext;

  protected bindings = new Map<DataId, RenderingBinding<TDataPresentation>>();
  protected dataPresentation = new Map<DataId, TDataPresentation>();
  protected camera!: TCamera;
  protected isDestroyed = false;

  // ── Debug ────────────────────────────────────────────────────────────

  readonly _debug: { renderModes: Record<string, string> } = {
    renderModes: {},
  };

  // ====================================================================
  // Public API -- data
  // ====================================================================

  /**
   * Replaces all mounted datasets with a single logical dataset.
   */
  async setData(dataId: DataId, options: DataAddOptions): Promise<RenderingId> {
    this.removeAllData();
    return this.addData(dataId, options);
  }

  /**
   * Loads a logical dataset through the viewport data provider and adds it
   * through the render-path resolver.
   */
  async addData(dataId: DataId, options: DataAddOptions): Promise<RenderingId> {
    if (this.isDestroyed) {
      throw new Error('Viewport has been destroyed');
    }

    const data = await this.dataProvider.load(dataId, options);
    return this.addLoadedData(dataId, data, options);
  }

  /**
   * Removes a dataset binding and its stored presentation state, then
   * triggers a re-render so the viewport reflects the removal.
   */
  removeData(dataId: DataId): void {
    const binding = this.bindings.get(dataId);

    if (!binding) {
      return;
    }

    binding.removeData();
    this.bindings.delete(dataId);
    this.dataPresentation.delete(dataId);
    delete this._debug.renderModes[dataId];

    if (!this.isDestroyed) {
      this.render();
    }
  }

  /**
   * Updates the stored per-dataset presentation state for a specific dataset.
   */
  setDataPresentation(dataId: DataId, props: Partial<TDataPresentation>): void {
    this.mergeDataPresentation(dataId, props);
  }

  /**
   * Adds one or more logical datasets to the viewport.
   */
  async setDataList(
    entries: Array<{ dataId: DataId; options?: unknown }>
  ): Promise<RenderingId[]> {
    const renderingIds: RenderingId[] = [];

    for (const { dataId, options } of entries) {
      if (!options) {
        throw new Error(
          `[${this.type}] setDataList requires per-entry options when the viewport family does not override it.`
        );
      }

      renderingIds.push(await this.addData(dataId, options as DataAddOptions));
    }

    return renderingIds;
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
   * Returns a viewport-family-specific view-presentation snapshot when
   * implemented by the concrete viewport.
   */
  getViewPresentation(
    _selector?: ViewPresentationSelector
  ): TViewPresentation | undefined {
    return undefined;
  }

  /**
   * Applies a viewport-family-specific view-presentation snapshot.
   */
  setViewPresentation(_viewPresentation?: TViewPresentation): void {
    // Subclasses can implement.
  }

  /**
   * Returns a spatial reference for the current viewport state.
   */
  getViewReference(_specifier: ViewReferenceSpecifier = {}): ViewReference {
    return {
      FrameOfReferenceUID: this.getFrameOfReferenceUID(),
    };
  }

  /**
   * Returns a stable string identifier for the current view reference.
   */
  getViewReferenceId(_specifier: ViewReferenceSpecifier = {}): string {
    return `frameOfReference:${this.getFrameOfReferenceUID()}`;
  }

  /**
   * Applies a spatial reference to the current viewport state.
   */
  setViewReference(_viewReference: ViewReference): void {
    // Subclasses can implement.
  }

  /**
   * Returns whether a spatial reference is compatible with this viewport.
   */
  isReferenceViewable(
    viewReference: ViewReference,
    _options: ReferenceCompatibleOptions = {}
  ): boolean {
    return (
      !viewReference.FrameOfReferenceUID ||
      viewReference.FrameOfReferenceUID === this.getFrameOfReferenceUID()
    );
  }

  /**
   * Returns the frame of reference UID from the computed camera when
   * available, falling back to the current binding or a viewport-local
   * identifier.
   */
  getFrameOfReferenceUID(): string {
    return (
      this.getComputedCamera()?.getFrameOfReferenceUID() ??
      `${this.type}-viewport-${this.id}`
    );
  }

  // ====================================================================
  // Public API -- coordinate transforms
  // ====================================================================

  /**
   * Returns the viewport's computed camera snapshot for coordinate
   * transforms and legacy ICamera interop. Subclasses must implement this
   * to produce the viewport-family-specific computed camera.
   */
  abstract getComputedCamera(): ViewportComputedCamera<unknown> | undefined;

  /**
   * Converts a canvas-space point to world-space coordinates using the
   * computed camera.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const cc = this.getComputedCamera();

    if (!cc) {
      throw new Error(
        `[${this.type}] Cannot convert canvas to world for viewport ${this.id} because no data is mounted.`
      );
    }

    return cc.canvasToWorld(canvasPos);
  }

  /**
   * Converts a world-space point to canvas-space coordinates using the
   * computed camera.
   */
  worldToCanvas(worldPos: Point3): Point2 {
    const cc = this.getComputedCamera();

    if (!cc) {
      throw new Error(
        `[${this.type}] Cannot convert world to canvas for viewport ${this.id} because no data is mounted.`
      );
    }

    return cc.worldToCanvas(worldPos);
  }

  // ====================================================================
  // Public API -- camera
  // ====================================================================

  /**
   * Merges partial camera updates into the shared viewport camera state and
   * propagates the result to every active binding.
   */
  setCamera(cameraPatch: Partial<TCamera>): void {
    if (this.isDestroyed) {
      return;
    }

    const previousCamera = this.getCameraForEvent();
    const next = {
      ...this.camera,
      ...cameraPatch,
    } as TCamera;

    this.camera = this.normalizeCamera(next);
    this.modified(previousCamera);
  }

  /**
   * Returns the controller's current shared camera state.
   */
  getCamera(): TCamera {
    return this.camera;
  }

  // ====================================================================
  // Public API -- lifecycle
  // ====================================================================

  /**
   * @deprecated Compatibility no-op retained during the V2 migration.
   */
  removeWidgets(): void {
    // Next viewports do not use VTK widgets -- intentional no-op.
  }

  /**
   * Releases mounted bindings and viewport-local resources.
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.destroyBindings();
    this.onDestroy();
    this.bindings.clear();
    this.dataPresentation.clear();

    for (const key of Object.keys(this._debug.renderModes)) {
      delete this._debug.renderModes[key];
    }

    this.element.removeAttribute('data-viewport-uid');
    this.element.removeAttribute('data-rendering-engine-uid');
  }

  /**
   * Alias for {@link destroy}. Provided for compatibility with disposable
   * resource conventions.
   */
  public dispose(): void {
    this.destroy();
  }

  /**
   * Schedules a render pass for the viewport. Concrete viewport families
   * implement this to delegate to their rendering runtime.
   */
  abstract render(): void;

  // ====================================================================
  // Protected -- data loading & presentation
  // ====================================================================

  /**
   * Converts loaded logical data into a mounted rendering binding.
   *
   * The binding stores render-path callbacks so future per-dataset render
   * state, camera, transform, resize, and render requests can be routed back
   * to the correct render-path runtime.
   */
  protected async addLoadedData(
    dataId: DataId,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderingId> {
    if (this.isDestroyed) {
      throw new Error('Viewport has been destroyed');
    }

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

    const attachment = await renderPath.addData(ctx, data, options);

    if (this.isDestroyed) {
      attachment.removeData();
      throw new Error('Viewport has been destroyed');
    }

    this.bindings.set(dataId, {
      data,
      ...attachment,
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
    this._debug.renderModes[dataId] = attachment.rendering.renderMode;
    this.render();
    return attachment.rendering.id;
  }

  protected removeAllData(): void {
    for (const dataId of Array.from(this.bindings.keys())) {
      this.removeData(dataId);
    }
  }

  /**
   * Stores per-dataset render state and forwards it immediately when
   * that dataset is already added.
   */
  protected setDataPresentationState(
    dataId: DataId,
    props: TDataPresentation
  ): void {
    if (this.isDestroyed) {
      return;
    }

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

  // ====================================================================
  // Protected -- camera
  // ====================================================================

  /**
   * Hook for subclasses to clamp or adjust camera values before they are
   * stored. The default implementation returns the camera unchanged.
   */
  protected normalizeCamera(camera: TCamera): TCamera {
    return camera;
  }

  /**
   * Pushes the current shared camera state to every binding and schedules a
   * render. Optionally fires a camera-modified event when a previous camera
   * snapshot is provided.
   */
  protected modified(previousCamera?: ICamera): void {
    if (this.isDestroyed) {
      return;
    }

    this.forEachBinding((binding) => {
      binding.updateCamera(this.camera);
    });

    this.render();

    if (previousCamera) {
      this.triggerCameraModifiedEvent(previousCamera);
    }
  }

  /**
   * Returns the camera representation used for event payloads. Delegates
   * to the computed camera's ICamera projection when available, falling
   * back to the raw camera state.
   */
  protected getCameraForEvent(): ICamera {
    return this.getComputedCamera()?.toICamera() ?? this.getCamera();
  }

  /**
   * Fires a {@link Events.CAMERA_MODIFIED} event on the viewport element.
   */
  protected triggerCameraModifiedEvent(previousCamera: ICamera): void {
    const eventDetail: EventTypes.CameraModifiedEventDetail = {
      previousCamera,
      camera: this.getCameraForEvent(),
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
    };

    triggerEvent(this.element, Events.CAMERA_MODIFIED, eventDetail);
  }

  /**
   * Fires a {@link Events.CAMERA_RESET} event on the viewport element.
   */
  protected triggerCameraResetEvent(): void {
    const eventDetail: EventTypes.CameraResetEventDetail = {
      element: this.element,
      viewportId: this.id,
      camera: this.getCameraForEvent(),
      renderingEngineId: this.renderingEngineId,
    };

    triggerEvent(this.element, Events.CAMERA_RESET, eventDetail);
  }

  // ====================================================================
  // Protected -- binding access
  // ====================================================================

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

  // ====================================================================
  // Protected -- binding lifecycle
  // ====================================================================

  /**
   * Invokes render on each binding and reports whether any binding handled the
   * render request directly.
   */
  protected renderBindings(): boolean {
    if (this.isDestroyed) {
      return false;
    }

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
    if (this.isDestroyed) {
      return;
    }

    this.forEachBinding((binding) => {
      binding.resize?.();
    });
  }

  /**
   * Tears down all mounted dataset bindings by removing each one individually.
   */
  protected destroyBindings(): void {
    for (const dataId of Array.from(this.bindings.keys())) {
      this.removeData(dataId);
    }
  }

  /**
   * Hook for subclasses to release viewport-local resources during destroy.
   * Called after bindings have been torn down but before the maps are cleared.
   */
  protected onDestroy(): void {
    // Subclasses can release viewport-local resources here.
  }
}

export default ViewportNext;
