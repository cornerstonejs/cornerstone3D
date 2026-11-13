import { getUseGenericViewport } from '@cornerstonejs/core';
import { getGenericViewportOverrideActive } from './exampleParameters';

const BADGE_ID = 'cs3d-next-viewport-badge';

const BADGE_STYLES: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  right: '8px',
  bottom: '8px',
  zIndex: '9999',
  padding: '3px 8px',
  border: '1px solid rgba(255, 255, 255, 0.6)',
  borderRadius: '4px',
  background: 'rgba(29, 78, 216, 0.92)',
  color: '#fff',
  font: '12px/16px Helvetica, Arial, sans-serif',
  pointerEvents: 'none',
  userSelect: 'none',
};

/**
 * Shows a badge at the bottom right of an example page while the example runs
 * on the next viewports, and removes the badge otherwise.
 *
 * The badge follows the state of the core and not only the address of the
 * page: the override (`?type=next` or the example global) must be active and
 * the core must report `getUseGenericViewport()`. Call it after the core is
 * initialized. Each call updates the same badge, so an example that
 * initializes again does not add a second one.
 *
 * The badge takes no pointer events, so a tool under it still gets the mouse.
 * It is a fixed element outside every viewport element, so it changes no
 * layout and it is not part of a canvas that a test compares.
 */
export default function updateNextViewportBadge(): void {
  const isActive =
    getGenericViewportOverrideActive() && getUseGenericViewport();
  const existingBadge = document.getElementById(BADGE_ID);

  if (!isActive) {
    existingBadge?.remove();
    return;
  }

  if (existingBadge) {
    return;
  }

  const badge = document.createElement('div');

  badge.id = BADGE_ID;
  badge.textContent = 'Next viewports';
  Object.assign(badge.style, BADGE_STYLES);
  document.body.appendChild(badge);
}
