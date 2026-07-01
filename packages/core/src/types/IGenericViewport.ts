import type { IViewport, ViewReference } from './IViewport';
import type ICamera from './ICamera';
import type ResolvedViewportView from '../RenderingEngine/GenericViewport/ResolvedViewportView';

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
 * Public surface of a direct Generic ("next") viewport
 * (`PLANAR_NEXT`, `VOLUME_3D_NEXT`, `VIDEO_NEXT`, `ECG_NEXT`,
 * `WHOLE_SLIDE_NEXT`).
 *
 * This is the type to narrow to (via `isGenericViewport`) when application code
 * needs the native data, presentation, and view-state APIs rather than the
 * legacy stack/volume method surface. Signatures are intentionally permissive
 * (`unknown`) because the concrete view-state and data-presentation shapes are
 * viewport-family specific; use `getViewState`/`getDisplaySetPresentation`
 * generics on the concrete class when the family is known.
 */
export interface IGenericViewport extends IViewport {
  setDisplaySets(
    ...entries: Array<{ displaySetId: string; options?: unknown }>
  ): Promise<void>;
  addDisplaySet(displaySetId: string, options: unknown): Promise<void>;
  removeData(displaySetId: string): void;
  setDisplaySetPresentation(props: unknown): void;
  /**
   * Overload targeting a specific bound dataId (multi-volume / fusion); the
   * single-argument form targets the viewport's default binding.
   */
  setDisplaySetPresentation(dataId: string, props: unknown): void;
  getDisplaySetPresentation(displaySetId: string): unknown;
  setViewState(viewStatePatch: unknown): void;
  getViewState(): unknown;
  updateViewState(updater: unknown): void;
  resetViewState(options?: unknown): boolean;
  /** Content-true classification of the bound source data; see {@link ViewportContentMode}. */
  getCurrentMode(): ViewportContentMode;
  /**
   * Applies a spatial reference (frame of reference + plane) to the current view
   * state. Implemented across all Generic families via the base GenericViewport.
   */
  setViewReference(viewReference: ViewReference): void;
  /**
   * The resolved semantic view (camera + spatial basis) the viewport derives
   * from its bound data and view state. Native viewports have no legacy
   * `getCamera()`; callers bridge through this (see `getViewportICamera`).
   */
  getResolvedView():
    | ResolvedViewportView<unknown, ICamera<unknown>>
    | undefined;
  /**
   * Resolves the currently referenced image id from the active view state, when
   * the bound source data can be expressed as an image id (stack / vtkImage
   * content and axially aligned volume slices). Returns `undefined` for content
   * with no single source image (e.g. oblique/orthogonal volume reslices).
   */
  getCurrentImageId(): string | undefined;
}

export type { IGenericViewport as default };
