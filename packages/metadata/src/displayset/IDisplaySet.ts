import type { NaturalizedInstance, ViewportTypeHint } from './types';

/**
 * Framework-agnostic display set metadata stored in the Cornerstone metadata cache.
 *
 * `IDisplaySet` declares the **common attributes** of a display set, in the
 * OHIF display set shape. They are plain data attributes, not accessor
 * methods, so a display set can be destructured, spread, and serialized.
 * Split rules make many of them through `customAttributes`, and
 * `createDisplaySetFromGroup` spreads the values flat onto the display set.
 *
 * Add a shared attribute here, optional unless every display set sets it. Add
 * an app-specific attribute with TypeScript module augmentation. See "Adding
 * new display set attributes" in
 * `packages/docs/docs/concepts/cornerstone-metadata/display-sets.md`.
 */
export interface IDisplaySet {
  /**
   * Identifier of this display set within one split. It holds the position of
   * the group (`splitNumber`), so it can change when a series gets a new group.
   * Use {@link IDisplaySet.splitKey} as a stable identity.
   */
  displaySetId: string;
  /**
   * The split key of the group that made this display set: the rule id and the
   * `groupBy` values, as JSON. It holds no position, so it is the stable
   * identity of the display set, for a server index or a saved layout. A
   * consumer that needs a short value can hash it.
   */
  splitKey?: string;
  /** The id of the split rule that made this display set. */
  splitRuleId?: string;
  /**
   * The group of related rules that made this display set: the `groupId` of
   * the rule, else the rule id. A hanging protocol can match it.
   */
  splitGroupId?: string;
  /**
   * The generic handler name of the rule that made this display set, for
   * example `segmentation` (see `DISPLAY_SET_HANDLER_NAMES`). Absent when the
   * rule names no handler.
   */
  handler?: string;
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
