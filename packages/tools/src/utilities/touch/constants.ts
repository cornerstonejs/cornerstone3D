/**
 * Tuning values shared by the touch event listeners, the store filters that
 * hit-test annotations, and the tools that need to reason about the tap
 * pipeline's timing.
 *
 * This module is intentionally dependency-free: it is imported by low-level
 * infrastructure (`eventListeners/touch`, `store/filter*`) as well as by
 * `BaseTool`, which re-exposes these as static members so tool authors can
 * reach them as `BaseTool.TOUCH_PROXIMITY` without importing internals.
 * Change a value here and every consumer follows.
 */

/**
 * Canvas-pixel radius used to hit-test annotations and handles for touch
 * interactions. A fingertip covers far more screen than a cursor hotspot, so
 * touch gets a much larger target than {@link MOUSE_PROXIMITY}.
 */
export const TOUCH_PROXIMITY = 36;

/**
 * Canvas-pixel radius used to hit-test annotations and handles for mouse
 * interactions.
 */
export const MOUSE_PROXIMITY = 6;

/**
 * Maximum canvas-pixel distance a gesture may travel from its start and still
 * be counted as a tap by the touch start listener. A gesture that travels
 * further never emits its own TOUCH_TAP, but one that *ends* within this
 * distance of an active tap chain's anchor is still folded into that chain's
 * aggregated TOUCH_TAP.
 */
export const TOUCH_TAP_MAX_CANVAS_DISTANCE = 24;

/**
 * Window in milliseconds within which successive taps are aggregated into a
 * single multi-tap TOUCH_TAP. TOUCH_TAP is emitted one tolerance after the
 * last touchend of a chain, which is why tools that commit a gesture on
 * TOUCH_END have to recognize and drop the trailing tap echo.
 */
export const TOUCH_TAP_TOLERANCE_MS = 300;
