/** CSS for the viewport fidelity indicator (.fi-*). */
export const FIDELITY_INDICATOR_CSS = `/*
 * Text-only product indicator in the top-right. .fi-root has data-state
 * (loading | lod | lossy) only while the label shows.
 */

.fi-root {
  display: flex;
  flex-direction: row;
  align-items: center;
  pointer-events: auto;
}

/* No label: not hoverable (avoids a floating tooltip). */
.fi-root:not([data-state]) {
  pointer-events: none;
}

/* Permanent clinician label (FIDELITY-UI-2): bright red on black. */
.fi-label {
  display: none;
  flex-shrink: 0;
  padding: 4px 8px;
  font: 600 12px/1.2 system-ui, sans-serif;
  color: #ff2020;
  background: #000;
  white-space: nowrap;
  pointer-events: none;
}

.fi-root[data-state] .fi-label {
  display: block;
}

/* Product fidelity tooltip (label hover). Clinician copy (FIDELITY-UI-5). */
.fi-details {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  margin: 4px 0 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.85);
  border-radius: 4px;
  color: #fff;
  font: 12px/1.35 system-ui, sans-serif;
  text-align: left;
  white-space: pre-wrap;
  pointer-events: none;
  z-index: 1;
  max-width: 240px;
}

.fi-root[data-hover='true'] .fi-details {
  display: block;
}
`;

let injected = false;

/** Injects the fidelity-indicator CSS once into document.head. */
export function ensureFidelityIndicatorStyles(): void {
  if (injected || typeof document === 'undefined') {
    return;
  }
  injected = true;
  const style = document.createElement('style');
  style.setAttribute('data-fidelity-indicator', '');
  style.textContent = FIDELITY_INDICATOR_CSS;
  document.head.appendChild(style);
}
