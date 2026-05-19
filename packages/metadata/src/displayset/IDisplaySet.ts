import type { ViewportTypeHint } from './types';

/**
 * Framework-agnostic display set metadata stored in the Cornerstone metadata cache.
 */
export interface IDisplaySet {
  displaySetInstanceUID: string;
  /**
   * Allowed viewport types for this display set.
   * `viewportTypes[0]` is the preferred viewport type.
   */
  viewportTypes: readonly ViewportTypeHint[];
  getFrameImageIds(): ReadonlySet<string>;
  getUnderlyingImageIds(): ReadonlySet<string>;
  getPreferredViewportType(): ViewportTypeHint;
}
