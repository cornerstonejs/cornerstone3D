import type * as EventTypes from '../../types/EventTypes';
import type { Point2, Point3 } from '../../types';
import type ICamera from '../../types/ICamera';
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
import type { ViewAnchor, ViewportCameraBase } from './ViewportCameraTypes';

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
  TCamera extends ICamera & ViewportCameraBase<unknown>,
  TDataPresentation = unknown,
  TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
> implements ViewportController<TCamera, TDataPresentation>
{
  abstract readonly id: ViewportId;
  abstract readonly type: ViewportType;
  abstract readonly element: HTMLDivElement;
  abstract readonly renderingEngineId: string;

  protected dataProvider: DataProvider;
  protected renderPathResolver: RenderPathResolver;
  protected renderContext: TContext;

  protected bindings = new Map<DataId, RenderingBinding<TDataPresentation>>();
  protected dataPresentation = new Map<DataId, TDataPresentation>();
  protected camera!: TCamera;
  protected isDestroyed = false;

  readonly _debug: { renderModes: Record<string, string> } = {
    renderModes: {},
  };

  /**
   * Loads a logical dataset through the viewport data provider and adds it
   * through the render-path resolver.
   */
  async setDataId(
    dataId: DataId,
    options: DataAddOptions
  ): Promise<RenderingId> {
    if (this.isDestroyed) {
      throw new Error('Viewport has been destroyed');
    }

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

  /**
   * Merges partial camera updates into the shared viewport camera state and
   * propagates that state to every active binding.
   */
  protected normalizeCamera(camera: TCamera): TCamera {
    return camera;
  }

  setCamera(cameraPatch: Partial<TCamera>): void {
    if (this.isDestroyed) {
      return;
    }

    const previousCamera = this.getCameraForEvent();
    const next = {
      ...this.camera,
      ...cameraPatch,
      ...(cameraPatch.frame !== undefined
        ? {
            frame: {
              ...(this.camera.frame || {}),
              ...(cameraPatch.frame || {}),
            },
          }
        : {}),
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

  getScale(): number {
    return Math.max(this.camera.frame?.scale ?? 1, 0.001);
  }

  setScale(scale: number): void {
    this.setCamera({
      frame: {
        ...(this.camera.frame || {}),
        scale: Math.max(scale, 0.001),
        scaleMode: 'fit',
      },
    } as Partial<TCamera>);
  }

  getAnchorCanvas(): ViewAnchor {
    const [x, y] = this.camera.frame?.anchorCanvas ?? [0.5, 0.5];

    return [x, y];
  }

  setAnchorCanvas(anchorCanvas: ViewAnchor): void {
    this.setCamera({
      frame: {
        ...(this.camera.frame || {}),
        anchorCanvas: [anchorCanvas[0], anchorCanvas[1]],
      },
    } as Partial<TCamera>);
  }

  /**
   * Uses the current binding's render-path transform.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const binding = this.getCurrentBinding();

    if (!binding) {
      throw new Error(
        `[ViewportV2] Cannot convert canvas to world for viewport ${this.id} because no rendering is mounted.`
      );
    }

    return binding.canvasToWorld(canvasPos);
  }

  /**
   * Uses the current binding's render-path transform.
   */
  worldToCanvas(worldPos: Point3): Point2 {
    const binding = this.getCurrentBinding();

    if (!binding) {
      throw new Error(
        `[ViewportV2] Cannot convert world to canvas for viewport ${this.id} because no rendering is mounted.`
      );
    }

    return binding.worldToCanvas(worldPos);
  }

  /**
   * Returns the current binding's frame of reference when one exists.
   * Falls back to a viewport-local identifier so callers still get a stable
   * value for non-referenceable viewports.
   */
  getFrameOfReferenceUID(): string {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return `${this.type}-viewport-${this.id}`;
    }

    return binding.getFrameOfReferenceUID();
  }

  /**
   * Tears down all mounted dataset bindings during viewport reset.
   */
  removeWidgets(): void {
    // V2 viewports do not use VTK widgets — intentional no-op.
  }

  removeDataId(dataId: DataId): void {
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

  protected getCameraForEvent(): ICamera {
    return this.getCamera();
  }

  protected triggerCameraModifiedEvent(previousCamera: ICamera): void {
    const eventDetail: EventTypes.CameraModifiedEventDetail = {
      camera: this.getCameraForEvent(),
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
    };

    triggerEvent(this.element, Events.CAMERA_MODIFIED, eventDetail);
  }

  protected triggerCameraResetEvent(): void {
    const eventDetail: EventTypes.CameraResetEventDetail = {
      viewportId: this.id,
      camera: this.getCameraForEvent(),
      renderingEngineId: this.renderingEngineId,
    };

    triggerEvent(this.element, Events.CAMERA_RESET, eventDetail);
  }

  /**
   * Pushes the current shared camera state to every binding and schedules a
   * render.
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

  public dispose(): void {
    this.destroy();
  }

  protected destroyBindings(): void {
    for (const dataId of Array.from(this.bindings.keys())) {
      this.removeDataId(dataId);
    }
  }

  protected onDestroy(): void {
    // Subclasses can release viewport-local resources here.
  }

  abstract render(): void;
}

export default ViewportV2;
