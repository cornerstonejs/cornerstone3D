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
}
