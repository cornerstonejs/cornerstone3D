import type { NaturalizedInstance, ViewportTypeHint } from './types';

/**
 * Framework-agnostic display set metadata stored in the Cornerstone metadata cache.
 *
 * `IDisplaySet` declares the **common attributes** read from a display set,
 * matching the OHIF display set shape. They are plain data attributes — not
 * accessor methods — so a display set behaves like a data object that can be
 * destructured, spread, and serialized.
 *
 * Attributes that are shared across different display-set uses belong here, even
 * when only some display-set types populate them (they are declared optional).
 * Split rules produce many of these via their `customAttributes` callback; the
 * values are spread flat onto the display set in `createDisplaySetFromGroup`.
 *
 * ## Adding new attributes
 *
 * - Shared / common attributes: add them to this interface (optional unless every
 *   display set sets them).
 * - App- or extension-specific attributes that are not part of the common model:
 *   declare them with TypeScript module augmentation so they stay type-checked
 *   without widening this shared surface:
 *
 *   ```ts
 *   // my-extension.ts
 *   import '@cornerstonejs/metadata';
 *
 *   declare module '@cornerstonejs/metadata' {
 *     interface IDisplaySet {
 *       myAppSpecificAttribute?: string;
 *     }
 *   }
 *   ```
 */
export interface IDisplaySet {
  /** Unique identifier for this display set. */
  displaySetId: string;
  /**
   * Allowed viewport types for this display set.
   * `viewportTypes[0]` is the preferred viewport type.
   */
  viewportTypes: readonly ViewportTypeHint[];
  /** Preferred viewport type (equivalent to `viewportTypes[0]`). */
  preferredViewportType: ViewportTypeHint;
  /**
   * Whether this display set can be shown on a viewport.
   *
   * Derived from `viewportTypes` (false exactly when they contain
   * `NO_VIEWPORT_TYPE`), and a plain field rather than a getter so it survives
   * spreading and serialization like every other attribute here.
   *
   * `false` means the split rules produced a display set for an object nothing
   * knows how to render - a SEG, RTSTRUCT, SR, presentation state, and anything
   * else claimed by the catch-all `unsupported` rule. The display set exists so
   * the object is visible to the application (a study browser can list the
   * series and explain why it is not viewable) instead of being silently
   * dropped, but it must not be mounted on a viewport: `imageIds` is empty for
   * these, so treating one as renderable yields nothing rather than something
   * broken.
   *
   * An application that *does* support such an object adds its own split rule
   * ahead of the catch-all, with real `viewportTypes`.
   */
  isDisplayable: boolean;
  /** Naturalized instances grouped into this display set, in input order. */
  instances: readonly NaturalizedInstance[];
  /** Frame-level, renderable image ids for this display set. */
  imageIds: readonly string[];
  /** Underlying (SOP-level) image ids, one per instance. */
  underlyingImageIds: readonly string[];

  // ── Shared attributes (populated by split rules / specific types) ──────────

  /** True when this display set is a multi-frame (clip) image stack. */
  isMultiFrame?: boolean;
  /** True for multi-frame clip display sets (OHIF parity). */
  isClip?: boolean;
  /** Number of image frames for a clip / multi-frame display set. */
  numImageFrames?: number;
  /** 0-based index of this display set among the series' split groups. */
  splitNumber?: number;
  /**
   * The distinct SOP Class UIDs of this display set's instances. Populated by the
   * catch-all `unsupported` rule so a consumer can tell *what* it could not
   * render (a SEG from an SR) rather than only that it could not.
   */
  sopClassUids?: readonly string[];
}
