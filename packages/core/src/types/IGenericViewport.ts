import type {
  ReferenceCompatibleOptions,
  RenderingEngineResizeOptions,
  ViewReference,
  ViewReferenceSpecifier,
} from './IViewport';
import type ICamera from './ICamera';
import type IRenderingEngine from './IRenderingEngine';
import type Point2 from './Point2';
import type Point3 from './Point3';
import type { ViewportFidelityState } from './ViewportFidelity';
import type ViewportStatus from '../enums/ViewportStatus';
import type ViewportType from '../enums/ViewportType';
import type { GenericViewportOptions } from '../RenderingEngine/GenericViewport/GenericViewport';
import type ResolvedViewportView from '../RenderingEngine/GenericViewport/ResolvedViewportView';
import type { FidelityLine } from '../RenderingEngine/helpers/fidelityIndicator/fidelityIndicatorState';

/**
 * The content a Generic ("next") viewport is currently rendering.
 *
 * Unlike the legacy model, a `PLANAR_NEXT` viewport's content shape (stack vs
 * volume) is decided by the data it is bound to, not by its viewport type. The
 * duck-typing capability guards (`viewportSupportsImageSlices`,
 * `viewportSupportsVolumeId`, ...) only report which methods a viewport
 * exposes, so a single `PlanarViewport` reports support for both stack and
 * volume operations regardless of what it is actually showing.
 *
 * `getCurrentMode()` answers the content question that the capability guards
 * cannot: it reflects the currently bound source data.
 *
 * - `stack`      — image-id stack content (image render path)
 * - `volume`     — volume-backed slice content (volume slice render path)
 * - `volume3d`   — 3D volume rendering
 * - `video`      — video frames
 * - `wholeSlide` — whole-slide tiles
 * - `ecg`        — ECG waveform
 * - `empty`      — no source data is bound yet
 * - `unknown`    — a viewport family that does not classify its content
 */
export type ViewportContentMode =
  | 'stack'
  | 'volume'
  | 'volume3d'
  | 'video'
  | 'wholeSlide'
  | 'ecg'
  | 'empty'
  | 'unknown';

/**
 * The interface of a next viewport: the public members that every next
 * family has (`PLANAR_NEXT`, `VOLUME_3D_NEXT`, `VIDEO_NEXT`, `ECG_NEXT`,
 * `WHOLE_SLIDE_NEXT`), which are those of the base class `GenericViewport`.
 *
 * It does not describe a legacy viewport and has no legacy member. Type a
 * value that can be either as `IViewport | IGenericViewport` and narrow it
 * with `utilities.isGenericViewport`. The class of a family has more members
 * (`PlanarViewport`, `GenericVolumeViewport3D`, `VideoGenericViewport`,
 * `WSIGenericViewport`, `ECGGenericViewport`): type the variable with the
 * class when the family is known.
 *
 * @typeParam TViewState - The view state of the family. The bare name takes
 * any object.
 * @typeParam TDataPresentation - The presentation of a display set of the
 * family.
 */
export interface IGenericViewport<
  TViewState extends object = object,
  TDataPresentation = unknown,
> {
  /** The id of the viewport in its rendering engine. */
  readonly id: string;
  /** The element that the viewport draws in. */
  readonly element: HTMLDivElement;
  /** The type that the viewport was enabled with. */
  readonly type: ViewportType;
  /** The id of the rendering engine that owns the viewport. */
  readonly renderingEngineId: string;
  /** Whether the viewport has data, waits for a draw or is drawn. */
  viewportStatus: ViewportStatus;
  /** The options that the viewport was made with. They do not change. */
  readonly defaultOptions: GenericViewportOptions;
  /**
   * True once the viewport is destroyed, which the rendering engine does when
   * it disables the element. Read only.
   */
  readonly isDestroyed: boolean;

  /**
   * Replaces the mounted display sets. The first entry is the source, the
   * others are overlays unless their options say otherwise.
   */
  setDisplaySets(
    ...entries: Array<{ displaySetId: string; options?: unknown }>
  ): Promise<void>;
  /**
   * Mounts one more display set. The options are those of the family, as in
   * `setDisplaySets`: `PlanarSetDataOptions` on a planar viewport, a render
   * mode and a role on the base class.
   */
  addDisplaySet(displaySetId: string, options: unknown): Promise<void>;
  /** The mounted display sets, the source first. */
  getDisplaySets(): Array<{ displaySetId: string; options?: unknown }>;
  /** Removes a display set and its presentation, and draws again. */
  removeData(displaySetId: string): void;
  /** Changes the presentation of the source display set. */
  setDisplaySetPresentation(props: Partial<TDataPresentation>): void;
  /** Changes the presentation of one display set, for overlays and fusion. */
  setDisplaySetPresentation(
    displaySetId: string,
    props: Partial<TDataPresentation>
  ): void;
  /** The presentation of one display set, or undefined when it is not mounted. */
  getDisplaySetPresentation(
    displaySetId: string
  ): TDataPresentation | undefined;
  /** What the viewport shows now. See {@link ViewportContentMode}. */
  getCurrentMode(): ViewportContentMode;

  /** Merges a patch into the view state and draws again. */
  setViewState(viewStatePatch: Partial<TViewState>): void;
  /** The view state. */
  getViewState(): TViewState;
  /** Changes the view state with a patch, or with a function that returns one. */
  updateViewState(
    updater:
      | Partial<TViewState>
      | ((viewState: TViewState) => Partial<TViewState> | void)
  ): void;
  /** Resets the navigation. False when the family has nothing to reset. */
  resetViewState(options?: unknown): boolean;

  /** A reference to what the viewport shows now. */
  getViewReference(specifier?: ViewReferenceSpecifier): ViewReference;
  /** A string that names the view reference. */
  getViewReferenceId(specifier?: ViewReferenceSpecifier): string;
  /** Shows what a reference points to. */
  setViewReference(viewReference: ViewReference): void;
  /** Whether the viewport can show what a reference points to. */
  isReferenceViewable(
    viewReference: ViewReference,
    options?: ReferenceCompatibleOptions
  ): boolean;
  /** The frame of reference of the view, or an id of the viewport itself. */
  getFrameOfReferenceUID(): string;

  /**
   * The resolved view that the viewport derives from its data and its view
   * state: the coordinate transforms and, through `toICamera()`, a camera for
   * reading. Undefined while no data is mounted.
   */
  getResolvedView():
    | ResolvedViewportView<unknown, ICamera<unknown>>
    | undefined;
  /** A canvas point in world coordinates. It throws while no data is mounted. */
  canvasToWorld(canvasPos: Point2): Point3;
  /** A world point in canvas coordinates. It throws while no data is mounted. */
  worldToCanvas(worldPos: Point3): Point2;
  /** The stretch of the axes of the base class: `[1, 1]`. */
  getAspectRatio(): Point2;

  /** The rendering engine that owns the viewport. */
  getRenderingEngine(): IRenderingEngine;
  /** Draws the viewport. */
  render(): void;
  /** Called by the rendering engine after it drew a frame. */
  setRendered(): void;
  /** Marks the viewport as waiting for a draw, without asking for one. */
  setNeedsRender(): void;
  /** Chooses the render paths again after the render backend changed. */
  updateRenderingPipeline(): void;
  /** Takes the new size of the element. */
  resize(): void;
  /** The resize that the rendering engine calls. */
  resizeForRenderingEngine(options?: RenderingEngineResizeOptions): void;
  /** Does nothing on a family without vtk.js widgets. */
  removeWidgets(): void;
  /** Releases the display sets and the resources of the viewport. */
  destroy(): void;
  /** The same as `destroy`. */
  dispose(): void;

  /** Whether the viewport can report fidelity. */
  canReportFidelity(): boolean;
  /** The fidelity record of the viewport. */
  getFidelityState(): ViewportFidelityState;
  /** The fidelity lines for the built-in indicator. */
  getFidelityLines(): FidelityLine[];
  /**
   * Fires `VIEWPORT_FIDELITY_CHANGED` when the fidelity state changed.
   *
   * @internal
   */
  notifyFidelityStateChanged(): void;
}

export type { IGenericViewport as default };
