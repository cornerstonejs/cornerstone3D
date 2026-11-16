/**
 * Inline styles applied to an enabled viewport element so the browser does not
 * consume touch input before cornerstone tools receive it, each paired with the
 * data attribute used to remember the element's prior inline value.
 *
 * `touch-action: none` stops scrolling and pinch/double-tap zoom, but it does
 * not cover text selection or the iOS text-magnifier loupe. Without the
 * selection properties every hold-and-press interaction (Magnify,
 * AdvancedMagnify's long-press zoom-factor picker) competes with the OS, and
 * the threshold at which the OS wins is not predictable. `-webkit-user-select`
 * is listed alongside the standard property because iOS Safari still requires
 * the prefixed form.
 *
 * As with `touch-action`, none of these have behaviour worth preserving over a
 * viewport: there is no text to select and no callout worth showing.
 */
const MANAGED_PROPERTIES = [
  { name: 'touch-action', attribute: 'data-prior-touch-action' },
  { name: 'user-select', attribute: 'data-prior-user-select' },
  { name: '-webkit-user-select', attribute: 'data-prior-webkit-user-select' },
  {
    name: '-webkit-touch-callout',
    attribute: 'data-prior-webkit-touch-callout',
  },
] as const;

/**
 * Suppresses the browser's own touch handling on an enabled viewport element
 * so gestures reach cornerstone tools intact. The prior inline value of each
 * property is stored on the element so disable can restore it.
 *
 * Safe to call more than once: the stored values are only captured the first
 * time, so a repeated call cannot overwrite them with the suppressed values.
 */
export function setElementTouchActionNone(element: HTMLDivElement): void {
  MANAGED_PROPERTIES.forEach(({ name, attribute }) => {
    if (!element.hasAttribute(attribute)) {
      element.setAttribute(attribute, element.style.getPropertyValue(name));
    }

    element.style.setProperty(name, 'none');
  });
}

/**
 * Restores the inline values the element had before
 * {@link setElementTouchActionNone}. No-op for elements that were never
 * enabled, and for any property that was not previously set inline the
 * declaration is removed rather than left as an empty string.
 */
export function restoreElementTouchAction(element: HTMLDivElement): void {
  MANAGED_PROPERTIES.forEach(({ name, attribute }) => {
    if (!element.hasAttribute(attribute)) {
      return;
    }

    const priorValue = element.getAttribute(attribute);

    if (priorValue) {
      element.style.setProperty(name, priorValue);
    } else {
      element.style.removeProperty(name);
    }

    element.removeAttribute(attribute);
  });
}
