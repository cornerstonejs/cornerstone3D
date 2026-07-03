import type * as EventTypes from '../../types/EventTypes';
import type ICamera from '../../types/ICamera';
import type { Point2, Point3, ViewportContentMode } from '../../types';
import Events from '../../enums/Events';
import ViewportStatus from '../../enums/ViewportStatus';
import triggerEvent from '../../utilities/triggerEvent';
import renderingEngineCache from '../renderingEngineCache';
import type { IRenderingEngine } from '../../types';
import type {
  BaseViewportRenderContext,
  BindingRole,
  DataAddOptions,
  DisplaySetId,
  DataProvider,
  LoadedData,
  ViewportDataBinding,
  RenderPathResolver,
  ViewportController,
  ViewportId,
} from './ViewportArchitectureTypes';
import type ViewportType from '../../enums/ViewportType';
import type ResolvedViewportView from './ResolvedViewportView';
import type {
  ReferenceCompatibleOptions,
  ViewReference,
  ViewReferenceSpecifier,
  RenderingEngineResizeOptions,
} from '../../types/IViewport';
import {
  isGenericViewportReferenceViewable,
  type GenericViewportReferenceContext,
} from './genericViewportReferenceCompatibility';

/**
 * Generic GenericViewport controller.
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
abstract class GenericViewport<
  TViewState extends object,
  TDataPresentation = unknown,
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
> implements ViewportController<TViewState, TDataPresentation>
{
  // ── Abstract fields ──────────────────────────────────────────────────

  readonly id: ViewportId;
  readonly element: HTMLDivElement;
  abstract readonly type: ViewportType;
  abstract readonly renderingEngineId: string;
  public viewportStatus: ViewportStatus = ViewportStatus.NO_DATA;

  // ── Protected fields ─────────────────────────────────────────────────

  protected dataProvider: DataProvider;
  protected renderPathResolver: RenderPathResolver;
  protected renderContext: TContext;

  protected bindings = new Map<
    DisplaySetId,
    ViewportDataBinding<TDataPresentation>
  >();
  protected dataPresentation = new Map<DisplaySetId, TDataPresentation>();
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
   * Replaces all mounted display sets with the provided logical display sets.
   * The first entry is mounted as the source binding; subsequent entries default
   * to the overlay role unless they specify one explicitly.
   */
  async setDisplaySets(
    ...entries: Array<{ displaySetId: DisplaySetId; options?: unknown }>
  ): Promise<void> {
    this.removeAllData();

    for (const [index, { displaySetId, options }] of entries.entries()) {
      if (!options) {
        throw new Error(
          `[${this.type}] setDisplaySets requires per-entry options when the viewport family does not override it.`
        );
      }

      const dataOptions = options as DataAddOptions;

      await this.addDisplaySet(displaySetId, {
        ...dataOptions,
        role: dataOptions.role ?? (index === 0 ? 'source' : 'overlay'),
      });
    }
  }

  /**
   * Loads a logical display set through the viewport data provider and adds it
   * through the render-path resolver.
   */
  async addDisplaySet(
    displaySetId: DisplaySetId,
    options: DataAddOptions
  ): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('Viewport has been destroyed');
    }

    const data = await this.dataProvider.load(displaySetId, options);
    await this.addLoadedData(displaySetId, data, options);
  }

  /**
   * Returns the display sets currently mounted on the viewport, in mount order
   * (source binding first, then overlays). Derived from the live bindings, so
   * it always reflects what is actually rendered - including overlays and any
   * `removeData` calls. The per-entry `options` carry the binding `role`.
   */
  getDisplaySets(): Array<{ displaySetId: DisplaySetId; options?: unknown }> {
    return Array.from(this.bindings.entries()).map(
      ([displaySetId, binding]) => ({
        displaySetId,
        options: { role: binding.role },
      })
    );
  }

  /**
   * Removes a dataset binding and its stored presentation state, then
   * triggers a re-render so the viewport reflects the removal.
   */
  removeData(displaySetId: DisplaySetId): void {
    const binding = this.bindings.get(displaySetId);

    if (!binding) {
      return;
    }

    binding.removeData();
    this.bindings.delete(displaySetId);
    this.dataPresentation.delete(displaySetId);
    delete this._debug.renderModes[displaySetId];

    if (!this.isDestroyed) {
      this.render();
    }
  }

  /**
   * Updates the stored per-display-set presentation state. When called with
   * just `props`, the update is applied to the current (source) binding. When
   * called with an explicit `displaySetId`, the update targets that binding.
   */
  setDisplaySetPresentation(props: Partial<TDataPresentation>): void;
  setDisplaySetPresentation(
    displaySetId: DisplaySetId,
    props: Partial<TDataPresentation>
  ): void;
  setDisplaySetPresentation(
    displaySetIdOrProps: DisplaySetId | Partial<TDataPresentation>,
    maybeProps?: Partial<TDataPresentation>
  ): void {
    if (typeof displaySetIdOrProps === 'string') {
      this.mergeDataPresentation(displaySetIdOrProps, maybeProps ?? {});
      return;
    }

    const defaultId = this.getCurrentBinding()?.data.id;

    if (!defaultId) {
      return;
    }

    this.mergeDataPresentation(defaultId, displaySetIdOrProps);
  }

  /**
   * Returns the stored presentation state for a specific dataset.
   */
  getDisplaySetPresentation(
    displaySetId: DisplaySetId
  ): TDataPresentation | undefined {
    return this.getDataPresentationState(displaySetId);
  }

  /**
   * Content-true classification of the currently bound source data.
   *
   * The duck-typing capability guards (`viewportSupportsImageSlices`,
   * `viewportSupportsVolumeId`, ...) report which methods a viewport exposes,
   * not what it is showing, so a single generic viewport reports support for
   * both stack and volume operations regardless of its bound content. This
   * method answers the content question instead, derived from the mounted
   * source binding. The base implementation only distinguishes "has bound data"
   * from "empty"; concrete viewport families override it to report `stack`,
   * `volume`, `volume3d`, etc. See {@link ViewportContentMode}.
   */
  getCurrentMode(): ViewportContentMode {
    return this.getSourceBinding() ? 'unknown' : 'empty';
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
    return isGenericViewportReferenceViewable(
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

  /**
   * Returns the rendering engine that owns this viewport. Tools and utilities
   * rely on this method existing on every viewport (legacy Viewport provides
   * it); without it, calls like `viewport.getRenderingEngine()` threw on native
   * generic viewports.
   */
  getRenderingEngine(): IRenderingEngine {
    return renderingEngineCache.get(this.renderingEngineId);
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

  /**
   * Returns the current axis-based stretch as `[scaleX, scaleY]`. The new
   * generic viewport pipeline does not apply axis-based stretching for now, so this
   * defaults to `[1, 1]`. Subclasses that support aspect-ratio stretching
   * should override.
   */
  getAspectRatio(): Point2 {
    return [1, 1];
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

  /**
   * Computes a view-state patch from the current state, then applies it through
   * `setViewState` so normalization, events, and render invalidation stay in
   * the canonical mutation path.
   */
  updateViewState(
    updater:
      | Partial<TViewState>
      | ((viewState: TViewState) => Partial<TViewState> | void)
  ): void {
    const patch =
      typeof updater === 'function' ? updater(this.getViewState()) : updater;

    if (!patch) {
      return;
    }

    this.setViewState(patch);
  }

  // ====================================================================
  // Public API -- lifecycle
  // ====================================================================

  /**
   * @deprecated Compatibility no-op retained during the V2 migration.
   */
  removeWidgets(): void {
    // Generic viewports do not use VTK widgets -- intentional no-op.
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
   * Called by rendering engines after a frame is rendered.
   *
   * Most GenericViewport families do not need to track this separately because
   * their render paths own concrete runtime state.
   */
  setRendered(): void {
    if (
      this.viewportStatus === ViewportStatus.NO_DATA ||
      this.viewportStatus === ViewportStatus.LOADING
    ) {
      return;
    }

    this.viewportStatus = ViewportStatus.RENDERED;
  }

  /**
   * Marks the viewport as waiting for a render pass without scheduling one.
   */
  setNeedsRender(): void {
    this.viewportStatus = ViewportStatus.NEEDS_RENDER;
  }

  /**
   * Schedules a render pass for the viewport. Concrete viewport families
   * implement this to delegate to their rendering runtime.
   */
  abstract render(): void;

  /**
   * Re-evaluates render paths after a global rendering-configuration change
   * (setRenderBackend, or a deprecated CPU-rendering toggle). The default is
   * a no-op; viewport families that support a live render-path swap override
   * it. Present on every viewport so the global fan-out in init() can call it
   * unconditionally.
   */
  updateRenderingPipeline(): void {
    // No-op by default; families with swappable render paths override this.
  }

  /**
   * Recomputes viewport-owned runtime sizing. Concrete viewport families may
   * override this when they need to resize canvases or external runtimes.
   */
  resize(): void {
    if (this.isDestroyed) {
      return;
    }

    this.resizeBindings();
    this.modified();
  }

  /**
   * Resets viewport-owned view state for viewport families that support a
   * navigation reset.
   */
  resetViewState(_options?: unknown): boolean {
    return false;
  }

  /**
   * RenderingEngine-owned resize hook for custom-pipeline viewports.
   *
   * Generic viewports own semantic view state, so the rendering engine delegates
   * resize behavior here instead of preserving legacy getCamera/setCamera
   * snapshots around a reset.
   */
  resizeForRenderingEngine({
    keepCamera = true,
  }: RenderingEngineResizeOptions = {}): void {
    if (this.isDestroyed) {
      return;
    }

    this.resize();

    if (!keepCamera) {
      this.resetViewState();
    }
  }

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
    displaySetId: DisplaySetId,
    data: LoadedData,
    options: DataAddOptions,
    shouldIgnore?: () => boolean
  ): Promise<boolean> {
    if (this.isDestroyed) {
      throw new Error('Viewport has been destroyed');
    }

    if (shouldIgnore?.()) {
      return false;
    }

    const path = this.renderPathResolver.resolve<TContext>(
      this.type,
      data,
      options
    );
    const renderPath = path.createRenderPath();
    const ctx = path.selectContext?.(this.renderContext) ?? this.renderContext;
    const existing = this.bindings.get(displaySetId);

    if (existing) {
      existing.removeData();
    }

    const attachment = await renderPath.addData(ctx, data, options);

    if (shouldIgnore?.()) {
      attachment.removeData();
      return false;
    }

    if (this.isDestroyed) {
      attachment.removeData();
      throw new Error('Viewport has been destroyed');
    }

    const current = this.bindings.get(displaySetId);

    if (current && current !== existing) {
      current.removeData();
    }

    const role = options.role ?? 'overlay';

    if (role === 'source') {
      for (const [bindingDisplaySetId, binding] of this.bindings.entries()) {
        if (bindingDisplaySetId !== displaySetId) {
          binding.role = 'overlay';
        }
      }
    }

    this.bindings.set(displaySetId, {
      data,
      role,
      ...attachment,
    });

    const binding = this.bindings.get(displaySetId);

    if (!binding) {
      throw new Error(`Failed to bind rendering for ${displaySetId}`);
    }

    const props = this.dataPresentation.get(displaySetId);
    if (props !== undefined) {
      binding.updateDataPresentation(props);
    }

    binding.applyViewState(this.viewState);
    this._debug.renderModes[displaySetId] = attachment.rendering.renderMode;
    this.viewportStatus = ViewportStatus.PRE_RENDER;
    this.render();

    return true;
  }

  protected removeAllData(): void {
    for (const displaySetId of Array.from(this.bindings.keys())) {
      this.removeData(displaySetId);
    }
  }

  /**
   * Stores per-dataset render state and forwards it immediately when
   * that dataset is already added.
   */
  protected setDataPresentationState(
    displaySetId: DisplaySetId,
    props: TDataPresentation
  ): void {
    if (this.isDestroyed) {
      return;
    }

    this.dataPresentation.set(displaySetId, props);
    const binding = this.bindings.get(displaySetId);

    if (!binding) {
      return;
    }

    binding.updateDataPresentation(props);
    this.render();
  }

  /**
   * Returns the last render state stored for a display set, even if that
   * display set is not currently mounted.
   */
  protected getDataPresentationState(
    displaySetId: DisplaySetId
  ): TDataPresentation | undefined {
    return this.dataPresentation.get(displaySetId);
  }

  /**
   * Stores object-like defaults for a display set without clobbering any values
   * already tracked for that display set.
   */
  protected setDefaultDataPresentation(
    displaySetId: DisplaySetId,
    defaults: TDataPresentation
  ): TDataPresentation {
    const nextPresentation = {
      ...(defaults as Record<string, unknown>),
      ...((this.getDataPresentationState(displaySetId) || {}) as Record<
        string,
        unknown
      >),
    } as TDataPresentation;

    this.setDataPresentationState(displaySetId, nextPresentation);

    return nextPresentation;
  }

  /**
   * Merges object-like updates into the stored per-display-set render state and
   * forwards the result immediately when mounted.
   */
  protected mergeDataPresentation(
    displaySetId: DisplaySetId,
    props: Partial<TDataPresentation>
  ): TDataPresentation {
    const nextPresentation = {
      ...((this.getDataPresentationState(displaySetId) || {}) as Record<
        string,
        unknown
      >),
      ...(props as Record<string, unknown>),
    } as TDataPresentation;

    this.setDataPresentationState(displaySetId, nextPresentation);

    // Notify only when the change targets a mounted dataset so that listeners
    // (VOI/colormap UI, synchronizers) react to applied presentation changes.
    if (this.bindings.has(displaySetId)) {
      this.notifyDataPresentationModified(displaySetId, props);
    }

    return nextPresentation;
  }

  /**
   * Hook invoked after a per-display-set presentation update is applied through
   * the public `setDisplaySetPresentation` path and the target display set is
   * mounted. Concrete viewport families override this to emit their
   * presentation-modified events (e.g. `VOI_MODIFIED`, `COLORMAP_MODIFIED`) so
   * application UI and synchronizers can react to programmatic and tool-driven
   * presentation changes. The base implementation is intentionally a no-op.
   */
  protected notifyDataPresentationModified(
    _displaySetId: DisplaySetId,
    _props: Partial<TDataPresentation>
  ): void {
    // Subclasses emit presentation-modified events; base viewports do not.
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
    displaySetId: DisplaySetId
  ): ViewportDataBinding<TDataPresentation> | undefined {
    return this.bindings.get(displaySetId);
  }

  /**
   * Internal helper: returns the mounted render mode for a specific dataset
   * when present.
   */
  protected getDisplaySetRenderMode(
    displaySetId: DisplaySetId
  ): string | undefined {
    return this.getBinding(displaySetId)?.rendering.renderMode;
  }

  /**
   * Internal helper: returns the binding role for a mounted dataset when
   * present.
   */
  protected getDisplaySetRole(
    displaySetId: DisplaySetId
  ): BindingRole | undefined {
    return this.getBinding(displaySetId)?.role;
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
   * Returns the active source binding (the dataset that defines the view),
   * falling back to the first mounted binding when no explicit `source` role is
   * present. Used for content-mode classification and source-scoped queries.
   */
  protected getSourceBinding():
    | ViewportDataBinding<TDataPresentation>
    | undefined {
    for (const binding of this.bindings.values()) {
      if (binding.role === 'source') {
        return binding;
      }
    }
    return this.getFirstBinding();
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
  ): GenericViewportReferenceContext[] {
    const contexts: GenericViewportReferenceContext[] = [];
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

export default GenericViewport;
