import type * as EventTypes from '../../types/EventTypes';
import type ICamera from '../../types/ICamera';
import type {
  IViewport,
  Point2,
  Point3,
  ViewportContentMode,
} from '../../types';
import Events from '../../enums/Events';
import ViewportStatus from '../../enums/ViewportStatus';
import triggerEvent from '../../utilities/triggerEvent';
import renderingEngineCache from '../renderingEngineCache';
import { deepClone } from '../../utilities/deepClone';
import { deepEqual } from '../../utilities/deepEqual';
import type ViewportInputOptions from '../../types/ViewportInputOptions';
import type DisplayArea from '../../types/displayArea';
import type { PlanarDisplayArea } from './Planar/PlanarViewportTypes';
import type { IRenderingEngine } from '../../types';
import type {
  BaseViewportRenderContext,
  BindingRole,
  DataAddOptions,
  DisplaySetId,
  DataProvider,
  LoadedData,
  MountedRendering,
  RenderPathAttachment,
  ViewportDataBinding,
  RenderPathResolver,
  ViewportController,
  ViewportId,
} from './ViewportArchitectureTypes';
import type ViewportType from '../../enums/ViewportType';
import type ResolvedViewportView from './ResolvedViewportView';
import type {
  ReferenceCompatibleOptions,
  ReferenceViewableCheck,
  ViewFraming,
  ViewFramingSelector,
  ViewReference,
  ViewReferenceSpecifier,
  RenderingEngineResizeOptions,
} from '../../types/IViewport';
import type { ProjectionWriteOptions } from './ViewportProjectionTypes';
import { viewportProjection } from './viewportProjection';
import {
  isViewReferenceViewable,
  type ViewReferenceContext,
} from './viewReferenceCompatibility';
import type { FidelityLine } from '../helpers/fidelityIndicator/fidelityIndicatorState';
import type {
  IViewportFidelity,
  ViewportFidelityState,
} from '../../types/ViewportFidelity';
import { buildViewportFidelityState } from '../helpers/fidelityIndicator/buildViewportFidelityState';
import {
  type FidelityDisplay,
  type SlabAppearance,
  averageSlabThicknessOf,
  displaySpacingOfDisplay,
  pixelSpacingOfCanvasToWorld,
} from '../helpers/fidelityIndicator/displaySpacingOfViewport';
import { notifyFidelityStateChanged } from '../helpers/fidelityIndicator/notifyFidelityStateChanged';
import { getViewportLocalFrameOfReferenceUID } from '../helpers/getViewportLocalFrameOfReferenceUID';
import {
  type BindingFidelitySource,
  fidelityLinesFromBindings,
} from '../helpers/fidelityIndicator/collectFidelityLines';

/**
 * The options of a next viewport: the legacy viewport input options, where
 * the display area may also be one of the planar viewport, whose scale can
 * be a point.
 */
export type BaseViewportOptions = Omit<ViewportInputOptions, 'displayArea'> & {
  displayArea?: DisplayArea | PlanarDisplayArea;
};

/**
 * The overrides and the effective appearance of a display set at one
 * moment, to find the keys that a change changed.
 */
type AppearanceSnapshot = {
  overrides: Record<string, unknown>;
  effective: Record<string, unknown>;
};

/** The size of a canvas in CSS pixels. */
type CanvasSize = { width: number; height: number };

/** Whether a size has a width and a height. */
function hasArea(size: CanvasSize): boolean {
  return size.width > 0 && size.height > 0;
}

/** Whether two sizes are the same. */
function isSameSize(a: CanvasSize, b: CanvasSize): boolean {
  return a.width === b.width && a.height === b.height;
}

/** A copy of an object without the keys whose value is undefined. */
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

/**
 * The colormap of an appearance change merged one level deep into the
 * stored colormap: a colormap that names only some of its fields keeps the
 * stored others, so the name stays when only the threshold changes, and a
 * field given as undefined is removed. Empty when the change or the stored
 * overrides have no colormap object.
 */
function mergedColormapOf(
  overrides: Record<string, unknown>,
  changes: object
): { colormap?: object } {
  const stored = overrides.colormap;
  const changed = (changes as { colormap?: unknown }).colormap;

  if (!isPlainObject(stored) || !isPlainObject(changed)) {
    return {};
  }

  return { colormap: withoutUndefined({ ...stored, ...changed }) };
}

/** Puts a value back into a map, or removes the key when there was none. */
function restoreMapEntry<K, V>(map: Map<K, V>, key: K, value: V | undefined) {
  if (value === undefined) {
    map.delete(key);
  } else {
    map.set(key, value);
  }
}

/**
 * Puts back the value that a map entry had before a staged change, unless a
 * later change replaced the staged value: a newer mount of the same display
 * set keeps what it staged when an older mount ends without a bind.
 */
function restoreStagedMapEntry<K, V>(
  map: Map<K, V>,
  key: K,
  staged: V | undefined,
  previous: V | undefined
) {
  const current = map.get(key);

  if (current !== undefined && current !== staged) {
    return;
  }

  restoreMapEntry(map, key, previous);
}

function isPlainObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The base controller of every viewport family.
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
abstract class BaseViewport<
    TViewState extends object,
    TAppearance = unknown,
    TContext extends BaseViewportRenderContext = BaseViewportRenderContext,
    TFraming extends ViewFraming = ViewFraming,
    TFramingSelector extends ViewFramingSelector = ViewFramingSelector,
  >
  implements
    IViewport<TViewState, TAppearance, TFraming, TFramingSelector>,
    ViewportController<TViewState, TAppearance>,
    IViewportFidelity
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
    ViewportDataBinding<TAppearance>
  >();
  /**
   * The explicit overrides of the appearance of each display set: what
   * callers set, and nothing the viewport computed.
   */
  protected displaySetAppearances = new Map<DisplaySetId, TAppearance>();
  /**
   * The defaults of the family that a mount stores for a display set, as
   * `visible: true`. A binding gets the overrides over them; they are not
   * overrides, so `getDisplaySetAppearance` leaves them out.
   */
  protected defaultDisplaySetAppearances = new Map<DisplaySetId, TAppearance>();
  protected viewState!: TViewState;
  private destroyed = false;
  private setDisplaySetsCallId = 0;
  /**
   * The abort of the newest `setDisplaySets` call: a newer call aborts it,
   * so that a mount that waits for its data stops at once.
   */
  private setDisplaySetsAbort?: AbortController;
  /**
   * The display sets and the source of the last DISPLAY_SETS_CHANGED, which
   * the next one compares with to say what was removed and whether the
   * source changed.
   */
  private notifiedDisplaySets: {
    displaySetIds: DisplaySetId[];
    sourceDisplaySetId?: DisplaySetId;
  } = { displaySetIds: [] };
  /**
   * The last size of the canvas, in CSS pixels, that had a width and a
   * height: the size that the view is framed at while the element has none.
   * See `getFramingCanvasSize`.
   */
  private lastCanvasSize?: CanvasSize;
  /**
   * The framing that `setViewFraming` gave while the element had no size,
   * read back after the write, and the size that it was measured at. See
   * `setViewFraming`.
   */
  private pendingViewFraming?: { framing: TFraming; size: CanvasSize };

  // ── Debug ────────────────────────────────────────────────────────────

  readonly _debug: { renderModes: Record<string, string> } = {
    renderModes: {},
  };

  constructor(args: {
    id: ViewportId;
    element: HTMLDivElement;
    defaultOptions?: BaseViewportOptions;
  }) {
    this.id = args.id;
    this.element = args.element;
    this.defaultOptions = deepClone(args.defaultOptions || {});
    // Tools take these off the viewport (`const { worldToCanvas } = viewport`),
    // as the legacy viewports allow, so they must keep `this`.
    this.canvasToWorld = this.canvasToWorld.bind(this);
    this.worldToCanvas = this.worldToCanvas.bind(this);
  }

  // ====================================================================
  // Public API -- data
  // ====================================================================

  /**
   * Replaces all mounted display sets with the provided logical display sets.
   * The first entry is mounted as the source binding; subsequent entries default
   * to the overlay role unless they specify one explicitly. Fires
   * DISPLAY_SETS_CHANGED once when all are mounted; a newer call stops this
   * one, which then fires nothing.
   */
  async setDisplaySets(
    ...entries: Array<{ displaySetId: DisplaySetId; options?: unknown }>
  ): Promise<void> {
    const isSuperseded = this.startSetDisplaySets();

    this.removeAllData();

    for (const [index, { displaySetId, options }] of entries.entries()) {
      if (!options) {
        throw new Error(
          `[${this.type}] setDisplaySets requires per-entry options when the viewport family does not override it.`
        );
      }

      const dataOptions = options as DataAddOptions;
      const bound = await this.bindDisplaySet(
        displaySetId,
        {
          ...dataOptions,
          role: dataOptions.role ?? (index === 0 ? 'source' : 'overlay'),
        },
        isSuperseded
      );

      if (!bound) {
        return;
      }
    }

    this.triggerDisplaySetsChanged(
      entries.map(({ displaySetId }) => displaySetId)
    );
  }

  /**
   * Loads a logical display set through the viewport data provider and adds it
   * through the render-path resolver, then fires DISPLAY_SETS_CHANGED. Without
   * a `role` it mounts with the role that {@link resolveAddRole} gives: the
   * source on a viewport that shows nothing.
   */
  async addDisplaySet(
    displaySetId: DisplaySetId,
    options: DataAddOptions
  ): Promise<void> {
    const bound = await this.bindDisplaySet(displaySetId, {
      ...options,
      role: this.resolveAddRole(displaySetId, options?.role),
    });

    if (bound) {
      this.triggerDisplaySetsChanged([displaySetId]);
    }
  }

  /**
   * The role that `addDisplaySet` mounts a display set with. A role that the
   * call names wins. Without one, a display set that the viewport shows
   * already keeps its role, the first display set of a viewport that shows
   * nothing is the source, as the first entry of `setDisplaySets` is, and
   * any other is an overlay. So a viewport that was mounted with overlays
   * only (an explicit `role: 'overlay'`) gets no source this way. The role is
   * decided when the call starts, as the render path decision of a planar
   * mount needs it before the load.
   */
  protected resolveAddRole(
    displaySetId: DisplaySetId,
    role?: BindingRole
  ): BindingRole {
    return (
      role ??
      this.bindings.get(displaySetId)?.role ??
      (this.bindings.size ? 'overlay' : 'source')
    );
  }

  /**
   * Makes the first display set in mount order the source and the others
   * overlays, and gives its id (undefined when the viewport shows nothing).
   * The removal of the source calls it, so a viewport keeps a source while
   * it shows display sets, unless it was mounted with overlays only.
   */
  protected promoteFirstDisplaySetToSource(): DisplaySetId | undefined {
    const [firstDisplaySetId] = this.bindings.keys();

    for (const [displaySetId, binding] of this.bindings) {
      binding.role = displaySetId === firstDisplaySetId ? 'source' : 'overlay';
    }

    return firstDisplaySetId;
  }

  /**
   * Loads a display set through the data provider and binds it, without an
   * event. Gives false, and binds nothing, when `shouldIgnore` tells after
   * the load or after the render path added the data that the call is
   * stale, or when `signal` aborts while the render path adds the data.
   */
  protected async bindDisplaySet(
    displaySetId: DisplaySetId,
    options: DataAddOptions,
    shouldIgnore?: () => boolean,
    signal?: AbortSignal
  ): Promise<boolean> {
    if (this.isDestroyed) {
      throw new Error('Viewport has been destroyed');
    }

    const data = await this.dataProvider.load(displaySetId, options);

    return this.addLoadedData(
      displaySetId,
      data,
      options,
      shouldIgnore,
      signal
    );
  }

  /**
   * Returns the display sets currently mounted on the viewport, in mount order
   * (source binding first, then overlays). Derived from the live bindings, so
   * it always reflects what is actually rendered - including overlays and any
   * `removeDisplaySet` calls. The per-entry `options` carry the binding `role`.
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
   * Returns the role and the mounted renderings of every display set, in
   * mount order, for the stats overlay. `rendering` defines the render mode,
   * and `renderings` holds every rendering that the attachment keeps mounted.
   * The renderings are the live state of the render paths: read them, never
   * change them.
   *
   * @internal
   */
  getDebugBindings(): ReadonlyArray<{
    displaySetId: DisplaySetId;
    role: BindingRole;
    rendering: Readonly<MountedRendering>;
    renderings: ReadonlyArray<Readonly<MountedRendering>>;
  }> {
    return Array.from(this.bindings.entries()).map(
      ([displaySetId, binding]) => ({
        displaySetId,
        role: binding.role,
        rendering: binding.rendering,
        renderings: binding.getRenderings?.() ?? [binding.rendering],
      })
    );
  }

  /**
   * Removes a mounted display set, then fires DISPLAY_SETS_CHANGED. An id
   * that the viewport does not show fires nothing. When the source goes and
   * other display sets remain, the first of them becomes the source
   * (`sourceChanged: true`); the removal of an overlay changes no role.
   */
  removeDisplaySet(displaySetId: DisplaySetId): void {
    const mounted = this.bindings.has(displaySetId);

    this.removeDisplaySetBinding(displaySetId);

    if (mounted) {
      this.triggerDisplaySetsChanged([]);
    }
  }

  /**
   * Removes a dataset binding and its stored appearance, makes the first
   * display set left the source when the removed one was the source
   * ({@link promoteFirstDisplaySetToSource}), then triggers a re-render so
   * the viewport reflects the removal. It fires no event: the public call
   * that removes the display set fires DISPLAY_SETS_CHANGED. A viewport
   * family overrides it to release what it keeps per display set.
   */
  protected removeDisplaySetBinding(displaySetId: DisplaySetId): void {
    const binding = this.bindings.get(displaySetId);

    if (!binding) {
      return;
    }

    binding.removeData();
    this.bindings.delete(displaySetId);
    this.displaySetAppearances.delete(displaySetId);
    this.defaultDisplaySetAppearances.delete(displaySetId);
    delete this._debug.renderModes[displaySetId];

    if (binding.role === 'source') {
      this.promoteFirstDisplaySetToSource();
    }

    if (!this.isDestroyed) {
      this.render();
    }
  }

  /**
   * Merges explicit overrides into the appearance of a display set. When
   * called with just `props`, the update is applied to the current (source)
   * binding. When called with an explicit `displaySetId`, the update targets
   * that binding. A key given as `undefined` removes its override, so the key
   * is back to its default. A change of a mounted display set fires
   * `DISPLAY_SET_APPEARANCE_CHANGED` once with cause `'edit'`; a call that
   * changes nothing fires nothing.
   */
  setDisplaySetAppearance(props: Partial<TAppearance>): void;
  setDisplaySetAppearance(
    displaySetId: DisplaySetId,
    props: Partial<TAppearance>
  ): void;
  setDisplaySetAppearance(
    displaySetIdOrProps: DisplaySetId | Partial<TAppearance>,
    maybeProps?: Partial<TAppearance>
  ): void {
    if (typeof displaySetIdOrProps === 'string') {
      this.mergeAppearance(displaySetIdOrProps, maybeProps ?? {});
      return;
    }

    const defaultId = this.getCurrentBinding()?.data.id;

    if (!defaultId) {
      return;
    }

    this.mergeAppearance(defaultId, displaySetIdOrProps);
  }

  /**
   * The explicit overrides of the appearance of a display set: what callers
   * set, also a value equal to the default, and none of the defaults of the
   * data or the family. `setDisplaySetAppearance(id,
   * getDisplaySetAppearance(id))` therefore changes nothing. Copy or store
   * this; to show or compare what is drawn, read
   * {@link getEffectiveDisplaySetAppearance}.
   *
   * @param displaySetId - The display set; the current one when not given.
   * @returns A copy of the overrides, `{}` for a mounted display set without
   * any, undefined for a display set that is neither mounted nor has
   * overrides.
   */
  getDisplaySetAppearance(
    displaySetId?: DisplaySetId
  ): TAppearance | undefined {
    const targetId = displaySetId ?? this.getCurrentBinding()?.data.id;

    if (!targetId) {
      return undefined;
    }

    const overrides = this.getAppearanceState(targetId);

    if (!overrides && !this.bindings.has(targetId)) {
      return undefined;
    }

    return { ...(overrides ?? {}) } as TAppearance;
  }

  /**
   * The appearance that a display set is drawn with: its overrides over the
   * defaults of its family and of its data, as the default window of the
   * image on display. Show or compare this; to copy or store an appearance,
   * read {@link getDisplaySetAppearance}.
   *
   * @param displaySetId - The display set; the current one when not given.
   * @returns The effective appearance, or undefined when the display set is
   * not mounted.
   */
  getEffectiveDisplaySetAppearance(
    displaySetId?: DisplaySetId
  ): TAppearance | undefined {
    const targetId = displaySetId ?? this.getCurrentBinding()?.data.id;

    if (!targetId || !this.bindings.has(targetId)) {
      return undefined;
    }

    return {
      ...withoutUndefined(this.getDefaultDisplaySetAppearance(targetId)),
      ...(this.getAppearanceState(targetId) ?? {}),
    } as TAppearance;
  }

  /**
   * Removes the overrides of a display set, all of them or the named keys,
   * so those keys are back to their defaults. The view state does not
   * change: `resetViewState` resets it. A change of a mounted display set
   * fires `DISPLAY_SET_APPEARANCE_CHANGED` once with cause `'reset'`.
   *
   * @param displaySetId - The display set; the current one when not given.
   * @param keys - The keys to reset; every key when not given.
   */
  resetDisplaySetAppearance(
    displaySetId?: DisplaySetId,
    keys?: ReadonlyArray<keyof TAppearance & string>
  ): void {
    if (this.isDestroyed) {
      return;
    }

    const targetId = displaySetId ?? this.getCurrentBinding()?.data.id;

    if (!targetId) {
      return;
    }

    const before = this.getAppearanceSnapshot(targetId);
    const next = { ...before.overrides } as Record<string, unknown>;

    for (const key of keys ?? Object.keys(next)) {
      delete next[key];
    }

    this.setAppearanceState(targetId, next as TAppearance);
    this.notifyAppearanceChangedSince(targetId, 'reset', before);
  }

  /**
   * Content-true classification of the currently bound source data.
   *
   * The duck-typing capability guards (`viewportSupportsImageSlices`,
   * `viewportSupportsVolumeId`, ...) report which methods a viewport exposes,
   * not what it is showing, so a single viewport reports support for
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
   * Whether this viewport can report fidelity (GENVIEW-FIDELITY-8). The family
   * decides: a family that can show degradable data returns true, also before
   * it mounts data, because the indicator stays hidden with no lines. The base
   * answer is false, for a family such as ECG, Video or WSI.
   */
  canReportFidelity(): boolean {
    return false;
  }

  /**
   * Absolute per-viewport fidelity record (FIDELITY-EVENT-5).
   */
  getFidelityState(): ViewportFidelityState {
    const display = this.getFidelityDisplay();

    return buildViewportFidelityState(
      this.collectFidelityLines(display),
      displaySpacingOfDisplay(display)
    );
  }

  /**
   * Fidelity lines for the built-in indicator UI.
   */
  getFidelityLines(): FidelityLine[] {
    return this.collectFidelityLines(this.getFidelityDisplay());
  }

  /**
   * Fires `VIEWPORT_FIDELITY_CHANGED` when the derived fidelity state changes
   * (FIDELITY-EVENT-2..4). Called after each draw (FIDELITY-EVENT-7). A
   * viewport that cannot report fidelity does nothing.
   *
   * @internal
   */
  notifyFidelityStateChanged(): void {
    if (!this.canReportFidelity()) {
      return;
    }

    const display = this.getFidelityDisplay();

    // Subclasses such as PlanarViewport define `suppressEvents`.
    notifyFidelityStateChanged(
      this,
      this.collectFidelityLines(display),
      displaySpacingOfDisplay(display)
    );
  }

  /**
   * Whether the view is 3D for the display spacing (FIDELITY-RECORD-2). The
   * Volume3D family overrides this; a slice family keeps `false`.
   */
  protected isFidelityView3D(): boolean {
    return false;
  }

  /**
   * The display of this viewport from the resolved view (GENVIEW-FIDELITY-3):
   * the world size of one device pixel and the view plane normal. An average
   * slab in the appearance of the source display set gives its thickness,
   * as the slab of the legacy volume viewport did.
   */
  private getFidelityDisplay(): FidelityDisplay | undefined {
    const view = this.getResolvedView();

    if (!view) {
      return undefined;
    }

    const pixelSpacing = pixelSpacingOfCanvasToWorld((canvasPos) =>
      view.canvasToWorld(canvasPos)
    );

    const camera = view.toICamera();

    // A perspective view has no single pixel size (FIDELITY-RECORD-2).
    if (!pixelSpacing || camera?.parallelProjection === false) {
      return undefined;
    }

    const sourceId = this.getSourceBinding()?.data.id;

    return {
      pixelSpacing,
      viewPlaneNormal: camera?.viewPlaneNormal,
      volume3D: this.isFidelityView3D(),
      averageSlabThickness: averageSlabThicknessOf(
        sourceId
          ? (this.getAppearanceState(sourceId) as SlabAppearance)
          : undefined
      ),
    };
  }

  /**
   * Builds fidelity lines from the typed fidelity fields that each render
   * path sets on its rendering (GENVIEW-FIDELITY-2): a record for volume
   * data, an image quality for a stack image (FIDELITY-STATE-8). It reads
   * every rendering of a binding (`getRenderings`); a hidden rendering sets
   * `excludeFromFidelity`.
   */
  protected collectFidelityLines(display?: FidelityDisplay): FidelityLine[] {
    const sources: BindingFidelitySource[] = [];

    this.forEachBinding((binding) => {
      for (const rendering of binding.getRenderings?.() ?? [
        binding.rendering,
      ]) {
        rendering.refreshFidelity?.();
        sources.push({
          record: rendering.voxelQuality,
          fullGrid: rendering.fullGrid,
          sampleDistanceLod: rendering.sampleDistanceLod,
          sampleDistanceIdle: rendering.sampleDistanceIdle,
          interactiveReduction: rendering.interactiveReduction,
          imageQualityStatus: rendering.imageQualityStatus,
          qualityPending: rendering.qualityPending,
          reductionCause: rendering.reductionCause,
          skip: rendering.excludeFromFidelity,
        });
      }
    });

    return fidelityLinesFromBindings(display, sources);
  }

  /**
   * Returns a spatial reference for the current viewport state.
   */
  getViewReference(_specifier: ViewReferenceSpecifier = {}): ViewReference {
    return {
      FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      displaySetId: this.getCurrentBinding()?.data.id,
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
   * Returns whether a spatial reference is compatible with this viewport: the
   * answer of a check of `getReferenceViewableCheck` for one reference.
   */
  isReferenceViewable(
    viewReference: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    return this.getReferenceViewableCheck()(viewReference, options);
  }

  /**
   * A check that answers `isReferenceViewable` for many references against
   * the view as it is now. It reads the reference contexts of the view (the
   * facts of the drawn image or slice) once, so that a filter of the
   * annotations of a draw does not read them for each annotation. It does
   * not follow the view: make a new one after the view changes. A viewport
   * family that decides references in its own way overrides this method,
   * and `isReferenceViewable` answers with it.
   */
  getReferenceViewableCheck(): ReferenceViewableCheck {
    const contexts = this.getReferenceViewContexts();

    return (viewReference, options = {}) =>
      isViewReferenceViewable(viewReference, contexts, options);
  }

  /**
   * Returns the frame of reference UID from the computed camera when
   * available, falling back to the current binding or a viewport-local
   * identifier (`<5.x type string>-viewport-<id>` for a built-in type, see
   * `getViewportLocalFrameOfReferenceUID`).
   */
  getFrameOfReferenceUID(): string {
    return (
      this.getResolvedView()?.getFrameOfReferenceUID() ??
      getViewportLocalFrameOfReferenceUID(this.type, this.id)
    );
  }

  /**
   * Returns the rendering engine that owns this viewport. Tools and utilities
   * rely on this method existing on every viewport (the 5.x `Viewport` class
   * provided it); without it, calls like `viewport.getRenderingEngine()` threw on a
   * `BaseViewport`.
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
   * Returns the current axis-based stretch as `[scaleX, scaleY]`. This
   * defaults to `[1, 1]`. A planar viewport overrides it with the stretch of
   * its scale pair; the other families do not stretch.
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

  /**
   * The framing of the view: zoom, pan, rotation, flips and display area
   * against the fit, which another viewport of any size can take. It is what
   * `viewportProjection.getFraming(viewport, { selector })` gives. Undefined
   * while the viewport shows nothing.
   *
   * @param selector - The keys to read; every key when not given.
   */
  getViewFraming(selector?: TFramingSelector): TFraming | undefined {
    return viewportProjection.getFraming<TFraming>(this, { selector });
  }

  /**
   * Sets the framing of the view as one change of the view state, the one
   * that `viewportProjection.withFraming(viewport, framing)` gives. Does
   * nothing while the viewport shows nothing.
   *
   * While the element has no size the framing is measured at the last size
   * that the canvas had (see `getFramingCanvasSize`), so `getViewFraming`
   * gives it back, and the viewport keeps the framing that it gives. When
   * the element gets another size, the next `resize()` sets that framing
   * again at the new size, as `setViewFraming` of the same framing does on a
   * viewport of that size. A later change of the view that is not a framing
   * written without a size drops it.
   *
   * @param framing - The keys of the framing to change.
   * @param options - The canvas point that a zoom keeps.
   */
  setViewFraming(
    framing: Partial<TFraming>,
    options?: ProjectionWriteOptions
  ): void {
    const hasSize = Boolean(this.keepCanvasSize());
    const viewState = viewportProjection.withFraming<
      Partial<TViewState>,
      TFraming
    >(this, framing, undefined, options);

    if (viewState) {
      this.setViewState(viewState);
    }

    this.pendingViewFraming = undefined;

    if (!hasSize && viewState) {
      const written = this.getViewFraming();

      this.pendingViewFraming = written && {
        framing: written,
        size: this.getFramingCanvasSize(),
      };
    }
  }

  // ====================================================================
  // Protected -- the size that the view is framed at
  // ====================================================================

  /**
   * The size of the canvas now, in CSS pixels, as the family draws on it:
   * the size of the element unless the family measures its canvas. It is 0
   * by 0 while the element is hidden or detached from the document.
   */
  protected measureCanvasSize(): CanvasSize {
    return {
      width: this.element.clientWidth,
      height: this.element.clientHeight,
    };
  }

  /**
   * Keeps the size of the canvas now as the size to frame the view at while
   * the element has none, when it has a width and a height. The viewport
   * keeps it at each read and write of its framing, at each resize and after
   * each frame.
   *
   * @returns The size, or undefined while the element has no size.
   */
  protected keepCanvasSize(): CanvasSize | undefined {
    const size = this.measureCanvasSize();

    if (!hasArea(size)) {
      return;
    }

    this.lastCanvasSize = { width: size.width, height: size.height };

    return size;
  }

  /**
   * The size, in CSS pixels, that the view is framed at: the zoom, the pan
   * and the scale of the framing, of `getZoom` and `getPan`, and of their
   * writers are measured on a canvas of this size. It is the size of the
   * canvas now when it has a width and a height. While the element has no
   * size (hidden with `display: none`, detached from the document, or of
   * zero width or height) it is the last size that the canvas had, the size
   * that the view was last drawn at, so a framing read or written then is
   * the one of that view. A viewport whose canvas never had a size gives the
   * size now.
   */
  protected getFramingCanvasSize(): CanvasSize {
    const size =
      this.keepCanvasSize() ?? this.lastCanvasSize ?? this.measureCanvasSize();

    return { width: size.width, height: size.height };
  }

  /**
   * Takes the framing that was written while the element had no size, once
   * the element has one: a family's `resize()` takes it before it changes
   * the view, and gives it to `applyPendingViewFraming` after. Undefined
   * while the element has no size or when there is none.
   */
  protected takePendingViewFraming():
    | { framing: TFraming; size: CanvasSize }
    | undefined {
    const pending = this.pendingViewFraming;

    if (!pending || !hasArea(this.measureCanvasSize())) {
      return;
    }

    this.pendingViewFraming = undefined;

    return pending;
  }

  /**
   * Sets a framing that was written while the element had no size again,
   * when the canvas has another size now than the one it was measured at.
   *
   * @param pending - What `takePendingViewFraming` gave.
   */
  protected applyPendingViewFraming(
    pending: { framing: TFraming; size: CanvasSize } | undefined
  ): void {
    const size = this.keepCanvasSize();

    if (!pending || !size || isSameSize(size, pending.size)) {
      return;
    }

    this.setViewFraming(pending.framing);
  }

  // ====================================================================
  // Public API -- lifecycle
  // ====================================================================

  /**
   * Does nothing: only a viewport with a vtk.js renderer keeps widgets, which
   * are the planar and the 3D viewport. The rendering engine calls it for
   * every viewport that it disables.
   */
  removeWidgets(): void {}

  /** The options that the viewport was made with. They do not change. */
  readonly defaultOptions: BaseViewportOptions;

  /**
   * True once `destroy` ran. The rendering engine destroys a viewport when it
   * disables its element. Read only: only `destroy` sets it.
   */
  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Releases mounted bindings and viewport-local resources.
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.destroyed = true;
    this.destroyBindings();
    this.onDestroy();
    this.bindings.clear();
    this.displaySetAppearances.clear();
    this.defaultDisplaySetAppearances.clear();

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
   * Called by rendering engines after a frame is rendered. The viewport
   * keeps the size of its canvas, see `keepCanvasSize`, and a framing written
   * while the element had no size, that the frame showed at the size it was
   * measured at, is not set again at the next resize.
   *
   * Most BaseViewport families do not need to track this separately because
   * their render paths own concrete runtime state.
   */
  setRendered(): void {
    const size = this.keepCanvasSize();
    const pending = this.pendingViewFraming;

    if (pending && size && isSameSize(size, pending.size)) {
      this.pendingViewFraming = undefined;
    }

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
   * A framing written while the element had no size is set again at the new
   * size, see `setViewFraming`.
   */
  resize(): void {
    if (this.isDestroyed) {
      return;
    }

    const pending = this.takePendingViewFraming();

    this.resizeBindings();
    this.modified();
    this.applyPendingViewFraming(pending);
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
   * These viewports own semantic view state, so the rendering engine delegates
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
  // Protected -- data loading & appearance
  // ====================================================================

  /**
   * Converts loaded logical data into a mounted rendering binding.
   *
   * The binding stores render-path callbacks so future per-dataset render
   * state, camera, transform, resize, and render requests can be routed back
   * to the correct render-path runtime.
   *
   * The render path gets `signal`: when it aborts (a newer `setDisplaySets`
   * superseded the call) while the path waits for its data, the path stops,
   * removes what it added, and this gives false.
   */
  protected async addLoadedData(
    displaySetId: DisplaySetId,
    data: LoadedData,
    options: DataAddOptions,
    shouldIgnore?: () => boolean,
    signal?: AbortSignal
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

    // Stage the replacement attachment before tearing down any existing one:
    // if addData rejects, or the request goes stale mid-await, the previous
    // render path stays mounted and the binding record stays accurate. A
    // teardown-first order left a dead binding whose recorded renderMode made
    // a later remount (e.g. switching the render backend back after a failed
    // swap) skip as a no-op, blanking the display set.
    let attachment: RenderPathAttachment;

    try {
      attachment = await renderPath.addData(ctx, data, options, signal);
    } catch (error) {
      if (signal?.aborted) {
        return false;
      }

      throw error;
    }

    if (shouldIgnore?.()) {
      attachment.removeData();
      return false;
    }

    if (this.isDestroyed) {
      attachment.removeData();
      throw new Error('Viewport has been destroyed');
    }

    // Whatever is bound now -- the attachment this call is replacing, or one
    // a concurrent mount installed during the await -- is superseded by the
    // staged attachment.
    const current = this.bindings.get(displaySetId);

    if (current) {
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

    const props = this.getAppliedAppearance(displaySetId);
    if (props !== undefined) {
      binding.updateAppearance(props);
    }

    binding.applyViewState(this.viewState);
    this._debug.renderModes[displaySetId] = attachment.rendering.renderMode;
    this.viewportStatus = ViewportStatus.PRE_RENDER;
    this.render();

    return true;
  }

  protected removeAllData(): void {
    for (const displaySetId of Array.from(this.bindings.keys())) {
      this.removeDisplaySetBinding(displaySetId);
    }
  }

  /**
   * Starts a `setDisplaySets` call. The function that it gives tells whether
   * a newer `setDisplaySets` started since: the call is then superseded, it
   * stops, and it fires no DISPLAY_SETS_CHANGED. The signal of the call
   * (`getSetDisplaySetsSignal`) aborts at that moment.
   */
  protected startSetDisplaySets(): () => boolean {
    const callId = ++this.setDisplaySetsCallId;

    this.setDisplaySetsAbort?.abort();
    this.setDisplaySetsAbort = new AbortController();

    return () => callId !== this.setDisplaySetsCallId;
  }

  /**
   * The signal of the newest `setDisplaySets` call, which aborts when a newer
   * call starts. Read it just after `startSetDisplaySets`.
   */
  protected getSetDisplaySetsSignal(): AbortSignal | undefined {
    return this.setDisplaySetsAbort?.signal;
  }

  /**
   * The display sets that the viewport shows, as `getDisplaySets` gives
   * them, each with its role, and the one whose role is `source`. A viewport
   * that shows only overlays has no source.
   */
  private getMountedDisplaySets(): {
    displaySets: EventTypes.DisplaySetsChangedEntry[];
    sourceDisplaySetId?: DisplaySetId;
  } {
    const displaySets = Array.from(this.bindings.entries()).map(
      ([displaySetId, binding]) => ({ displaySetId, role: binding.role })
    );

    return {
      displaySets,
      sourceDisplaySetId: displaySets.find(({ role }) => role === 'source')
        ?.displaySetId,
    };
  }

  /**
   * Fires DISPLAY_SETS_CHANGED for a committed `setDisplaySets`,
   * `addDisplaySet` or `removeDisplaySet`, once the getters of the viewport
   * answer for the new display sets, unless the viewport was made with
   * `suppressEvents`. `mountedDisplaySetIds` are the display sets that the
   * call mounted; the removed ones and `sourceChanged` come from the
   * display sets of the last event.
   */
  protected triggerDisplaySetsChanged(
    mountedDisplaySetIds: DisplaySetId[]
  ): void {
    if (this.isDestroyed) {
      return;
    }

    const { displaySets, sourceDisplaySetId } = this.getMountedDisplaySets();
    const displaySetIds = displaySets.map(({ displaySetId }) => displaySetId);
    const previous = this.notifiedDisplaySets;
    const added = displaySetIds.filter(
      (displaySetId) =>
        mountedDisplaySetIds.includes(displaySetId) ||
        !previous.displaySetIds.includes(displaySetId)
    );
    const removed = previous.displaySetIds.filter(
      (displaySetId) => !displaySetIds.includes(displaySetId)
    );
    const sourceChanged =
      sourceDisplaySetId !== previous.sourceDisplaySetId ||
      (sourceDisplaySetId !== undefined && added.includes(sourceDisplaySetId));

    this.notifiedDisplaySets = { displaySetIds, sourceDisplaySetId };

    if (this.defaultOptions.suppressEvents) {
      return;
    }

    const eventDetail: EventTypes.DisplaySetsChangedEventDetail = {
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      displaySets,
      sourceDisplaySetId,
      added,
      removed,
      sourceChanged,
    };

    triggerEvent(this.element, Events.DISPLAY_SETS_CHANGED, eventDetail);
  }

  /**
   * Stores the overrides of a display set and gives the binding, when the
   * display set is mounted, the overrides over the defaults of the family.
   */
  protected setAppearanceState(
    displaySetId: DisplaySetId,
    props: TAppearance
  ): void {
    if (this.isDestroyed) {
      return;
    }

    this.displaySetAppearances.set(displaySetId, props);
    const binding = this.bindings.get(displaySetId);

    if (!binding) {
      return;
    }

    binding.updateAppearance(this.getAppliedAppearance(displaySetId));
    this.render();
  }

  /**
   * Returns the overrides stored for a display set, even if that display set
   * is not currently mounted.
   */
  protected getAppearanceState(
    displaySetId: DisplaySetId
  ): TAppearance | undefined {
    return this.displaySetAppearances.get(displaySetId);
  }

  /**
   * What a binding draws with: the overrides over the defaults of the
   * family. Undefined when the display set has neither.
   */
  protected getAppliedAppearance(
    displaySetId: DisplaySetId
  ): TAppearance | undefined {
    const defaults = this.defaultDisplaySetAppearances.get(displaySetId);
    const overrides = this.getAppearanceState(displaySetId);

    if (defaults === undefined && overrides === undefined) {
      return undefined;
    }

    return { ...(defaults ?? {}), ...(overrides ?? {}) } as TAppearance;
  }

  /**
   * Stores defaults of the family for a display set, as `visible: true`.
   * They are not overrides: the getter of the overrides leaves them out, a
   * reset keeps them, and an override of the same key wins over them. The
   * binding gets them at once when the display set is mounted. Fires
   * nothing: {@link applyMountedAppearance} fires the event of the mount.
   */
  protected setDefaultAppearance(
    displaySetId: DisplaySetId,
    defaults: Partial<TAppearance>
  ): void {
    this.defaultDisplaySetAppearances.set(displaySetId, {
      ...(this.defaultDisplaySetAppearances.get(displaySetId) ?? {}),
      ...defaults,
    } as TAppearance);

    if (this.bindings.has(displaySetId)) {
      this.setAppearanceState(
        displaySetId,
        (this.getAppearanceState(displaySetId) ?? {}) as TAppearance
      );
    }
  }

  /**
   * The defaults that the effective appearance of a mounted display set
   * shows under its overrides: those of the family that the mount stored.
   * A family adds the defaults of its data, as the default window of the
   * image on display.
   */
  protected getDefaultDisplaySetAppearance(
    displaySetId: DisplaySetId
  ): Partial<TAppearance> {
    return { ...(this.defaultDisplaySetAppearances.get(displaySetId) ?? {}) };
  }

  /**
   * Stores, before the bind of a mount, the appearance that the binding
   * draws with from its first draw: the defaults of the family, and the
   * overrides of the mount option `appearance` merged over the overrides
   * stored before (a `colormap` one level deep, as `setDisplaySetAppearance`
   * merges it). It forwards nothing and fires nothing: the bind gives the
   * binding the whole appearance at once, so the mount draws once, and
   * {@link applyMountedAppearance} fires the event of the mount. Gives a
   * function that puts back what was stored before, for a mount that does
   * not bind; it leaves an entry that a newer mount staged since.
   *
   * @param displaySetId - The display set that is mounted.
   * @param defaults - The defaults of the family, as `visible: true`.
   * @param appearance - The mount option `appearance`.
   * @returns A function that undoes the staging.
   */
  protected stageMountedAppearance(
    displaySetId: DisplaySetId,
    defaults: Partial<TAppearance>,
    appearance?: Partial<TAppearance>
  ): () => void {
    const previousDefaults =
      this.defaultDisplaySetAppearances.get(displaySetId);
    const previousOverrides = this.displaySetAppearances.get(displaySetId);

    this.defaultDisplaySetAppearances.set(displaySetId, {
      ...(previousDefaults ?? {}),
      ...defaults,
    } as TAppearance);

    if (appearance) {
      const overrides = { ...(previousOverrides ?? {}) } as Record<
        string,
        unknown
      >;

      this.displaySetAppearances.set(
        displaySetId,
        withoutUndefined({
          ...overrides,
          ...appearance,
          ...mergedColormapOf(overrides, appearance),
        }) as TAppearance
      );
    }

    const stagedDefaults = this.defaultDisplaySetAppearances.get(displaySetId);
    const stagedOverrides = this.displaySetAppearances.get(displaySetId);

    return () => {
      restoreStagedMapEntry(
        this.defaultDisplaySetAppearances,
        displaySetId,
        stagedDefaults,
        previousDefaults
      );
      restoreStagedMapEntry(
        this.displaySetAppearances,
        displaySetId,
        stagedOverrides,
        previousOverrides
      );
    };
  }

  /**
   * The one entry point of the appearance event of a mount. Every family
   * calls it once when a display set is mounted, after the display set is
   * bound: it fires `DISPLAY_SET_APPEARANCE_CHANGED` once with cause
   * `'mount'` and every key that has an effective value. The overrides of
   * the mount option `appearance` are in place before the bind
   * ({@link stageMountedAppearance}), so the first draw has them and the
   * event names them.
   *
   * @param displaySetId - The display set that was mounted.
   */
  protected applyMountedAppearance(displaySetId: DisplaySetId): void {
    const effective = this.getEffectiveDisplaySetAppearance(displaySetId);

    if (!effective) {
      return;
    }

    this.notifyAppearanceChanged(
      displaySetId,
      'mount',
      Object.keys(effective) as Array<keyof TAppearance & string>
    );
  }

  /**
   * Merges overrides into the stored overrides of a display set, removes
   * the keys given as `undefined`, forwards the result when mounted, and
   * fires `DISPLAY_SET_APPEARANCE_CHANGED` with cause `'edit'` when a key
   * changed. A `colormap` is merged one level deep (`mergedColormapOf`).
   */
  protected mergeAppearance(
    displaySetId: DisplaySetId,
    props: Partial<TAppearance>
  ): TAppearance {
    const before = this.getAppearanceSnapshot(displaySetId);
    const nextAppearance = withoutUndefined({
      ...before.overrides,
      ...props,
      ...mergedColormapOf(before.overrides, props),
    }) as TAppearance;

    this.setAppearanceState(displaySetId, nextAppearance);
    this.notifyAppearanceChangedSince(displaySetId, 'edit', before);

    return nextAppearance;
  }

  /**
   * The overrides and the effective appearance of a display set now, to
   * find the keys that a change changes.
   */
  protected getAppearanceSnapshot(
    displaySetId: DisplaySetId
  ): AppearanceSnapshot {
    return {
      overrides: { ...(this.getAppearanceState(displaySetId) ?? {}) },
      effective: {
        ...(this.getEffectiveDisplaySetAppearance(displaySetId) ?? {}),
      },
    };
  }

  /**
   * Fires `DISPLAY_SET_APPEARANCE_CHANGED` for the keys whose override or
   * effective value differs from `before`, and nothing when none does.
   */
  protected notifyAppearanceChangedSince(
    displaySetId: DisplaySetId,
    cause: EventTypes.DisplaySetAppearanceChangeCause,
    before: AppearanceSnapshot
  ): void {
    const after = this.getAppearanceSnapshot(displaySetId);
    const keys = new Set([
      ...Object.keys(before.overrides),
      ...Object.keys(after.overrides),
      ...Object.keys(before.effective),
      ...Object.keys(after.effective),
    ]);
    const changedKeys = Array.from(keys).filter(
      (key) =>
        key in before.overrides !== key in after.overrides ||
        !deepEqual(before.overrides[key], after.overrides[key]) ||
        !deepEqual(before.effective[key], after.effective[key])
    ) as Array<keyof TAppearance & string>;

    if (changedKeys.length) {
      this.notifyAppearanceChanged(displaySetId, cause, changedKeys);
    }
  }

  /**
   * Fires `DISPLAY_SET_APPEARANCE_CHANGED` on the element once, with the
   * overrides and the effective appearance of the display set now. Nothing
   * fires for a display set that is not mounted, for a layer that
   * {@link firesAppearanceEvents} keeps silent, or with `suppressEvents`.
   */
  protected notifyAppearanceChanged(
    displaySetId: DisplaySetId,
    cause: EventTypes.DisplaySetAppearanceChangeCause,
    changedKeys: Array<keyof TAppearance & string>
  ): void {
    const binding = this.bindings.get(displaySetId);
    const effective = this.getEffectiveDisplaySetAppearance(displaySetId);

    if (
      !binding ||
      !effective ||
      this.defaultOptions.suppressEvents ||
      !this.firesAppearanceEvents(displaySetId)
    ) {
      return;
    }

    const detail: EventTypes.DisplaySetAppearanceChangedEventDetail<
      TAppearance & object
    > = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      displaySetId,
      role: binding.role,
      volumeId: this.getAppearanceEventVolumeId(displaySetId),
      cause,
      changedKeys,
      overrides: { ...(this.getAppearanceState(displaySetId) ?? {}) },
      effective: effective as TAppearance & object,
    };

    triggerEvent(this.element, Events.DISPLAY_SET_APPEARANCE_CHANGED, detail);
  }

  /**
   * Whether a change of the appearance of a display set fires
   * `DISPLAY_SET_APPEARANCE_CHANGED`. True in the base class; a family keeps
   * the layers of a segmentation silent.
   */
  protected firesAppearanceEvents(_displaySetId: DisplaySetId): boolean {
    return true;
  }

  /**
   * The volume that the appearance event of a display set names: the
   * volume that its binding draws, when it draws one.
   */
  protected getAppearanceEventVolumeId(
    displaySetId: DisplaySetId
  ): string | undefined {
    return (
      this.bindings.get(displaySetId)?.data as { volumeId?: string } | undefined
    )?.volumeId;
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
   * Fires a {@link Events.CAMERA_MODIFIED} event on the viewport element,
   * unless the viewport was made with the `suppressEvents` option. The view
   * changed, so a framing written while the element had no size is not set
   * again at the next resize.
   */
  protected triggerCameraModifiedEvent(previousCamera: ICamera): void {
    this.pendingViewFraming = undefined;

    if (this.defaultOptions.suppressEvents) {
      return;
    }

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
   * Fires a {@link Events.CAMERA_RESET} event on the viewport element,
   * unless the viewport was made with the `suppressEvents` option.
   */
  protected triggerCameraResetEvent(): void {
    if (this.defaultOptions.suppressEvents) {
      return;
    }

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
  ): ViewportDataBinding<TAppearance> | undefined {
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
  protected getFirstBinding(): ViewportDataBinding<TAppearance> | undefined {
    return this.bindings.values().next().value;
  }

  /**
   * Returns the active source binding (the dataset that defines the view),
   * falling back to the first mounted binding when no explicit `source` role is
   * present. Used for content-mode classification and source-scoped queries.
   */
  protected getSourceBinding(): ViewportDataBinding<TAppearance> | undefined {
    for (const binding of this.bindings.values()) {
      if (binding.role === 'source') {
        return binding;
      }
    }
    return this.getFirstBinding();
  }

  /**
   * The display set that the viewport is about, which the calls without a
   * display set id follow (the appearance, the image, the frame of
   * reference, the view reference): the source, else the first display set
   * of a viewport that shows overlays only. A family overrides it where it
   * keeps the source itself.
   */
  protected getCurrentBinding(): ViewportDataBinding<TAppearance> | undefined {
    return this.getSourceBinding();
  }

  /**
   * Iterates mounted bindings without exposing the underlying map to
   * subclasses.
   */
  protected forEachBinding(
    visitor: (binding: ViewportDataBinding<TAppearance>) => void
  ): void {
    for (const binding of this.bindings.values()) {
      visitor(binding);
    }
  }

  /**
   * Returns generic reference-compatibility contexts for mounted datasets.
   * Subclasses can add image, volume, slice, plane, and dimension facts.
   */
  protected getReferenceViewContexts(): ViewReferenceContext[] {
    const contexts: ViewReferenceContext[] = [];
    const resolvedView = this.getResolvedView();
    const camera = resolvedView?.toICamera();

    for (const [displaySetId, binding] of this.bindings.entries()) {
      contexts.push({
        displaySetId,
        displaySetIds: [binding.data.id],
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
    for (const displaySetId of Array.from(this.bindings.keys())) {
      this.removeDisplaySetBinding(displaySetId);
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

export default BaseViewport;
