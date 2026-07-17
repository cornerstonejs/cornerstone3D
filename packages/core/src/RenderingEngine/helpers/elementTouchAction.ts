const PRIOR_TOUCH_ACTION_ATTRIBUTE = 'data-prior-touch-action';

/**
 * Sets `touch-action: none` on an enabled viewport element so the browser
 * does not consume touch input (scrolling, pinch-zoom, double-tap zoom)
 * before cornerstone tools receive the events. The prior inline value is
 * stored on the element so disable can restore it.
 */
export function setElementTouchActionNone(element: HTMLDivElement): void {
  if (!element.hasAttribute(PRIOR_TOUCH_ACTION_ATTRIBUTE)) {
    element.setAttribute(
      PRIOR_TOUCH_ACTION_ATTRIBUTE,
      element.style.touchAction
    );
  }
  element.style.touchAction = 'none';
}

/**
 * Restores the inline `touch-action` value the element had before
 * setElementTouchActionNone. No-op for elements that were never enabled.
 */
export function restoreElementTouchAction(element: HTMLDivElement): void {
  if (!element.hasAttribute(PRIOR_TOUCH_ACTION_ATTRIBUTE)) {
    return;
  }
  element.style.touchAction = element.getAttribute(
    PRIOR_TOUCH_ACTION_ATTRIBUTE
  );
  element.removeAttribute(PRIOR_TOUCH_ACTION_ATTRIBUTE);
}
