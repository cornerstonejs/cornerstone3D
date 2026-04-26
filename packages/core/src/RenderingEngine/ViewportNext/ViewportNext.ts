import type * as EventTypes from '../../types/EventTypes';
import type ICamera from '../../types/ICamera';
import type { Point2, Point3 } from '../../types';
import Events from '../../enums/Events';
import triggerEvent from '../../utilities/triggerEvent';
import type {
  BaseViewportRenderContext,
  BindingRole,
  DataAddOptions,
  DataId,
  DataProvider,
  LoadedData,
  ViewportDataBinding,
  RenderingId,
  RenderPathResolver,
  ViewportController,
  ViewportId,
} from './ViewportArchitectureTypes';
import type ViewportType from '../../enums/ViewportType';
import type ResolvedViewportView from './ResolvedViewportView';
import type {
  ReferenceCompatibleOptions,
  ViewPresentation,
  ViewPresentationSelector,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../types/IViewport';
import {
  isViewportNextReferenceViewable,
  type ViewportNextReferenceContext,
} from './viewportNextReferenceCompatibility';

/**
 * Generic ViewportNext controller.
 *
 * The base class owns only shared viewport state and binding orchestration:
 * loaded logical data, mounted renderings, view state, and per-dataset
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
 * - view-state interpretation for that render path
 * - per-dataset render-state application
 * - render-path-specific coordinate transforms
 *
 * This split keeps migration from legacy viewports incremental without
 * centralizing render-mode-specific behavior in the controller.
 */
abstract class ViewportNext<
  TViewState extends object,
  TDataPresentation = unknown,
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
  TViewPresentation = ViewPresentation,
> implements
    ViewportController<TViewState, TDataPresentation, TViewPresentation>
{
  // ── Abstract fields ──────────────────────────────────────────────────

  readonly id: ViewportId;
  readonly element: HTMLDivElement;
  abstract readonly type: ViewportType;
  abstract readonly renderingEngineId: string;

  // ── Protected fields ─────────────────────────────────────────────────

  protected dataProvider: DataProvider;
  protected renderPathResolver: RenderPathResolver;
  protected renderContext: TContext;

  protected bindings = new Map<
    DataId,
    ViewportDataBinding<TDataPresentation>
  >();
  protected dataPresentation = new Map<DataId, TDataPresentation>();
  protected viewState!: TViewState;
  protected isDestroyed = false;

  // ── Debug ────────────────────────────────────────────────────────────

  readonly _debug: { renderModes: Record<string, string> } = {
    renderModes: {},
  };

  constructor(args: { id: ViewportId; element: HTMLDivElement }) {
    this.id = args.id;
    this.element = args.element;
  }

  // ====================================================================
  // Public API -- data
  // ====================================================================

  /**
   * Replaces all mounted datasets with a single logical dataset.
   */
  async setData(dataId: DataId, options: DataAddOptions): Promise<RenderingId> {
    this.removeAllData();
    return this.addData(dataId, {
      ...options,
      role: 'source',
    });
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

    for (const [index, { dataId, options }] of entries.entries()) {
      if (!options) {
        throw new Error(
          `[${this.type}] setDataList requires per-entry options when the viewport family does not override it.`
        );
      }

      const dataOptions = options as DataAddOptions;

      renderingIds.push(
        await this.addData(dataId, {
          ...dataOptions,
          role: dataOptions.role ?? (index === 0 ? 'source' : 'overlay'),
        })
      );
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
   * Returns the binding role for a mounted dataset when present.
   */
  getDataRole(dataId: DataId): BindingRole | undefined {
    return this.getBinding(dataId)?.role;
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
      dataId: this.getCurrentBinding()?.data.id,
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
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    return isViewportNextReferenceViewable(
      viewReference,
      this.getReferenceViewContexts(viewReference),
      options
    );
  }

  /**
   * Returns the frame of reference UID from the computed camera when
   * available, falling back to the current binding or a viewport-local
   * identifier.
   */
  getFrameOfReferenceUID(): string {
    return (
      this.getResolvedView()?.getFrameOfReferenceUID() ??
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
  abstract getResolvedView():
    | ResolvedViewportView<unknown, ICamera<unknown>>
    | undefined;

  /**
   * Converts a canvas-space point to world-space coordinates using the
   * computed camera.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const cc = this.getResolvedView();

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
    const cc = this.getResolvedView();

    if (!cc) {
      throw new Error(
        `[${this.type}] Cannot convert world to canvas for viewport ${this.id} because no data is mounted.`
      );
    }

    return cc.worldToCanvas(worldPos);
  }

  // ====================================================================
  // Public API -- view state
  // ====================================================================

  /**
   * Merges partial view-state updates into the viewport source of truth and
   * propagates the result to every active binding.
   */
  setViewState(viewStatePatch: Partial<TViewState>): void {
    if (this.isDestroyed) {
      return;
    }

    const previousCamera = this.getCameraForEvent();
    const next = {
      ...this.viewState,
      ...viewStatePatch,
    } as TViewState;

    this.viewState = this.normalizeViewState(next);
    this.modified(previousCamera);
  }

  /**
   * Returns the controller's current shared view state.
   */
  getViewState(): TViewState {
    return this.viewState;
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

    const current = this.bindings.get(dataId);

    if (current && current !== existing) {
      current.removeData();
    }

    const role = options.role ?? 'overlay';

    if (role === 'source') {
      for (const [bindingDataId, binding] of this.bindings.entries()) {
        if (bindingDataId !== dataId) {
          binding.role = 'overlay';
        }
      }
    }

    this.bindings.set(dataId, {
      data,
      role,
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

    binding.applyViewState(this.viewState);
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
  // Protected -- view state
  // ====================================================================

  /**
   * Hook for subclasses to clamp or adjust view-state values before they are
   * stored. The default implementation returns the view state unchanged.
   */
  protected normalizeViewState(viewState: TViewState): TViewState {
    return viewState;
  }

  /**
   * Pushes the current shared view state to every binding and schedules a
   * render. Optionally fires a camera-modified event when a previous camera
   * snapshot is provided.
   */
  protected modified(previousCamera?: ICamera): void {
    if (this.isDestroyed) {
      return;
    }

    this.forEachBinding((binding) => {
      binding.applyViewState(this.viewState);
    });

    this.render();

    if (previousCamera) {
      this.triggerCameraModifiedEvent(previousCamera);
    }
  }

  /**
   * Returns the camera representation used for event payloads. Delegates
   * to the computed camera's ICamera projection when available, falling
   * back to the raw view state.
   */
  protected getCameraForEvent(): ICamera {
    return (this.getResolvedView()?.toICamera() ??
      this.getViewState()) as ICamera;
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
  ): ViewportDataBinding<TDataPresentation> | undefined {
    return this.bindings.get(dataId);
  }

  /**
   * Returns the first mounted binding when a viewport family does not have a
   * stronger notion of "current" selection.
   */
  protected getFirstBinding():
    | ViewportDataBinding<TDataPresentation>
    | undefined {
    return this.bindings.values().next().value;
  }

  /**
   * Returns the binding used for generic transform and frame-of-reference
   * queries when a viewport family does not override the selection logic.
   */
  protected getCurrentBinding():
    | ViewportDataBinding<TDataPresentation>
    | undefined {
    return this.getFirstBinding();
  }

  /**
   * Iterates mounted bindings without exposing the underlying map to
   * subclasses.
   */
  protected forEachBinding(
    visitor: (binding: ViewportDataBinding<TDataPresentation>) => void
  ): void {
    for (const binding of this.bindings.values()) {
      visitor(binding);
    }
  }

  /**
   * Returns generic reference-compatibility contexts for mounted datasets.
   * Subclasses can add image, volume, slice, plane, and dimension facts.
   */
  protected getReferenceViewContexts(
    _viewReference?: ViewReference
  ): ViewportNextReferenceContext[] {
    const contexts: ViewportNextReferenceContext[] = [];
    const resolvedView = this.getResolvedView();
    const camera = resolvedView?.toICamera();

    for (const [dataId, binding] of this.bindings.entries()) {
      contexts.push({
        dataId,
        dataIds: [binding.data.id],
        frameOfReferenceUID:
          binding.getFrameOfReferenceUID() ??
          resolvedView?.getFrameOfReferenceUID() ??
          this.getFrameOfReferenceUID(),
        cameraFocalPoint: camera?.focalPoint,
        viewPlaneNormal: camera?.viewPlaneNormal,
      });
    }

    if (!contexts.length) {
      contexts.push({
        frameOfReferenceUID: this.getFrameOfReferenceUID(),
        cameraFocalPoint: camera?.focalPoint,
        viewPlaneNormal: camera?.viewPlaneNormal,
      });
    }

    return contexts;
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
